// モデルパラメータ JSON「estima-model/1」（IMPLEMENTATION_BRIEF.md §3.1）の zod スキーマ。
// 取り込み（JSON / 旧 XML を変換したもの）と書き出しの両方で使う。
//
// 取り決め:
// - projects[].levels[i] は、同じファイルの factors[i]（配列の順）のレベル値
// - 三角分布 l3 は [best, likely, worst]（L3 のときの工数増加率、0.26 = +26%）
import { z } from 'zod';

export const FORMAT = 'estima-model/1';

const rate = z.number().min(-1, { error: '増加率は −1 以上にしてください' }).max(10, { error: '増加率が大きすぎます (10 = +1000% まで)' });
const levelValue = z.number().int({ error: 'レベル値は整数です' }).min(0, { error: 'レベル値は 0〜3 です' }).max(3, { error: 'レベル値は 0〜3 です' });

export const factorSchema = z.object({
  no: z.number().int().positive({ error: '要因番号は 1 以上の整数です' }),
  name: z.string().trim().min(1, { error: '要因名が空です' }).max(80),
  category: z.string().default(''),
  kind: z.enum(['direct', 'indirect'], { error: 'kind は direct / indirect です' }),
  origin: z.enum(['standard', 'custom']).default('custom'),
  /** kind = indirect のとき強める直接要因の番号（relations と同じ意味。どちらか一方でよい） */
  targetNo: z.number().int().positive().nullable().optional(),
  definition: z.string().default(''),
  levels: z.tuple([z.string(), z.string(), z.string(), z.string()], { error: 'levels は L0〜L3 の 4 つの文字列です' }),
});

export const triangleSchema = z
  .object({
    factorNo: z.number().int().positive(),
    expert: z.string().trim().min(1, { error: '専門家名が空です' }),
    l3: z.tuple([rate, rate, rate], { error: 'l3 は [最良, 最頻, 最悪] の 3 つの数値です' }),
  })
  .refine((t) => t.l3[0] <= t.l3[1] && t.l3[1] <= t.l3[2], { error: '三角分布は 最良 ≤ 最頻 ≤ 最悪 の順です', path: ['l3'] });

export const relationSchema = z.object({
  indirectNo: z.number().int().positive(),
  directNo: z.number().int().positive(),
  k: z.number().positive().optional(),
});

export const projectSchema = z.object({
  id: z.string().trim().min(1, { error: 'プロジェクト ID が空です' }).max(60),
  name: z.string().trim().max(120).optional(),
  sizeFP: z.number().positive({ error: '規模は正の数です' }),
  effortMM: z.number().positive({ error: '工数は正の数です' }),
  levels: z.array(levelValue),
  groupId: z.string().optional(),
  note: z.string().default(''),
});

