import { and, asc, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { audit } from '../audit';
import { requireRole } from '../auth';
import { factors, groups, modelVersions, models } from '../db/schema';
import { MODEL_ID, type AppEnv } from '../env';

const versionInput = z.object({
  expertMode: z.union([z.object({ kind: z.literal('average') }), z.object({ kind: z.literal('expert'), expert: z.string() })]),
  groupId: z.string().nullable(),
  runs: z.number().int().positive(),
  seed: z.number().int(),
  alpha: z.number().positive(),
  ci95: z.tuple([z.number(), z.number()]),
  mmre: z.number(),
  pred25: z.number(),
  n: z.number().int(),
  loo: z.array(z.any()),
  inconsistencies: z.array(z.any()),
  activate: z.boolean().default(false),
});

export const modelRoute = new Hono<AppEnv>()
  /** モデル全体（要因・グループ・版） */
  .get('/', async (c) => {
    const db = c.var.db;
    const [model, fs, gs, vs] = await Promise.all([
      db.select().from(models).where(eq(models.id, MODEL_ID)).get(),
      db.select().from(factors).where(eq(factors.modelId, MODEL_ID)).orderBy(asc(factors.no)),
      db.select().from(groups).where(eq(groups.modelId, MODEL_ID)),
      db.select().from(modelVersions).where(eq(modelVersions.modelId, MODEL_ID)).orderBy(desc(modelVersions.version)),
    ]);
    if (!model) return c.json({ error: 'モデルがありません' }, 404);
    return c.json({ model, factors: fs, groups: gs, versions: vs, activeVersion: vs.find((v) => v.active) ?? null });
  })
  /** 構築結果を新しい版として保存（計算はブラウザ側） */
  .post('/versions', requireRole('admin'), async (c) => {
    const body = versionInput.parse(await c.req.json());
    const db = c.var.db;
    const last = await db.select().from(modelVersions).where(eq(modelVersions.modelId, MODEL_ID)).orderBy(desc(modelVersions.version)).get();
    const fs = await db.select().from(factors).where(eq(factors.modelId, MODEL_ID));
    const id = crypto.randomUUID();
    const version = (last?.version ?? 0) + 1;
    if (body.activate) await db.update(modelVersions).set({ active: false }).where(eq(modelVersions.modelId, MODEL_ID));
    await db.insert(modelVersions).values({
      id, modelId: MODEL_ID, version, builtBy: c.var.user!.name, expertMode: body.expertMode, groupId: body.groupId,
      runs: body.runs, seed: body.seed, alpha: body.alpha, ciLo: body.ci95[0], ciHi: body.ci95[1], mmre: body.mmre,
      pred25: body.pred25, n: body.n, loo: body.loo, inconsistencies: body.inconsistencies, factorsSnapshot: fs, active: body.activate,
    });
    await audit(c, 'model.build', { version, alpha: body.alpha });
    return c.json({ id, version }, 201);
  })
  .post('/versions/:id/activate', requireRole('admin'), async (c) => {
    const id = c.req.param('id');
    const db = c.var.db;
    await db.update(modelVersions).set({ active: false }).where(eq(modelVersions.modelId, MODEL_ID));
    await db.update(modelVersions).set({ active: true }).where(and(eq(modelVersions.modelId, MODEL_ID), eq(modelVersions.id, id)));
    await audit(c, 'model.activate', { id });
    return c.json({ ok: true });
  });
