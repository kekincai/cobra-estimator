import { and, asc, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { audit } from '../audit';
import { requireRole } from '../auth';
import { estimates, generations } from '../db/schema';
import { MODEL_ID, type AppEnv } from '../env';

export const MAX_GENERATIONS = 5;

const generationInput = z.object({
  name: z.string().default(''),
  sizeFP: z.number().positive(),
  levels: z.record(z.string(), z.number().int().min(0).max(3)),
  notes: z.record(z.string(), z.string()).default({}),
  runs: z.number().int().positive(),
  seed: z.number().int(),
  modelVersionId: z.string().nullable(),
  results: z.unknown(),
});

export const estimatesRoute = new Hono<AppEnv>()
  .get('/', async (c) => c.json(await c.var.db.select().from(estimates).where(eq(estimates.modelId, MODEL_ID)).orderBy(desc(estimates.updatedAt))))
  .get('/:id', async (c) => {
    const id = c.req.param('id');
    const db = c.var.db;
    const est = await db.select().from(estimates).where(and(eq(estimates.id, id), eq(estimates.modelId, MODEL_ID))).get();
    if (!est) return c.json({ error: 'not found' }, 404);
    const gens = await db.select().from(generations).where(eq(generations.estimateId, id)).orderBy(asc(generations.createdAt));
    return c.json({ ...est, generations: gens });
  })
  .post('/', requireRole('estimator'), async (c) => {
    const body = z.object({ name: z.string().min(1), budget: z.number().nullable().default(null) }).parse(await c.req.json());
    const id = crypto.randomUUID();
    await c.var.db.insert(estimates).values({ id, modelId: MODEL_ID, ...body });
    await audit(c, 'estimate.create', { id });
    return c.json({ id }, 201);
  })
  .put('/:id', requireRole('estimator'), async (c) => {
    const body = z.object({ name: z.string().min(1), budget: z.number().nullable(), reportGenerationId: z.string().nullable() }).partial().parse(await c.req.json());
    await c.var.db.update(estimates).set({ ...body, updatedAt: new Date().toISOString() }).where(and(eq(estimates.id, c.req.param('id')), eq(estimates.modelId, MODEL_ID)));
    return c.json({ ok: true });
  })
  /** 世代を追加。5 世代を超えたら最古を削除。 */
  .post('/:id/generations', requireRole('estimator'), async (c) => {
    const estimateId = c.req.param('id');
    const body = generationInput.parse(await c.req.json());
    const db = c.var.db;
    const gens = await db.select().from(generations).where(eq(generations.estimateId, estimateId)).orderBy(asc(generations.createdAt));
    if (gens.length >= MAX_GENERATIONS) await db.delete(generations).where(eq(generations.id, gens[0]!.id));
    const lastNo = gens.reduce((m, g) => Math.max(m, Number(g.label.slice(1)) || 0), 0);
    const id = crypto.randomUUID();
    await db.insert(generations).values({ ...body, id, estimateId, label: `G${lastNo + 1}` });
    await db.update(estimates).set({ updatedAt: new Date().toISOString() }).where(eq(estimates.id, estimateId));
    await audit(c, 'estimate.run', { estimateId, generation: id });
    return c.json({ id, label: `G${lastNo + 1}` }, 201);
  });
