import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { audit } from '../audit';
import { requireRole } from '../auth';
import { factors } from '../db/schema';
import { MODEL_ID, type AppEnv } from '../env';

const factorInput = z.object({
  no: z.number().int().positive(),
  name: z.string().min(1),
  category: z.string(),
  kind: z.enum(['direct', 'indirect']),
  targetFactorId: z.string().nullable().optional(),
  definition: z.string().default(''),
  levels: z.tuple([z.string(), z.string(), z.string(), z.string()]),
  origin: z.enum(['standard', 'custom']).default('custom'),
  triangles: z.array(z.object({ expert: z.string(), best: z.number(), likely: z.number(), worst: z.number() })),
});

export const factorsRoute = new Hono<AppEnv>()
  .get('/', async (c) => c.json(await c.var.db.select().from(factors).where(eq(factors.modelId, MODEL_ID))))
  .post('/', requireRole('admin'), async (c) => {
    const body = factorInput.parse(await c.req.json());
    const id = crypto.randomUUID();
    await c.var.db.insert(factors).values({ ...body, id, modelId: MODEL_ID, targetFactorId: body.targetFactorId ?? null });
    await audit(c, 'factor.create', { id, name: body.name });
    return c.json({ id }, 201);
  })
  .put('/:id', requireRole('admin'), async (c) => {
    const body = factorInput.partial().parse(await c.req.json());
    const id = c.req.param('id');
    await c.var.db.update(factors).set({ ...body, updatedAt: new Date().toISOString() }).where(and(eq(factors.id, id), eq(factors.modelId, MODEL_ID)));
    await audit(c, 'factor.update', { id });
    return c.json({ ok: true });
  })
  .delete('/:id', requireRole('admin'), async (c) => {
    const id = c.req.param('id');
    await c.var.db.delete(factors).where(and(eq(factors.id, id), eq(factors.modelId, MODEL_ID)));
    await audit(c, 'factor.delete', { id });
    return c.json({ ok: true });
  });