export const modelFileSchema = z
  .object({
    format: z.literal(FORMAT, { error: `format が "${FORMAT}" ではありません` }),
    exportedAt: z.string().optional(),
    exportedBy: z.string().optional(),
    model: z.object({
      name: z.string().default(''),
      version: z.number().int().optional(),
      alpha: z.number().positive().optional(),
      ci95: z.tuple([z.number(), z.number()]).optional(),
    }),
    groups: z.array(z.object({ id: z.string().trim().min(1), name: z.string().optional(), projects: z.number().int().optional() })).optional(),
    excluded: z.array(z.object({ projectId: z.string(), reason: z.string().default('') })).optional(),
    factors: z.array(factorSchema).max(100, { error: '要因は 100 件までです' }).default([]),
    triangles: z.array(triangleSchema).max(1000).default([]),
    relations: z.array(relationSchema).default([]),
    accuracy: z
      .object({
        mmre: z.number().optional(),
        pred25: z.number().optional(),
        loo: z.array(z.object({ projectId: z.string(), mre: z.number() })).optional(),
      })
      .optional(),
    projects: z.array(projectSchema).max(1000, { error: '実績は 1,000 件までです' }).optional(),
  })
  .superRefine((f, ctx) => {
    const byNo = new Map<number, (typeof f.factors)[number]>();
    const names = new Set<string>();
    f.factors.forEach((x, i) => {
      if (byNo.has(x.no)) ctx.addIssue({ code: 'custom', path: ['factors', i, 'no'], message: `要因番号 ${x.no} が重複しています` });
      if (names.has(x.name)) ctx.addIssue({ code: 'custom', path: ['factors', i, 'name'], message: `要因名「${x.name}」が重複しています` });
      byNo.set(x.no, x);
      names.add(x.name);
    });
    f.triangles.forEach((t, i) => {
      if (!byNo.has(t.factorNo)) ctx.addIssue({ code: 'custom', path: ['triangles', i, 'factorNo'], message: `三角分布の要因番号 ${t.factorNo} が factors にありません` });
    });
    const relations = relationsOf(f);
    const targeted = new Map<number, number>();
    relations.forEach((r) => {
      const ind = byNo.get(r.indirectNo);
      const dir = byNo.get(r.directNo);
      if (!ind || !dir) {
        ctx.addIssue({ code: 'custom', path: ['relations'], message: `関係 ${r.indirectNo} → ${r.directNo} の要因が factors にありません` });
        return;
      }
      if (ind.kind !== 'indirect') ctx.addIssue({ code: 'custom', path: ['relations'], message: `関係の起点「${ind.name}」が間接要因ではありません` });
      if (dir.kind !== 'direct') ctx.addIssue({ code: 'custom', path: ['relations'], message: `関係の先「${dir.name}」が直接要因ではありません (間接要因は一段階まで)` });
      const prev = targeted.get(r.directNo);
      if (prev !== undefined && prev !== r.indirectNo)
        ctx.addIssue({ code: 'custom', path: ['relations'], message: `直接要因「${dir.name}」に間接要因が 2 つあります (1 つまで)` });
      targeted.set(r.directNo, r.indirectNo);
    });
    f.projects?.forEach((p, i) => {
      if (p.levels.length > f.factors.length)
        ctx.addIssue({ code: 'custom', path: ['projects', i, 'levels'], message: `実績 ${p.id} のレベル値が要因の数 (${f.factors.length}) より多いです` });
    });
  });

export type ModelFile = z.infer<typeof modelFileSchema>;
export type ModelFileInput = z.input<typeof modelFileSchema>;
export type FileFactor = z.infer<typeof factorSchema>;
export type FileTriangle = z.infer<typeof triangleSchema>;
export type FileRelation = z.infer<typeof relationSchema>;
export type FileProject = z.infer<typeof projectSchema>;

/** relations と factors[].targetNo を合わせた「間接 → 直接」の一覧（relations 優先、重複なし） */
export function relationsOf(f: Pick<ModelFile, 'factors' | 'relations'>): FileRelation[] {
  const out = new Map<number, FileRelation>();
  for (const r of f.relations) out.set(r.indirectNo, r);
  for (const x of f.factors) if (x.kind === 'indirect' && x.targetNo != null && !out.has(x.no)) out.set(x.no, { indirectNo: x.no, directNo: x.targetNo });
  return [...out.values()];
}

export type ParseResult = { ok: true; data: ModelFile } | { ok: false; errors: string[] };

/** 取り込み用: JSON テキスト → 検証済み ModelFile。エラーは日本語で、最大 8 件。 */
export function parseModelJson(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch (e) {
    return { ok: false, errors: [`JSON として読めません: ${(e as Error).message}`] };
  }
  return validateModelFile(raw);
}

export function validateModelFile(raw: unknown): ParseResult {
  const r = modelFileSchema.safeParse(raw);
  if (r.success) return { ok: true, data: r.data };
  const errors = r.error.issues.slice(0, 8).map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message));
  if (r.error.issues.length > 8) errors.push(`ほか ${r.error.issues.length - 8} 件`);
  return { ok: false, errors };
}
