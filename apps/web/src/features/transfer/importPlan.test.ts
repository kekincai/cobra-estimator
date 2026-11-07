import { SEED_FACTORS, SEED_PROJECTS } from 'cobra-core/seed';
import { describe, expect, it } from 'vitest';
import type { FactorRow, ModelBundle, ProjectRow } from '../../../shared/types';
import { buildExport, DEFAULT_EXPORT, exportItems, previewJson, toJsonText } from './exportModel';
import { buildImportPlan, findConflicts, importGroups, nextGroupIds, type Picked } from './importPlan';
import { parseModelJson, validateModelFile, type ModelFile } from './schema';

const factorRows: FactorRow[] = SEED_FACTORS.map((f) => ({ ...f, targetFactorId: f.targetFactorId ?? null, modelId: 'default', updatedAt: '' }));
const projectRows: ProjectRow[] = SEED_PROJECTS.map((p) => ({ ...p, modelId: 'default', updatedAt: '' }));
const bundle: Pick<ModelBundle, 'model' | 'factors' | 'groups' | 'activeVersion'> = {
  model: { id: 'default', name: '社内Web系開発 標準モデル', k: 0.225, units: { fpPerKloc: 100, fpPerScreen: 30, hoursPerMM: 160 }, createdAt: '' },
  factors: factorRows,
  groups: [{ id: 'A', modelId: 'default', name: 'Web 系' }, { id: 'B', modelId: 'default', name: '別事業部' }],
  activeVersion: {
    id: 'v3', modelId: 'default', version: 3, builtAt: '', builtBy: 'K. Cai', expertMode: { kind: 'average' }, groupId: 'A', runs: 10000, seed: 1,
    alpha: 0.021, ciLo: 0.0186, ciHi: 0.0237, mmre: 0.184, pred25: 0.75, n: 11,
    loo: [{ projectId: 'PJ-001', actual: 8.2, predicted: 7.7, error: -0.06, mre: 0.06 }], inconsistencies: [], factorsSnapshot: null, active: true,
  },
};
const ALL: Picked = { stdFactors: true, stdTriangles: true, userFactors: true, userTriangles: true, relations: true, projects: true };
let n = 0;
const newId = () => `N${++n}`;

describe('export', () => {
  it('builds a valid estima-model/1 without 実績 by default', () => {
    const f = buildExport(bundle, projectRows, DEFAULT_EXPORT, { exportedBy: 'K. Cai', now: new Date('2026-11-06T05:12:00Z') });
    expect(validateModelFile(f).ok).toBe(true);
    expect(f.projects).toBeUndefined();
    expect(f.factors).toHaveLength(8);
    expect(f.triangles).toHaveLength(16);
    expect(f.relations).toEqual([{ indirectNo: 2, directNo: 1, k: 0.225 }]);
    expect(f.model).toEqual({ name: '社内Web系開発 標準モデル', version: 3, alpha: 0.021, ci95: [0.0186, 0.0237] });
    expect(f.excluded).toEqual([{ projectId: 'PJ-007', reason: 'ΣCO と生産性の不整合' }]);
    expect(f.accuracy).toEqual({ mmre: 0.184, pred25: 0.75, loo: [{ projectId: 'PJ-001', mre: -0.06 }] });
    expect(f.groups).toEqual([{ id: 'A', name: 'Web 系', projects: 12 }, { id: 'B', name: '別事業部', projects: 0 }]);
  });

  it('never includes 実績 for an upload, even when picked', () => {
    const picked = { ...DEFAULT_EXPORT, projects: true };
    expect(buildExport(bundle, projectRows, picked, { exportedBy: 'x' }).projects).toHaveLength(12);
    expect(buildExport(bundle, projectRows, picked, { exportedBy: 'x', forUpload: true }).projects).toBeUndefined();
  });

  it('drops relations whose factors are not exported and omits unchecked items', () => {
    const f = buildExport(bundle, projectRows, { ...DEFAULT_EXPORT, groups: false, excluded: false, accuracy: false, triangles: false }, { exportedBy: 'x' });
    expect(f.groups).toBeUndefined();
    expect(f.excluded).toBeUndefined();
    expect(f.accuracy).toBeUndefined();
    expect(f.triangles).toEqual([]);
    expect(f.model.ci95).toBeUndefined();
  });

  it('describes the 8 items and previews compactly', () => {
    const items = exportItems(bundle, projectRows);
    expect(items.map((i) => i.name)).toEqual(['グループ', 'PJ 除外の情報', 'デフォルトの変動要因', '独自の変動要因', '独自の三角分布', '要因間の関係情報', '見積り精度情報', 'プロジェクト実績データ']);
    expect(items[5]!.desc).toBe('02 → 01 (強める)');
    expect(items[6]!.desc).toBe('α 0.0210 ・ MMRE 18.4% ・ PRED(25) 75% ・ 交差検証の誤差');
    const p = previewJson(buildExport(bundle, projectRows, DEFAULT_EXPORT, { exportedBy: 'x' }));
    expect(p).toContain('"format": "estima-model/1"');
    expect(p).toMatch(/"triangles": \[ .* … 16 件 \]/);
  });
});

