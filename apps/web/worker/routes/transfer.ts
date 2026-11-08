import { and, desc, eq, like } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { Hono } from 'hono';
import { z } from 'zod';
import type { SubmissionRow, TransferImportResponse } from '../../shared/types';
import { audit } from '../audit';
import { requireRole } from '../auth';
import { auditLog, factors, groups, projects, submissions } from '../db/schema';
import { MODEL_ID, type AppEnv, type User } from '../env';

// JSON / CSV / 旧 XML の解析・衝突処理はブラウザ側（Workers 無料枠は CPU 10 ms）。
// ここでは確定した差分の整合性を確かめ、D1 の 1 回の batch で登録する。

/** プロジェクト名の上限（routes/projects.ts と同じ。別経路で長い名前が入らないように） */
export const PROJECT_NAME_MAX = 100;

/** 三角分布は 最良 ≤ 最頻 ≤ 最悪（ブラウザ側の検証をすり抜けた入力もここで止める） */
export const triangle = z
  .object({ expert: z.string().min(1), best: z.number(), likely: z.number(), worst: z.number() })
  .refine((t) => t.best <= t.likely && t.likely <= t.worst, { error: '三角分布は 最良 ≤ 最頻 ≤ 最悪 の順にしてください', path: ['likely'] });
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
  name: z.string().trim().min(1).max(PROJECT_NAME_MAX, { error: `プロジェクト名は ${PROJECT_NAME_MAX} 文字までです` }),
  sizeFP: z.number().positive(),
  effortMM: z.number().positive(),
  levels: z.record(z.string(), z.number().int().min(0).max(3)),
  note: z.string().max(2000),
  adopted: z.boolean(),
  excludedReason: z.string().nullable(),
});
/** 同じ ID の既存実績を取り込み内容で更新する（グループ・採用は変えない） */
const projectUpdate = projectInsert.pick({ id: true, name: true, sizeFP: true, effortMM: true, levels: true, note: true });
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
  projectsUpdate: z.array(projectUpdate).max(1000).default([]),
});

/** 取り込み要求の検証エラー → 「取り込み内容が不正です（要因「X」の三角分布 S.T.）: …」 */
export function importIssueMessage(issue: z.core.$ZodIssue | undefined, raw: unknown): string {
  if (!issue) return '取り込み内容が不正です';
  const [sec, i, field, j] = issue.path;
  const item = (k: PropertyKey, n: PropertyKey) => {
    const a = raw && typeof raw === 'object' ? (raw as Record<PropertyKey, unknown>)[k] : undefined;
    return Array.isArray(a) && typeof n === 'number' ? (a[n] as Record<string, unknown> | undefined) : undefined;
  };
  let where = '';
  if ((sec === 'factorsInsert' || sec === 'factorsUpdate') && typeof i === 'number') {
    const f = item(sec, i);
    const name = typeof f?.name === 'string' ? `要因「${f.name}」` : `要因 ${i + 1} 件目`;
    if (field === 'triangles' && typeof j === 'number') {
      const t = Array.isArray(f?.triangles) ? (f.triangles[j] as Record<string, unknown> | undefined) : undefined;
      where = `${name}の三角分布${typeof t?.expert === 'string' ? `（${t.expert}）` : ` ${j + 1} 件目`}`;
    } else where = name;
  } else if ((sec === 'projects' || sec === 'projectsUpdate') && typeof i === 'number') {
    const p = item(sec, i);
    where = `実績 ${typeof p?.id === 'string' ? p.id : `${i + 1} 件目`}`;
  }
  const msg = /[\u3040-\u30ff\u3400-\u9fff]/.test(issue.message) ? issue.message : '値が正しくありません';
  return `取り込み内容が不正です${where ? `（${where}）` : ''}: ${msg}`;
}

// ---- 管理者へのアップロード（申請）とレビュー ----

type SubmissionStatus = SubmissionRow['status'];
export const reviewBody = z.object({
  status: z.enum(['approved', 'rejected'], { error: '承認（approved）か却下（rejected）を指定してください' }),
  note: z.string().trim().max(2000, { error: 'コメントは 2,000 文字までです' }).optional(),
});

/** レビューしてよいか。問題があれば日本語のエラー、なければ null。 */
export function reviewGuard(current: SubmissionStatus | undefined, next: Exclude<SubmissionStatus, 'pending'>): string | null {
  if (!current) return 'この申請は見つかりません';
  if (current === next) return next === 'approved' ? 'この申請はすでに承認済みです' : 'この申請はすでに却下済みです';
  if (current !== 'pending') return `この申請はすでに${current === 'approved' ? '承認' : '却下'}されています。結果は変更できません`;
  return null;
}

/** 一覧に出す申請: 管理者はすべて、それ以外は自分の申請だけ */
export function visibleSubmissions<T extends { submittedBy: string }>(rows: T[], user: Pick<User, 'email' | 'role'>): T[] {
  return user.role === 'admin' ? rows : rows.filter((r) => r.submittedBy.toLowerCase() === user.email.toLowerCase());
}

