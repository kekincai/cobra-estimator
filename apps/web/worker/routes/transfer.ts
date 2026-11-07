import { and, desc, eq, like } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { Hono } from 'hono';
import { z } from 'zod';
import type { TransferImportResponse } from '../../shared/types';
import { audit } from '../audit';
import { requireRole } from '../auth';
import { auditLog, factors, groups, projects, submissions } from '../db/schema';
import { MODEL_ID, type AppEnv } from '../env';

// JSON / CSV / 旧 XML の解析・衝突処理はブラウザ側（Workers 無料枠は CPU 10 ms）。
// ここでは確定した差分の整合性を確かめ、D1 の 1 回の batch で登録する。

const triangle = z.object({ expert: z.string().min(1), best: z.number(), likely: z.number(), worst: z.number() });
const levelTexts = z.tuple([z.string(), z.string(), z.string(), z.string()]);
const factorInsert = z.object({
  id: z.string().min(1).max(64),
  no: z.number().int().positive(),
  name: z.string().trim().min(1).max(80),
  category: z.string().max(40),
  kind: z.enum(['direct', 'indirect']),
  targetFactorId: z.string().nullable(),
  definition: z.string().max(2000),
  levels: levelTexts,
  origin: z.enum(['standard', 'custom']),
  triangles: z.array(triangle).max(20),
});
const factorUpdate = factorInsert.omit({ id: true, no: true, name: true }).partial().extend({ id: z.string().min(1) });
const projectInsert = z.object({
  id: z.string().trim().min(1).max(64),
  groupId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  sizeFP: z.number().positive(),
  effortMM: z.number().positive(),
  levels: z.record(z.string(), z.number().int().min(0).max(3)),
  note: z.string().max(2000),
  adopted: z.boolean(),
  excludedReason: z.string().nullable(),
});
export const importRequest = z.object({
  source: z.object({
    kind: z.enum(['json', 'xml', 'csv']),
    fileName: z.string().max(260),
    exportedBy: z.string().nullable().optional(),
    exportedAt: z.string().nullable().optional(),
  }),
  groups: z.array(z.object({ id: z.string().trim().min(1).max(16), name: z.string().max(80) })).max(26),
  factorsInsert: z.array(factorInsert).max(100),
  factorsUpdate: z.array(factorUpdate).max(100),
  projects: z.array(projectInsert).max(1000),
});

/** D1 は 1 文あたりのバインド変数が 100 まで。複数行 INSERT をこの行数ずつに分ける。 */
const ROWS_PER_INSERT = 9;
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

class ImportError extends Error {}