describe('import plan', () => {
  it('round-trips an export into an empty model', () => {
    const exported = buildExport(bundle, projectRows, { ...DEFAULT_EXPORT, projects: true }, { exportedBy: 'K. Cai' });
    const parsed = parseModelJson(toJsonText(exported));
    if (!parsed.ok) throw new Error(parsed.errors.join());
    const plan = buildImportPlan({
      file: parsed.data, fileName: 'estima-model-v3.json', sourceKind: 'json', picked: ALL, resolutions: {},
      existingFactors: [], existingProjects: [], existingGroups: [], newId,
    });
    const { factorsInsert, factorsUpdate, projects, groups } = plan.request;
    expect(factorsUpdate).toEqual([]);
    expect(factorsInsert.map((f) => f.name)).toEqual(SEED_FACTORS.map((f) => f.name));
    const f2 = factorsInsert.find((f) => f.no === 2)!;
    expect(f2.targetFactorId).toBe(factorsInsert.find((f) => f.no === 1)!.id);
    expect(factorsInsert.every((f) => f.triangles.length === 2)).toBe(true);
    expect(groups).toEqual([{ id: 'A', name: 'Web 系' }]);
    expect(projects).toHaveLength(12);
    const pj7 = projects.find((p) => p.id === 'PJ-007')!;
    expect(pj7).toMatchObject({ adopted: false, excludedReason: 'ΣCO と生産性の不整合', groupId: 'A' });
    const pj10 = projects.find((p) => p.id === 'PJ-010')!;
    const idOf = (no: number) => factorsInsert.find((f) => f.no === no)!.id;
    // seed のレベル値は cobra-core の校正で変わるので、seed から期待値を作る
    const seed10 = SEED_PROJECTS.find((p) => p.id === 'PJ-010')!;
    for (const f of SEED_FACTORS) expect(pj10.levels[idOf(f.no)] ?? 0).toBe(seed10.levels[f.id] ?? 0);
    expect(plan.after).toEqual({ factors: 8, triangles: 16, projects: 12, standard: 8 });
    expect(plan.warnings).toEqual([]);
  });

  const file: ModelFile = {
    format: 'estima-model/1', exportedBy: 'S. Tanaka', model: { name: 'kanni' },
    factors: [
      { no: 1, name: '要件の安定性', category: 'プロダクト', kind: 'direct', origin: 'standard', definition: SEED_FACTORS[0]!.definition, levels: ['着手時に確定', '一部に変更の余地', '主要機能に未確定あり', '要件の 3 割以上が未確定'] },
      { no: 2, name: '開発者のスキル・経験', category: '人', kind: 'direct', origin: 'custom', definition: SEED_FACTORS[2]!.definition, levels: SEED_FACTORS[2]!.levels },
      { no: 3, name: '帳票の数', category: 'プロダクト', kind: 'direct', origin: 'custom', definition: '', levels: ['a', 'b', 'c', 'd'] },
      { no: 4, name: '運用部門の協力度', category: '人', kind: 'indirect', origin: 'custom', definition: '', levels: ['a', 'b', 'c', 'd'] },
      { no: 5, name: '顧客の関与度', category: 'プロダクト', kind: 'indirect', origin: 'custom', definition: SEED_FACTORS[1]!.definition, levels: SEED_FACTORS[1]!.levels },
    ],
    triangles: [
      { factorNo: 2, expert: 'S.T.', l3: [0.06, 0.12, 0.8] },
      { factorNo: 2, expert: 'Y.T.', l3: [0.05, 0.1, 0.2] },
      { factorNo: 3, expert: 'S.T.', l3: [0.03, 0.08, 0.15] },
    ],
    relations: [{ indirectNo: 4, directNo: 3 }, { indirectNo: 5, directNo: 2 }],
    projects: [{ id: 'PJ-001', sizeFP: 500, effortMM: 10, levels: [1, 0, 2, 1, 0], note: '', groupId: 'X' }],
  };

  it('finds same-name conflicts with a readable diff', () => {
    const c = findConflicts(file, factorRows, { stdFactors: true, userFactors: true });
    expect(c.map((x) => x.name)).toEqual(['要件の安定性', '開発者のスキル・経験', '顧客の関与度']);
    expect(c[0]!.diff).toBe('L3 の定義文が異なる — 既存「3 割以上が未確定」 / 取り込み「要件の 3 割以上が未確定」');
    expect(c[1]!.diff).toBe('三角分布 最悪値が異なる — 既存 0.22 / 取り込み 0.80 (S.T.)');
    expect(c[2]!.diff).toMatch(/^三角分布 S.T. の分が既存にない|内容は同じ/);
    expect(findConflicts(file, factorRows, { stdFactors: false, userFactors: true })).toHaveLength(2);
    const groups = importGroups(file, factorRows, 'C');
    expect(groups.map((g) => g.count)).toEqual([1, 0, 4, 3, 2, 1]);
    expect(groups[2]!.tag).toBe('同名 2');
  });

  it('applies keep / overwrite / rename and keeps relations consistent', () => {
    const plan = buildImportPlan({
      file, fileName: 'kanni.json', sourceKind: 'json', picked: ALL,
      resolutions: { 1: 'keep', 2: 'overwrite', 5: 'rename' },
      existingFactors: factorRows, existingProjects: projectRows, existingGroups: bundle.groups, newId,
    });
    const r = plan.request;
    // 要件の安定性: 既存を残す → 変更なし
    expect(r.factorsUpdate.find((u) => u.id === 'F01')).toBeUndefined();
    // 開発者のスキル・経験: 上書き（三角分布も）
    expect(r.factorsUpdate.find((u) => u.id === 'F03')).toMatchObject({ category: '人', kind: 'direct', triangles: [{ expert: 'S.T.', worst: 0.8 }, { expert: 'Y.T.', worst: 0.2 }] });
    // 別名で追加 + 新規 2 件
    expect(r.factorsInsert.map((f) => [f.no, f.name])).toEqual([[9, '帳票の数'], [10, '運用部門の協力度'], [11, '顧客の関与度 (取り込み)']]);
    const ins = (name: string) => r.factorsInsert.find((f) => f.name === name)!;
    expect(ins('運用部門の協力度').targetFactorId).toBe(ins('帳票の数').id);
    // 「顧客の関与度 (取り込み)」→ F03（開発者のスキル）: F03 にはまだ間接要因がないので OK
    expect(ins('顧客の関与度 (取り込み)').targetFactorId).toBe('F03');
    expect(r.groups).toEqual([{ id: 'C', name: '取り込み X' }]);
    expect(r.projects[0]).toMatchObject({ id: 'PJ-001-2', groupId: 'C', name: 'PJ-001', adopted: true });
    // 要件の安定性 (keep) の ID にレベルが付く
    expect(r.projects[0]!.levels).toMatchObject({ F01: 1, F03: 0, [ins('帳票の数').id]: 2 });
    expect(plan.after.factors).toBe(11);
    expect(plan.after.projects).toBe(13);
  });

  it('drops a relation that would give a direct factor two indirect factors', () => {
    const f2: ModelFile = { ...file, relations: [{ indirectNo: 5, directNo: 1 }, { indirectNo: 4, directNo: 3 }] };
    const plan = buildImportPlan({
      file: f2, fileName: 'k.json', sourceKind: 'json', picked: ALL, resolutions: { 1: 'keep', 5: 'rename' },
      existingFactors: factorRows, existingProjects: [], existingGroups: [], newId,
    });
    const renamed = plan.request.factorsInsert.find((f) => f.name === '顧客の関与度 (取り込み)')!;
    expect(renamed.targetFactorId).toBeNull();
    expect(plan.warnings.join()).toMatch(/すでに間接要因「顧客の関与度」/);
  });

  it('skips unpicked groups and leaves indirect targets unset without relations', () => {
    const plan = buildImportPlan({
      file, fileName: 'k.json', sourceKind: 'json',
      picked: { ...ALL, stdFactors: false, userTriangles: false, relations: false, projects: false },
      resolutions: {}, existingFactors: factorRows, existingProjects: [], existingGroups: [], newId,
    });
    expect(plan.request.projects).toEqual([]);
    expect(plan.request.factorsInsert.map((f) => f.name)).toEqual(['帳票の数', '運用部門の協力度']);
    expect(plan.request.factorsInsert.every((f) => f.triangles.length === 0 && f.targetFactorId === null)).toBe(true);
  });

  it('allocates free group ids', () => {
    expect(nextGroupIds(['A', 'B'], 2)).toEqual(['C', 'D']);
    expect(nextGroupIds(['A', 'C'], 2)).toEqual(['B', 'D']);
  });
});
