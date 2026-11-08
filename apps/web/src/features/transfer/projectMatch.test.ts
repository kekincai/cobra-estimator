import { SEED_FACTORS, SEED_PROJECTS } from 'cobra-core/seed';
import { describe, expect, it } from 'vitest';
import type { FactorRow, ProjectRow } from '../../../shared/types';
import { validateRows, registerValues, summarize, type TargetKey } from './csv';
import { buildExport, DEFAULT_EXPORT, toJsonText } from './exportModel';
import { buildImportPlan, defaultPicked, findConflicts, importGroups, type Picked } from './importPlan';
import { matchProject, projectDiffs, sameNumber } from './projectMatch';
import { parseModelJson, type ModelFile } from './schema';

const factorRows: FactorRow[] = SEED_FACTORS.map((f) => ({ ...f, targetFactorId: f.targetFactorId ?? null, modelId: 'default', updatedAt: '' }));
const projectRows: ProjectRow[] = SEED_PROJECTS.map((p) => ({ ...p, modelId: 'default', updatedAt: '' }));
const bundle = {
  model: { id: 'default', name: '社内Web系開発 標準モデル', k: 0.225, units: { fpPerKloc: 100, fpPerScreen: 30, hoursPerMM: 160 }, createdAt: '' },
  factors: factorRows,
  groups: [{ id: 'A', modelId: 'default', name: 'Web 系' }, { id: 'B', modelId: 'default', name: '別事業部' }],
  activeVersion: null,
};
const ALL: Picked = { stdFactors: true, stdTriangles: true, userFactors: true, userTriangles: true, relations: true, projects: true };
let n = 0;
const newId = () => `N${++n}`;

describe('sameNumber', () => {
  it('浮動小数の誤差だけを許す', () => {
    expect(sameNumber(0.1 + 0.2, 0.3)).toBe(true);
    expect(sameNumber(19.5, 19.5)).toBe(true);
    expect(sameNumber(0, 0)).toBe(true);
    expect(sameNumber(19.5, 19.51)).toBe(false);
    expect(sameNumber(1e12, 1e12 + 1)).toBe(true); // 相対誤差 1e-12
    expect(sameNumber(1e-12, 0)).toBe(true); // 絶対誤差 1e-9 以内
    expect(sameNumber(Number.NaN, Number.NaN)).toBe(false);
    expect(sameNumber(Infinity, Infinity)).toBe(true);
  });
});

describe('projectDiffs / matchProject', () => {
  const ex = { id: 'PJ-001', name: '予約', sizeFP: 860, effortMM: 19.5, levels: { F01: 2, F02: 1 }, note: '' };
  const same = { name: '予約 ', sizeFP: 860, effortMM: 19.5, levels: { F01: 2, F02: 1 }, note: '' };
  it('同じ内容なら差分なし（前後の空白は無視）', () => {
    expect(projectDiffs(ex, same)).toEqual([]);
    expect(matchProject(new Map([['PJ-001', ex]]), ' PJ-001 ', same)).toEqual({ status: 'same', existingId: 'PJ-001', diffs: [] });
  });
  it('違う項目をすべて列挙する（数値は丸めずそのまま）', () => {
    const d = projectDiffs(ex, { name: '予約2', sizeFP: 860.004, effortMM: 20, levels: { F01: 3, F02: 1 }, note: 'メモ' }, (id) => (id === 'F01' ? '要件の安定性' : id));
    expect(d).toEqual([
      '名前 — 既存「予約」 / 取り込み「予約2」',
      '規模 — 既存 860 FP / 取り込み 860.004 FP',
      '工数 — 既存 19.5 人月 / 取り込み 20 人月',
      '「要件の安定性」のレベル — 既存 L2 / 取り込み L3',
      '備考 — 既存「なし」 / 取り込み「メモ」',
    ]);
  });
  it('レベルは取り込み側にある要因だけ比べ、既存に無い要因は L0 とみなす', () => {
    expect(projectDiffs(ex, { ...same, levels: { F01: 2 } })).toEqual([]);
    expect(projectDiffs(ex, { ...same, levels: { F09: 0 } })).toEqual([]);
    expect(projectDiffs(ex, { ...same, levels: { F09: 1 } })).toEqual(['「F09」のレベル — 既存 L0 / 取り込み L1']);
  });
  it('既存の内容が分からなければ「違う」扱い、無ければ新規', () => {
    expect(matchProject(new Map([['PJ-001', { id: 'PJ-001' }]]), 'PJ-001', same).status).toBe('changed');
    expect(matchProject(new Map(), 'PJ-001', same)).toEqual({ status: 'new', diffs: [] });
  });
});

