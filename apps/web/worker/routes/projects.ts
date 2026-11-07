import { and, asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { audit } from '../audit';
import { requireRole } from '../auth';
import { groups, projects } from '../db/schema';
import { MODEL_ID, type AppEnv } from '../env';
import type { Context } from 'hono';

const fields = {
  id: z.string().optional(),
  groupId: z.string().min(1).max(16),
  name: z.string().trim().min(1),
  sizeFP: z.number().positive(),
  effortMM: z.number().positive(),
  levels: z.record(z.string(), z.number().int().min(0).max(3)),
  note: z.string(),
  adopted: z.boolean(),
  excludedReason: z.string().nullable(),
};

/** 新規登録（省略時の既定値あり） */
export const projectInput = z.object({
  ...fields,
  groupId: fields.groupId.default('A'),
  note: fields.note.default(''),
  adopted: fields.adopted.default(true),
  excludedReason: fields.excludedReason.default(null),
});

/** 部分更新。既定値を持たせない（送らなかった項目を既定値で上書きしないため） */
export const projectPatch = z.object(fields).omit({ id: true }).partial();

/** 次の連番 ID（PJ-013 など） */
async function nextProjectId(c: Context<AppEnv>): Promise<string> {
  const rows = await c.var.db.select({ id: projects.id }).from(projects).where(eq(projects.modelId, MODEL_ID));
  const max = rows.reduce((m, r) => {
    const n = /^PJ-(\d+)$/.exec(r.id)?.[1];
    return n ? Math.max(m, Number(n)) : m;
  }, 0);
  return `PJ-${String(max + 1).padStart(3, '0')}`;
}

/** グループが未登録なら作る（「新しいグループ」で保存したとき） */
async function ensureGroup(c: Context<AppEnv>, groupId: string | undefined) {
  if (!groupId) return;
  const g = await c.var.db.select().from(groups).where(and(eq(groups.id, groupId), eq(groups.modelId, MODEL_ID))).get();
  if (!g) await c.var.db.insert(groups).values({ id: groupId, modelId: MODEL_ID, name: `グループ ${groupId}` });
}

export const projectsRoute = new Hono<AppEnv>()
  .get('/', async (c) => c.json(await c.var.db.select().from(projects).where(eq(projects.modelId, MODEL_ID)).orderBy(asc(projects.id))))
  .get('/:id', async (c) => {
    const row = await c.var.db.select().from(projects).where(and(eq(projects.id, c.req.param('id')), eq(projects.modelId, MODEL_ID))).get();
    return row ? c.json(row) : c.json({ error: 'not found' }, 404);
  })
  .post('/', requireRole('pmo'), async (c) => {
    const body = projectInput.parse(await c.req.json());
    const id = body.id ?? (await nextProjectId(c));
    await ensureGroup(c, body.groupId);
    await c.var.db.insert(projects).values({ ...body, id, modelId: MODEL_ID });
    await audit(c, 'project.create', { id });
    return c.json({ id }, 201);
  })
  .put('/:id', requireRole('pmo'), async (c) => {
    const body = projectPatch.parse(await c.req.json());
    const id = c.req.param('id');
    await ensureGroup(c, body.groupId);
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
