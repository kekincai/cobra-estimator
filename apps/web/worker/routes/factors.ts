import { and, asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { checkFactorRules, type FactorRef } from '../../shared/factor-rules';
import { audit } from '../audit';
import { requireRole } from '../auth';
import { factors } from '../db/schema';
import { MODEL_ID, type AppEnv } from '../env';

const triangle = z.object({ expert: z.string().min(1), best: z.number(), likely: z.number(), worst: z.number() });

const factorInput = z.object({
  /** 省略時は末尾の番号を振る */
  no: z.number().int().positive().optional(),
  name: z.string().trim().min(1),
  category: z.string(),
  kind: z.enum(['direct', 'indirect']),
  targetFactorId: z.string().nullable().optional(),
  definition: z.string().default(''),
  levels: z.tuple([z.string(), z.string(), z.string(), z.string()]),
  origin: z.enum(['standard', 'custom']).default('custom'),
  triangles: z.array(triangle),
});

const bad = (msg: string) => ({ error: msg });

function triangleError(ts: z.infer<typeof triangle>[]): string | null {
  for (const t of ts) {
    if (!(t.best <= t.likely && t.likely <= t.worst)) return `担当者「${t.expert}」の三角分布は 最良 ≤ 最頻 ≤ 最悪 の順にしてください。`;
    if (t.best < 0) return `担当者「${t.expert}」の三角分布に負の値があります。`;
  }
  return null;
}

const refOf = (f: { id: string; name: string; kind: 'direct' | 'indirect'; targetFactorId: string | null }): FactorRef => ({
  id: f.id, name: f.name, kind: f.kind, targetFactorId: f.kind === 'direct' ? null : f.targetFactorId,
});

export const factorsRoute = new Hono<AppEnv>()
  .get('/', async (c) => c.json(await c.var.db.select().from(factors).where(eq(factors.modelId, MODEL_ID)).orderBy(asc(factors.no))))
  .post('/', requireRole('admin'), async (c) => {
    const parsed = factorInput.safeParse(await c.req.json());
    if (!parsed.success) return c.json(bad('入力が正しくありません。'), 400);
    const body = parsed.data;
    const triErr = triangleError(body.triangles);
    if (triErr) return c.json(bad(triErr), 400);
    const db = c.var.db;
    const existing = await db.select().from(factors).where(eq(factors.modelId, MODEL_ID));
    if (existing.some((f) => f.name === body.name.trim())) return c.json(bad(`「${body.name}」は既にモデルにあります。`), 400);
    const id = crypto.randomUUID();
    const targetFactorId = body.kind === 'indirect' ? (body.targetFactorId ?? null) : null;
    const ruleErr = checkFactorRules([...existing.map(refOf), { id, name: body.name, kind: body.kind, targetFactorId }]);
    if (ruleErr) return c.json(bad(ruleErr), 400);
    const no = body.no ?? existing.reduce((m, f) => Math.max(m, f.no), 0) + 1;
    await db.insert(factors).values({ ...body, no, id, modelId: MODEL_ID, targetFactorId });
    await audit(c, 'factor.create', { id, name: body.name });
    return c.json({ id, no }, 201);
  })
  .put('/:id', requireRole('admin'), async (c) => {
    const parsed = factorInput.partial().safeParse(await c.req.json());
    if (!parsed.success) return c.json(bad('入力が正しくありません。'), 400);
    const body = parsed.data;
    const id = c.req.param('id');
    const db = c.var.db;
    const existing = await db.select().from(factors).where(eq(factors.modelId, MODEL_ID));
    const cur = existing.find((f) => f.id === id);
    if (!cur) return c.json(bad('要因が見つかりません。'), 404);
    if (body.triangles) {
      const triErr = triangleError(body.triangles);
      if (triErr) return c.json(bad(triErr), 400);
    }
    if (body.name !== undefined && existing.some((f) => f.id !== id && f.name === body.name)) return c.json(bad(`「${body.name}」は既にモデルにあります。`), 400);
    const kind = body.kind ?? cur.kind;
    const targetFactorId = kind === 'indirect' ? (body.targetFactorId !== undefined ? body.targetFactorId : cur.targetFactorId) : null;
    const next = existing.map((f) => (f.id === id ? { ...f, name: body.name ?? f.name, kind, targetFactorId } : f));
    const ruleErr = checkFactorRules(next.map(refOf));
    if (ruleErr) return c.json(bad(ruleErr), 400);
    await db
      .update(factors)
      .set({ ...body, targetFactorId, updatedAt: new Date().toISOString() })
      .where(and(eq(factors.id, id), eq(factors.modelId, MODEL_ID)));
    await audit(c, 'factor.update', { id });
    return c.json({ ok: true });
  })
  .delete('/:id', requireRole('admin'), async (c) => {
    const id = c.req.param('id');
    const db = c.var.db;
    const existing = await db.select().from(factors).where(eq(factors.modelId, MODEL_ID)).orderBy(asc(factors.no));
    const cur = existing.find((f) => f.id === id);
    if (!cur) return c.json(bad('要因が見つかりません。'), 404);
    const dependent = existing.find((f) => f.kind === 'indirect' && f.targetFactorId === id);
    if (dependent) return c.json(bad(`間接要因「${dependent.name}」がこの要因を強めているため削除できません。先に「${dependent.name}」を削除するか、対象を変えてください。`), 400);
    await db.delete(factors).where(and(eq(factors.id, id), eq(factors.modelId, MODEL_ID)));
    // 番号を 01 から詰め直す（レベル値は要因 ID で持つので影響しない）
    const rest = existing.filter((f) => f.id !== id);
    await Promise.all(rest.map((f, i) => (f.no === i + 1 ? null : db.update(factors).set({ no: i + 1 }).where(eq(factors.id, f.id)))));
    await audit(c, 'factor.delete', { id, name: cur.name });
    return c.json({ ok: true });
  });