describe('JSON 取り込みの実績の重複', () => {
  const exported = buildExport(bundle, projectRows, { ...DEFAULT_EXPORT, projects: true }, { exportedBy: 'K. Cai' });
  const parsed = parseModelJson(toJsonText(exported));
  if (!parsed.ok) throw new Error(parsed.errors.join());
  const plan = (file: ModelFile, extra: Partial<Parameters<typeof buildImportPlan>[0]> = {}) =>
    buildImportPlan({
      file, fileName: 'estima-model-v3.json', sourceKind: 'json', picked: ALL, resolutions: {},
      existingFactors: factorRows, existingProjects: projectRows, existingGroups: bundle.groups, newId, ...extra,
    });

  it('同じファイルをもう一度取り込んでも実績は増えない（既に取り込み済み 12 件）', () => {
    const p = plan(parsed.data);
    expect(p.request.projects).toEqual([]);
    expect(p.request.projectsUpdate).toEqual([]);
    expect(p.request.groups).toEqual([]);
    expect(p.summary).toMatchObject({ projectsAdd: 0, projectsUpdate: 0, projectsSame: 12, projectsSkip: 0 });
    expect(p.projectDups.every((d) => d.status === 'same' && d.resolution === null)).toBe(true);
    expect(p.after.projects).toBe(12);
  });

  const changed: ModelFile = {
    ...parsed.data,
    projects: parsed.data.projects!.map((x) => (x.id === 'PJ-001' ? { ...x, effortMM: x.effortMM + 1, note: '再集計' } : x)),
  };
  it('同じ ID で内容が違うものは差分を出し、既定は別 ID で追加', () => {
    const p = plan(changed);
    const dup = p.projectDups.find((d) => d.fileId === 'PJ-001')!;
    expect(dup.status).toBe('changed');
    expect(dup.resolution).toBe('rename');
    expect(dup.diffs.join('\n')).toMatch(/工数 — 既存 .* 人月 \/ 取り込み .* 人月/);
    expect(dup.diffs.join('\n')).toMatch(/備考 — 既存「.*」 \/ 取り込み「再集計」/);
    expect(p.request.projects.map((x) => x.id)).toEqual(['PJ-001-2']);
    expect(p.request.groups).toHaveLength(1);
    expect(p.summary).toMatchObject({ projectsAdd: 1, projectsSame: 11 });
  });
  it('「既存を更新」は既存の ID を上書き（グループ・採用は送らない、レベルは既存に重ねる）', () => {
    const p = plan(changed, { projectResolutions: { 'PJ-001': 'update' } });
    expect(p.request.projects).toEqual([]);
    expect(p.request.groups).toEqual([]);
    expect(p.request.projectsUpdate).toHaveLength(1);
    const u = p.request.projectsUpdate![0]!;
    const seed = projectRows.find((x) => x.id === 'PJ-001')!;
    expect(u).toMatchObject({ id: 'PJ-001', effortMM: seed.effortMM + 1, note: '再集計', sizeFP: seed.sizeFP });
    expect(u).not.toHaveProperty('groupId');
    expect(u).not.toHaveProperty('adopted');
    for (const [k, v] of Object.entries(seed.levels)) expect(u.levels[k]).toBe(v);
    expect(p.summary).toMatchObject({ projectsAdd: 0, projectsUpdate: 1, projectsSame: 11 });
    expect(p.after.projects).toBe(12);
  });
  it('「取り込まない」は何も送らない', () => {
    const p = plan(changed, { projectResolutions: { 'PJ-001': 'skip' } });
    expect(p.request.projects).toEqual([]);
    expect(p.request.projectsUpdate).toEqual([]);
    expect(p.summary).toMatchObject({ projectsSkip: 1, projectsSame: 11 });
  });
  it('既存が空なら全件追加（従来どおり）', () => {
    const p = plan(parsed.data, { existingProjects: [], existingFactors: [], existingGroups: [] });
    expect(p.request.projects).toHaveLength(12);
    expect(p.projectDups).toEqual([]);
  });
});