export const transferRoute = new Hono<AppEnv>()
  .post('/audit', requireRole(), async (c) => {
    const body = z.object({ action: z.enum(['import', 'export']), detail: z.unknown() }).parse(await c.req.json());
    await audit(c, `transfer.${body.action}`, body.detail);
    return c.json({ ok: true });
  })
  /** 取り込み・書き出し・送付の履歴（監査ログから） */
  .get('/history', async (c) =>
    c.json(
      await c.var.db
        .select()
        .from(auditLog)
        .where(like(auditLog.action, 'transfer.%'))
        .orderBy(desc(auditLog.id))
        .limit(20),
    ),
  )
  /** 取り込み確定: 要因の追加・上書き、グループ・実績の追加を 1 回の batch で */
  .post('/import', requireRole(), async (c) => {
    const parsed = importRequest.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: `取り込み内容が不正です: ${parsed.error.issues[0]?.message ?? ''}` }, 400);
    const body = parsed.data;
    const user = c.var.user!;
    // 要因を変えるのはモデル管理者、実績の登録は PMO（admin はどちらも可）
    if ((body.factorsInsert.length || body.factorsUpdate.length) && user.role !== 'admin') return c.json({ error: '要因の取り込みはモデル管理者のみです' }, 403);
    if ((body.projects.length || body.groups.length) && user.role !== 'admin' && user.role !== 'pmo') return c.json({ error: '実績の取り込みは PMO またはモデル管理者のみです' }, 403);
    if (!body.factorsInsert.length && !body.factorsUpdate.length && !body.projects.length) return c.json({ error: '取り込むものがありません' }, 400);

    const db = c.var.db;
    const [fs, ps, gs] = await Promise.all([
      db.select({ id: factors.id, name: factors.name, kind: factors.kind, targetFactorId: factors.targetFactorId }).from(factors).where(eq(factors.modelId, MODEL_ID)),
      db.select({ id: projects.id }).from(projects),
      db.select({ id: groups.id }).from(groups),
    ]);

    try {
      // --- 整合性チェック ---
      const final = new Map(fs.map((f) => [f.id, { name: f.name, kind: f.kind, target: f.targetFactorId }]));
      const names = new Set(fs.map((f) => f.name));
      for (const u of body.factorsUpdate) {
        const cur = final.get(u.id);
        if (!cur) throw new ImportError(`上書きする要因 ${u.id} がありません`);
        final.set(u.id, { name: cur.name, kind: u.kind ?? cur.kind, target: u.targetFactorId !== undefined ? u.targetFactorId : cur.target });
      }
      for (const f of body.factorsInsert) {
        if (final.has(f.id)) throw new ImportError(`要因 ID ${f.id} が重複しています`);
        if (names.has(f.name)) throw new ImportError(`要因「${f.name}」はすでにあります`);
        names.add(f.name);
        final.set(f.id, { name: f.name, kind: f.kind, target: f.targetFactorId });
      }
      const claimed = new Set<string>();
      for (const [, f] of final) {
        if (f.kind === 'direct' || !f.target) continue;
        const t = final.get(f.target);
        if (!t || t.kind !== 'direct') throw new ImportError(`間接要因「${f.name}」の対象が直接要因ではありません`);
        if (claimed.has(f.target)) throw new ImportError(`直接要因「${t.name}」に間接要因が 2 つになります`);
        claimed.add(f.target);
      }
      const groupIds = new Set(gs.map((g) => g.id));
      for (const g of body.groups) {
        if (groupIds.has(g.id)) throw new ImportError(`グループ ${g.id} はすでにあります`);
        groupIds.add(g.id);
      }
      const pjIds = new Set(ps.map((p) => p.id));
      for (const p of body.projects) {
        if (pjIds.has(p.id)) throw new ImportError(`プロジェクト ID ${p.id} はすでにあります`);
        pjIds.add(p.id);
        if (!groupIds.has(p.groupId)) throw new ImportError(`グループ ${p.groupId} がありません`);
        for (const fid of Object.keys(p.levels)) if (!final.has(fid)) throw new ImportError(`実績 ${p.id} のレベル値に不明な要因 ${fid} があります`);
      }
    } catch (e) {
      if (e instanceof ImportError) return c.json({ error: e.message }, 409);
      throw e;
    }

    // --- 1 回の batch で登録（途中で失敗すればすべて取り消し） ---
    const now = new Date().toISOString();
    const stmts: BatchItem<'sqlite'>[] = [];
    for (const rows of chunk(body.groups, ROWS_PER_INSERT)) stmts.push(db.insert(groups).values(rows.map((g) => ({ ...g, modelId: MODEL_ID }))));
    for (const rows of chunk(body.factorsInsert, ROWS_PER_INSERT)) stmts.push(db.insert(factors).values(rows.map((f) => ({ ...f, modelId: MODEL_ID }))));
    for (const { id, ...set } of body.factorsUpdate)
      stmts.push(db.update(factors).set({ ...set, updatedAt: now }).where(and(eq(factors.id, id), eq(factors.modelId, MODEL_ID))));
    for (const rows of chunk(body.projects, ROWS_PER_INSERT)) stmts.push(db.insert(projects).values(rows.map((p) => ({ ...p, modelId: MODEL_ID }))));
    const result: TransferImportResponse = {
      ok: true,
      factorsAdded: body.factorsInsert.length,
      factorsUpdated: body.factorsUpdate.length,
      projectsAdded: body.projects.length,
      groupsAdded: body.groups.length,
    };
    stmts.push(
      db.insert(auditLog).values({
        actor: user.email,
        action: 'transfer.import',
        detail: { ...body.source, factorsAdded: result.factorsAdded, factorsUpdated: result.factorsUpdated, projectsAdded: result.projectsAdded, groupsAdded: result.groupsAdded, projectIds: body.projects.slice(0, 50).map((p) => p.id) },
      }),
    );
    await db.batch(stmts as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
    return c.json(result, 201);
  })
  .get('/submissions', requireRole(), async (c) => c.json(await c.var.db.select().from(submissions).orderBy(desc(submissions.createdAt))))
  .post('/submissions', requireRole(), async (c) => {
    const body = z.object({ modelVersionId: z.string(), payload: z.unknown(), note: z.string().max(2000).default('') }).parse(await c.req.json());
    // 実績データは機密: 標準データ側へのアップロードには決して含めない（§8）
    const payload = body.payload && typeof body.payload === 'object' ? { ...(body.payload as Record<string, unknown>) } : (body.payload ?? null);
    if (payload && typeof payload === 'object' && 'projects' in payload) delete (payload as Record<string, unknown>).projects;
    const id = crypto.randomUUID();
    await c.var.db.insert(submissions).values({ id, modelVersionId: body.modelVersionId, note: body.note, payload, submittedBy: c.var.user!.email });
    await audit(c, 'transfer.submit', { id, modelVersionId: body.modelVersionId });
    return c.json({ id }, 201);
  });
