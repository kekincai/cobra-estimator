// cobra-core/seed（§6）から D1 の seed SQL を生成する。
//   pnpm --filter web db:seed-sql          → 全件 INSERT（空の DB 用。stdout → migrations/0001_seed.sql）
//   pnpm --filter web db:seed-sql:update   → 既存の seed 行を現在の seed.ts に合わせる UPDATE（stdout）
//
// 0001_seed.sql は本番 D1 に適用済みなので作り直さない。seed.ts を変えたら --update の出力を
// 新しいマイグレーション（例: migrations/0002_seed_calibration.sql）として追加する。
// 新しい DB でも 0001 → 0002 … の順に当たるので、最終状態は現在の seed.ts の全件 INSERT と同じになる。
import { DEFAULT_SEED, DEFAULT_UNITS, buildModel, type BuildResult } from 'cobra-core';
import { SEED_FACTORS, SEED_G3, SEED_MODEL, SEED_PROJECTS, SEED_VERSIONS } from 'cobra-core/seed';

const q = (v: unknown): string => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return `'${s.replaceAll("'", "''")}'`;
};
const ins = (table: string, row: Record<string, unknown>) =>
  `INSERT INTO ${table} (${Object.keys(row).join(', ')}) VALUES (${Object.values(row).map(q).join(', ')});`;

const M = 'default';
const RUNS = 10_000;

// 採用中の v3 は現在の実績で構築した結果をそのまま入れる（UI が構築し直したときと同じ値になる）
const v3: BuildResult = buildModel(SEED_MODEL, SEED_PROJECTS.filter((p) => p.adopted), {
  runs: RUNS,
  seed: DEFAULT_SEED,
  excluded: SEED_PROJECTS.filter((p) => !p.adopted),
});
const v3Row = { alpha: v3.alpha, ci_lo: v3.ci95[0], ci_hi: v3.ci95[1], mmre: v3.mmre, pred25: v3.pred25, n: v3.n, loo: v3.loo, inconsistencies: v3.inconsistencies };

const upd = (table: string, set: Record<string, unknown>, where: Record<string, unknown>) =>
  `UPDATE ${table} SET ${Object.entries(set).map(([k, v]) => `${k} = ${q(v)}`).join(', ')} WHERE ${Object.entries(where).map(([k, v]) => `${k} = ${q(v)}`).join(' AND ')};`;

if (process.argv.includes('--update')) {
  const out: string[] = ['-- 生成ファイル: scripts/seed-sql.ts --update（手で編集しない）。seed 行を現在の cobra-core/seed に合わせる'];
  for (const p of SEED_PROJECTS) {
    out.push(upd('projects', { name: p.name, size_fp: p.sizeFP, effort_mm: p.effortMM, levels: p.levels, note: p.note, adopted: p.adopted, excluded_reason: p.excludedReason }, { id: p.id, model_id: M }));
  }
  out.push(upd('model_versions', v3Row, { id: 'v3', model_id: M }));
  console.log(out.join('\n'));
  process.exit(0);
}

const out: string[] = ['-- 生成ファイル: scripts/seed-sql.ts（手で編集しない）'];
out.push(ins('models', { id: M, name: '社内Web系開発 標準モデル', k: 0.225, units: DEFAULT_UNITS }));
out.push(ins('groups', { id: 'A', model_id: M, name: 'Web 系' }), ins('groups', { id: 'B', model_id: M, name: '別事業部' }));
for (const f of SEED_FACTORS) {
  out.push(ins('factors', {
    id: f.id, model_id: M, no: f.no, name: f.name, category: f.category, kind: f.kind, target_factor_id: f.targetFactorId ?? null,
    definition: f.definition, levels: f.levels, origin: f.origin, triangles: f.triangles,
  }));
}
for (const p of SEED_PROJECTS) {
  out.push(ins('projects', {
    id: p.id, model_id: M, group_id: p.groupId, name: p.name, size_fp: p.sizeFP, effort_mm: p.effortMM, levels: p.levels,
    note: p.note, adopted: p.adopted, excluded_reason: p.excludedReason,
  }));
}
for (const v of SEED_VERSIONS) {
  const ci = 'ci95' in v ? v.ci95 : [null, null];
  out.push(ins('model_versions', {
    id: `v${v.version}`, model_id: M, version: v.version, built_at: `${v.builtAt}T10:00:00.000Z`, built_by: 'K. Cai',
    expert_mode: v.expert === '平均' ? { kind: 'average' } : { kind: 'expert', expert: v.expert }, group_id: 'A', runs: 10000, seed: 20261106,
    alpha: v.alpha, ci_lo: ci[0], ci_hi: ci[1], mmre: v.mmre, pred25: 'pred25' in v ? v.pred25 : null, n: v.n, loo: [], inconsistencies: [],
    factors_snapshot: null, active: v.active,
    ...(v.version === 3 ? v3Row : {}),
  }));
}
out.push(ins('estimates', { id: 'portal', model_id: M, name: SEED_G3.name, budget: SEED_G3.budget, report_generation_id: null }));
out.push(ins('users', { email: 'admin@example.com', name: 'K. Cai', role: 'admin' }));
console.log(out.join('\n'));