describe('同名要因の差分をすべて見せる', () => {
  it('diffs に全件、diff は 1 行の要約', () => {
    const file: ModelFile = {
      format: 'estima-model/1', model: { name: 'k' },
      factors: [{ no: 1, name: '要件の安定性', category: '技術', kind: 'direct', origin: 'standard', definition: 'x', levels: ['a', 'b', 'c', 'd'] }],
      triangles: [], relations: [],
    };
    const [c] = findConflicts(file, factorRows, { stdFactors: true, userFactors: true });
    expect(c!.diffs.length).toBeGreaterThan(3);
    expect(c!.diff).toBe(`${c!.diffs[0]} ほか ${c!.diffs.length - 1} 点`);
    expect(c!.diffs).toContain('カテゴリが異なる — 既存「プロダクト」 / 取り込み「技術」');
  });
});

describe('defaultPicked（CoBRA 標準データは既定で選ばない）', () => {
  it('標準の要因・三角分布と実績は選ばず、他は中身があれば選ぶ', () => {
    const groups = importGroups(
      { format: 'estima-model/1', model: { name: '' }, factors: [{ no: 1, name: 'S', category: '', kind: 'direct', origin: 'standard', definition: '', levels: ['a', 'b', 'c', 'd'] }, { no: 2, name: 'U', category: '', kind: 'direct', origin: 'custom', definition: '', levels: ['a', 'b', 'c', 'd'] }], triangles: [{ factorNo: 1, expert: 'E', l3: [0, 0, 0] }, { factorNo: 2, expert: 'E', l3: [0, 0, 0] }], relations: [], projects: [{ id: 'P', sizeFP: 1, effortMM: 1, levels: [], note: '' }] },
      [],
      'A',
    );
    expect(defaultPicked(groups)).toEqual({ stdFactors: false, stdTriangles: false, userFactors: true, userTriangles: true, relations: false, projects: false });
    expect(groups[0]!.desc).toMatch('選ぶと現在のモデルに要因として追加されます');
    expect(groups[0]!.tag).toBe('モデルに追加');
  });
  it('空の一覧ならすべて未選択', () => {
    expect(Object.values(defaultPicked([])).every((v) => v === false)).toBe(true);
  });
  it('中身が無い行は「ファイルに含まれていません」', () => {
    const g = importGroups({ format: 'estima-model/1', model: { name: '' }, factors: [], triangles: [], relations: [] }, [], 'A');
    expect(g.find((x) => x.key === 'stdFactors')!.desc).toBe('ファイルに含まれていません');
    expect(g.find((x) => x.key === 'projects')!.tag).toBe('');
  });
});