export interface SubmissionReview {
  status: Exclude<SubmissionStatus, 'pending'>;
  note: string;
  at: string;
  by: string;
}

/** 監査ログ（transfer.review）からレビューのコメントを申請に付ける。新しいログを優先。 */
export function attachReviews<T extends { id: string }>(rows: T[], logs: { action: string; detail: unknown; at: string; actor: string }[]): (T & { review: SubmissionReview | null })[] {
  const byId = new Map<string, SubmissionReview>();
  for (const l of logs) {
    if (l.action !== 'transfer.review' || !l.detail || typeof l.detail !== 'object') continue;
    const d = l.detail as { id?: unknown; status?: unknown; note?: unknown };
    if (typeof d.id !== 'string' || byId.has(d.id)) continue;
    if (d.status !== 'approved' && d.status !== 'rejected') continue;
    byId.set(d.id, { status: d.status, note: typeof d.note === 'string' ? d.note : '', at: l.at, by: l.actor.split('@')[0] ?? '' });
  }
  return rows.map((r) => ({ ...r, review: byId.get(r.id) ?? null }));
}

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
    const body0: unknown = await c.req.json();
    const parsed = importRequest.safeParse(body0);
    if (!parsed.success) return c.json({ error: importIssueMessage(parsed.error.issues[0], body0) }, 400);
    const body = parsed.data;
    const user = c.var.user!;
    // 要因を変えるのはモデル管理者、実績の登録は PMO（admin はどちらも可）
    if ((body.factorsInsert.length || body.factorsUpdate.length) && user.role !== 'admin') return c.json({ error: '要因の取り込みはモデル管理者のみです' }, 403);
    if ((body.projects.length || body.projectsUpdate.length || body.groups.length) && user.role !== 'admin' && user.role !== 'pmo')
      return c.json({ error: '実績の取り込みは PMO またはモデル管理者のみです' }, 403);
    if (!body.factorsInsert.length && !body.factorsUpdate.length && !body.projects.length && !body.projectsUpdate.length) return c.json({ error: '取り込むものがありません' }, 400);

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
      const existingPj = new Set(ps.map((p) => p.id));
      const updatedPj = new Set<string>();
      for (const p of body.projectsUpdate) {
        if (!existingPj.has(p.id)) throw new ImportError(`更新する実績 ${p.id} がありません`);
        if (updatedPj.has(p.id)) throw new ImportError(`実績 ${p.id} の更新が重複しています`);
        updatedPj.add(p.id);
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
    for (const { id, ...set } of body.projectsUpdate)
      stmts.push(db.update(projects).set({ ...set, updatedAt: now }).where(and(eq(projects.id, id), eq(projects.modelId, MODEL_ID))));
    const result: TransferImportResponse & { projectsUpdated: number } = {
      ok: true,
      factorsAdded: body.factorsInsert.length,
      factorsUpdated: body.factorsUpdate.length,
      projectsAdded: body.projects.length,
      projectsUpdated: body.projectsUpdate.length,
      groupsAdded: body.groups.length,
    };
    stmts.push(
      db.insert(auditLog).values({
        actor: user.email,
        action: 'transfer.import',
        detail: {
          ...body.source,
          factorsAdded: result.factorsAdded,
          factorsUpdated: result.factorsUpdated,
          projectsAdded: result.projectsAdded,
          projectsUpdated: result.projectsUpdated,
          groupsAdded: result.groupsAdded,
          projectIds: body.projects.slice(0, 50).map((p) => p.id),
          updatedProjectIds: body.projectsUpdate.slice(0, 50).map((p) => p.id),
        },
      }),
    );
    await db.batch(stmts as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
    return c.json(result, 201);
  })
  /** 申請の一覧。管理者はすべて、それ以外は自分の申請だけ。レビューのコメント（監査ログ）付き。 */
  .get('/submissions', requireRole(), async (c) => {
    const db = c.var.db;
    const [rows, logs] = await Promise.all([
      db.select().from(submissions).orderBy(desc(submissions.createdAt)),
      db.select().from(auditLog).where(eq(auditLog.action, 'transfer.review')).orderBy(desc(auditLog.id)).limit(500),
    ]);
    return c.json(attachReviews(visibleSubmissions(rows, c.var.user!), logs));
  })
  /** 申請のレビュー（モデル管理者のみ）。コメントは submissions に列が無いので監査ログに残す。 */
  .put('/submissions/:id', requireRole('admin'), async (c) => {
    const id = c.req.param('id');
    const body = reviewBody.parse(await c.req.json());
    const db = c.var.db;
    const cur = await db.select({ status: submissions.status, submittedBy: submissions.submittedBy }).from(submissions).where(eq(submissions.id, id)).get();
    const err = reviewGuard(cur?.status, body.status);
    if (err) return c.json({ error: err }, cur ? 409 : 404);
    await db.update(submissions).set({ status: body.status }).where(and(eq(submissions.id, id), eq(submissions.status, 'pending')));
    await audit(c, 'transfer.review', { id, status: body.status, note: body.note ?? '', submittedBy: cur!.submittedBy.split('@')[0] });
    return c.json({ ok: true, status: body.status });
  })
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
