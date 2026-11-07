import { and, asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { audit } from '../audit';
import { requireRole } from '../auth';
import { projects } from '../db/schema';
import { MODEL_ID, type AppEnv } from '../env';

export const projectInput = z.object({
  id: z.string().optional(),
  groupId: z.string().default('A'),
  name: z.string().min(1),
  sizeFP: z.number().positive(),
  effortMM: z.number().positive(),
  levels: z.record(z.string(), z.number().int().min(0).max(3)),
  note: z.string().default(''),
  adopted: z.boolean().default(true),
  excludedReason: z.string().nullable().default(null),
});

export const projectsRoute = new Hono<AppEnv>()
  .get('/', async (c) => c.json(await c.var.db.select().from(projects).where(eq(projects.modelId, MODEL_ID)).orderBy(asc(projects.id))))
  .get('/:id', async (c) => {
    const row = await c.var.db.select().from(projects).where(and(eq(projects.id, c.req.param('id')), eq(projects.modelId, MODEL_ID))).get();
    return row ? c.json(row) : c.json({ error: 'not found' }, 404);
  })
  .post('/', requireRole('pmo'), async (c) => {
    const body = projectInput.parse(await c.req.json());
    const id = body.id ?? `PJ-${Date.now().toString(36).toUpperCase()}`;
    await c.var.db.insert(projects).values({ ...body, id, modelId: MODEL_ID });
    await audit(c, 'project.create', { id });
    return c.json({ id }, 201);
  })
  .put('/:id', requireRole('pmo'), async (c) => {
    const body = projectInput.partial().parse(await c.req.json());
    const id = c.req.param('id');
    await c.var.db.update(projects).set({ ...body, updatedAt: new Date().toISOString() }).where(and(eq(projects.id, id), eq(projects.modelId, MODEL_ID)));
    await audit(c, 'project.update', { id });
    return c.json({ ok: true });
  })
  .delete('/:id', requireRole('pmo'), async (c) => {
    const id = c.req.param('id');
    await c.var.db.delete(projects).where(and(eq(projects.id, id), eq(projects.modelId, MODEL_ID)));
    await audit(c, 'project.delete', { id });
    return c.json({ ok: true });
  });