describe('CSV の重複（JSON と同じ基準）', () => {
  const factors = factorRows.map((f) => ({ id: f.id, no: f.no, name: f.name }));
  const map: TargetKey[] = ['name', 'size', 'effort', ...factors.map((f) => `level:${f.id}` as TargetKey), 'note'];
  const seed = projectRows[0]!;
  const row = (over: Partial<Record<'size' | 'effort' | 'note', string>> = {}) => [
    seed.name,
    over.size ?? String(seed.sizeFP),
    over.effort ?? String(seed.effortMM),
    ...factors.map((f) => String(seed.levels[f.id] ?? 0)),
    over.note ?? seed.note,
  ];
  const opts = { factors, sizeUnit: 'FP' as const, effortUnit: 'MM' as const, existing: projectRows };

  it('名前も内容も同じ行は「既に取り込み済み」（問題ではなく、登録もしない）', () => {
    const r = validateRows([row()], map, opts);
    expect(r[0]!.issues).toEqual([{ code: 'already-imported', message: '既に取り込み済み', existingId: seed.id }]);
    expect(r[0]!.ok).toBe(false);
    const s = summarize(r);
    expect(s.already).toHaveLength(1);
    expect(s.duplicate).toHaveLength(0);
    expect(s.ok).toHaveLength(0);
  });
  it('名前が同じで内容が違う行は「既存と同名」と差分', () => {
    const r = validateRows([row({ effort: String(seed.effortMM + 2) })], map, opts);
    expect(r[0]!.issues[0]).toMatchObject({ code: 'dup-existing', existingId: seed.id });
    expect(r[0]!.issues[0]!.diffs![0]).toMatch(/^工数 — 既存/);
    expect(summarize(r).duplicate).toHaveLength(1);
  });
  it('人時で書いた CSV も、登録時の丸めで比べて同じなら取り込み済み', () => {
    const hours = String(seed.effortMM * 160);
    const r = validateRows([row({ effort: hours })], map, { ...opts, effortUnit: 'hours' });
    expect(r[0]!.issues[0]!.code).toBe('already-imported');
  });
  it('ほかに問題がある行は内容比較をせず「既存と同名」のまま', () => {
    const r = validateRows([row({ size: 'abc' })], map, opts);
    expect(r[0]!.issues.map((i) => i.code)).toEqual(['size-invalid', 'dup-existing']);
  });
});

describe('registerValues（CSV 登録時の丸め）', () => {
  it('規模は小数 2 桁、工数は小数 3 桁', () => {
    expect(registerValues(860, 19.5)).toEqual({ sizeFP: 860, effortMM: 19.5 });
    expect(registerValues(1.005, 0.0005)).toEqual({ sizeFP: Math.round(1.005 * 100) / 100, effortMM: Math.round(0.0005 * 1000) / 1000 });
    expect(registerValues(12.345, 3.14159)).toEqual({ sizeFP: 12.35, effortMM: 3.142 });
    expect(registerValues(0, 0)).toEqual({ sizeFP: 0, effortMM: 0 });
    expect(registerValues(3120 / 160, 3120 / 160)).toEqual({ sizeFP: 19.5, effortMM: 19.5 });
  });
});

describe('プロジェクト名は 100 文字まで（サーバーと同じ上限）', () => {
  const factors = factorRows.map((f) => ({ id: f.id, no: f.no, name: f.name }));
  const opts = { factors, sizeUnit: 'FP' as const, effortUnit: 'MM' as const, existing: [] };
  it('CSV: 100 文字は通し、101 文字は行と文字数を示して止める', () => {
    const r = validateRows([['あ'.repeat(100), '100', '2'], ['い'.repeat(101), '100', '2']], ['name', 'size', 'effort'], opts);
    expect(r[0]!.ok).toBe(true);
    expect(r[1]!.ok).toBe(false);
    expect(r[1]!.line).toBe(3);
    expect(r[1]!.issues[0]).toMatchObject({ code: 'name-too-long', message: '名前が 100 文字を超えています（101 文字）' });
    expect(summarize(r).other).toHaveLength(1);
  });
  it('JSON: 実績の何件目か・ID と上限を日本語で示す', () => {
    const base = { format: 'estima-model/1', model: { name: 'm' }, factors: [] };
    const ok = parseModelJson(JSON.stringify({ ...base, projects: [{ id: 'PJ-1', name: 'あ'.repeat(100), sizeFP: 1, effortMM: 1, levels: [] }] }));
    expect(ok.ok).toBe(true);
    const bad = parseModelJson(JSON.stringify({ ...base, projects: [{ id: 'PJ-1', name: 'x', sizeFP: 1, effortMM: 1, levels: [] }, { id: 'PJ-2', name: 'あ'.repeat(101), sizeFP: 1, effortMM: 1, levels: [] }] }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors).toEqual(['実績 2 件目（PJ-2）の名前: プロジェクト名は 100 文字までです']);
  });
});
