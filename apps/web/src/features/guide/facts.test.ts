import { describe, expect, it } from 'vitest';
import { accuracyFacts, axisTicks, exceedBracket, flowFacts, formulaStart, readStoredResult } from './facts';
import { FLOW_STAGES, flowStagesFor, versionSpan } from './flowStages';

// 見本データ（ローカル D1 の v3 と portal G3）と同じ値
const v3 = { version: 3, n: 11, mmre: 0.1275998153253042, pred25: 0.8181818181818182, inconsistencies: [{ projectId: 'PJ-007', gap: -0.26, excluded: true }] };
const g3pct = { '5': 34.32, '10': 36.31, '20': 38.66, '30': 40.61, '40': 42.35, '50': 43.93, '60': 45.59, '70': 47.57, '80': 49.93, '90': 53.26, '95': 56.16 };

describe('accuracyFacts', () => {
  it('v3 → MMRE 12.8% / PRED 82% / 11 件中 9 件（レポート画面と同じ丸め）', () => {
    expect(accuracyFacts(v3)).toEqual({ version: 3, n: 11, mmrePct: '12.8', predPct: '82', predHits: 9, excludedInconsistent: ['PJ-007'] });
  });
  it('x.x5 の丸め: MMRE 0.1225 → 12.3（toFixed は 2 進誤差で 12.2 になりうるが表示は toFixed に揃える）', () => {
    // レポート・ダッシュボードも (mmre*100).toFixed(1) なので同じ値になることだけを保証する
    expect(accuracyFacts({ ...v3, mmre: 0.1225 })?.mmrePct).toBe((0.1225 * 100).toFixed(1));
    expect(accuracyFacts({ ...v3, pred25: 0.125, n: 8 })).toMatchObject({ predPct: '13', predHits: 1 });
  });
  it('未計算（null）・範囲外・空', () => {
    expect(accuracyFacts({ version: 2, n: 11, mmre: 0.198, pred25: null })).toMatchObject({ mmrePct: '19.8', predPct: null, predHits: null, excludedInconsistent: [] });
    expect(accuracyFacts({ ...v3, mmre: Number.NaN, pred25: 1.5 })).toMatchObject({ mmrePct: null, predPct: null });
    expect(accuracyFacts({ ...v3, n: 0, pred25: 0 })).toMatchObject({ n: 0, predPct: '0', predHits: 0 });
    expect(accuracyFacts(null)).toBeNull();
    expect(accuracyFacts(undefined)).toBeNull();
  });
  it('除外されていない不整合・壊れた要素は除外リストに入れない', () => {
    expect(accuracyFacts({ ...v3, inconsistencies: [{ projectId: 'PJ-003', excluded: false }, { projectId: 'PJ-009' }, null, 5, { projectId: 'PJ-007', excluded: true }] })?.excludedInconsistent).toEqual(['PJ-007']);
    expect(accuracyFacts({ ...v3, inconsistencies: 'x' })?.excludedInconsistent).toEqual([]);
  });
});

describe('readStoredResult', () => {
  it('P 値表を昇順の配列にする', () => {
    const r = readStoredResult({ p50: 43.93, scoExpected: 0.7433, pct: g3pct, histogram: {} });
    expect(r?.pct.map((x) => x.p)).toEqual([5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95]);
    expect(r?.p50).toBe(43.93);
  });
  it('壊れた値は null / 不正なキーは捨てる', () => {
    expect(readStoredResult(null)).toBeNull();
    expect(readStoredResult('x')).toBeNull();
    expect(readStoredResult({ p50: 'a', scoExpected: 0.1, pct: g3pct })).toBeNull();
    expect(readStoredResult({ p50: 1, scoExpected: 0.1, pct: { '50': 1 } })).toBeNull();
    expect(readStoredResult({ p50: 1, scoExpected: 0.1, pct: { '50': 1, x: 2, '100': 3, '0': 4, '80': Number.NaN, '90': 2 } })?.pct).toEqual([
      { p: 50, v: 1 },
      { p: 90, v: 2 },
    ]);
  });
});

describe('exceedBracket（補間しない）', () => {
  const pct = readStoredResult({ p50: 43.93, scoExpected: 0.74, pct: g3pct })!.pct;
  it('予算 45 は P50 43.93 と P60 45.59 の間 → 超過確率 40〜50%（リスク画面の 43% を含む）', () => {
    expect(exceedBracket(pct, 45)).toEqual({ lo: 40, hi: 50 });
  });
  it('ちょうど P 値の工数なら、その超過確率が下端', () => {
    expect(exceedBracket(pct, 49.93)).toEqual({ lo: 10, hi: 20 });
    expect(exceedBracket(pct, 34.32)).toEqual({ lo: 90, hi: 95 });
  });
  it('表の外', () => {
    expect(exceedBracket(pct, 10)).toEqual({ lo: 95, hi: 100 });
    expect(exceedBracket(pct, 56.16)).toEqual({ lo: 0, hi: 5 });
    expect(exceedBracket(pct, 999)).toEqual({ lo: 0, hi: 5 });
  });
  it('空・NaN', () => {
    expect(exceedBracket([], 45)).toBeNull();
    expect(exceedBracket(pct, Number.NaN)).toBeNull();
  });
  it('順不同の入力でも同じ', () => {
    expect(exceedBracket([...pct].reverse(), 45)).toEqual({ lo: 40, hi: 50 });
  });
});

describe('axisTicks', () => {
  it('30〜60 → 10 刻み', () => {
    expect(axisTicks(30, 60)).toEqual([30, 40, 50, 60]);
    expect(axisTicks(32.1, 58.4)).toEqual([35, 40, 45, 50, 55]);
  });
  it('狭い範囲・逆順・同値・NaN', () => {
    expect(axisTicks(1, 3)).toEqual([1, 2, 3]);
    expect(axisTicks(60, 30)).toEqual([30, 40, 50, 60]);
    expect(axisTicks(5, 5)).toEqual([5]);
    expect(axisTicks(Number.NaN, 3)).toEqual([]);
  });
  it('目盛りは maxTicks 以下', () => {
    for (const [lo, hi] of [[0, 1000], [12, 87], [0.3, 0.9]] as const) expect(axisTicks(lo, hi).length).toBeLessThanOrEqual(5);
  });
});

describe('formulaStart', () => {
  it('見本 v3 / G3 → α 210、規模 1200、ΣCO 74%', () => {
    expect(formulaStart(0.02098428947404917, 1200, 0.7433333333333334)).toEqual({ a: 210, size: 1200, sco: 74 });
  });
  it('x.5 の丸めと範囲の端', () => {
    expect(formulaStart(0.02105, 1225, 0.745)).toEqual({ a: 211, size: 1250, sco: 75 });
    expect(formulaStart(0.001, 10, -1)).toEqual({ a: 150, size: 300, sco: 0 });
    expect(formulaStart(1, 1e6, 9)).toEqual({ a: 300, size: 2400, sco: 150 });
  });
  it('欠けていれば null', () => {
    expect(formulaStart(undefined, 1200, 0.7)).toBeNull();
    expect(formulaStart(0.02, Number.NaN, 0.7)).toBeNull();
  });
});

// 見本データ（ローカル D1）と同じ形: 専門家 S.T. / Y.T.、グループ A / B、版 v3 / v2 / v1（新しい順）、使用中 v3 は n = 11
const tri = (expert: string) => ({ expert, best: 0, mode: 0.1, worst: 0.3 });
const bundle = {
  factors: [{ triangles: [tri('S.T.'), tri('Y.T.')] }, { triangles: [tri('Y.T.'), tri(' S.T. ')] }],
  groups: [{ id: 'A' }, { id: 'B' }],
  versions: [{ version: 3 }, { version: 2 }, { version: 1 }],
  activeVersion: { n: 11 },
};

describe('flowFacts', () => {
  it('見本のモデル → 専門家 2 名・グループ A / B・採用 11 件・v1〜v3', () => {
    expect(flowFacts(bundle)).toEqual({ experts: ['S.T.', 'Y.T.'], groups: ['A', 'B'], adoptedN: 11, versions: { first: 1, last: 3 } });
  });
  it('版なし・使用中の版なし・空', () => {
    expect(flowFacts({ factors: [], groups: [], versions: [], activeVersion: null })).toEqual({ experts: [], groups: [], adoptedN: null, versions: null });
    expect(flowFacts({})).toEqual({ experts: [], groups: [], adoptedN: null, versions: null });
    expect(flowFacts({ ...bundle, versions: [{ version: 4 }] })?.versions).toEqual({ first: 4, last: 4 });
  });
  it('n = 0 は 0 件、壊れた値は捨てる', () => {
    expect(flowFacts({ ...bundle, activeVersion: { n: 0 } })?.adoptedN).toBe(0);
    expect(flowFacts({ ...bundle, activeVersion: { n: Number.NaN } })?.adoptedN).toBeNull();
    expect(flowFacts({ ...bundle, activeVersion: { n: -1 } })?.adoptedN).toBeNull();
    expect(flowFacts({ ...bundle, activeVersion: { n: '11' } })?.adoptedN).toBeNull();
    expect(flowFacts({ ...bundle, versions: [{ version: 0 }, { version: 1.5 }, { version: 'v2' }, { version: 2 }] })?.versions).toEqual({ first: 2, last: 2 });
    expect(flowFacts({ ...bundle, factors: [{ triangles: [{ expert: '' }, { expert: 3 }, {}] }, { triangles: null }] })?.experts).toEqual([]);
    expect(flowFacts({ ...bundle, groups: [{ id: '' }, {}, { id: 'C' }] })?.groups).toEqual(['C']);
  });
  it('読み込み中・失敗（null / undefined）は null', () => {
    expect(flowFacts(null)).toBeNull();
    expect(flowFacts(undefined)).toBeNull();
  });
});

describe('flowStagesFor（業務フローの見本の値を現在のモデルから差し込む）', () => {
  const chips = (no: string, f: Parameters<typeof flowStagesFor>[0]) => {
    const s = flowStagesFor(f).find((x) => x.no === no)!;
    return { inp: s.inp, out: s.out, diff: s.diff };
  };

  it('見本のモデルでは設計稿と同じ文言になる', () => {
    const f = flowFacts(bundle);
    expect(chips('01', f).inp).toContain('専門家の判断 (S.T. / Y.T.)');
    expect(chips('02', f).out).toContain('グループ A / B');
    const s3 = chips('03', f);
    expect(s3.inp).toEqual(['要因定義', '採用した実績 11 件', '専門家 (S.T. / Y.T. / 平均)']);
    expect(s3.out).toContain('モデル v1 → v3');
    expect(s3.diff).toContain('版 (v1〜v3) を残して');
  });

  it('件数・版は実データに追従する（12 件、v1〜v4）', () => {
    const f = flowFacts({ ...bundle, versions: [{ version: 4 }, ...bundle.versions], activeVersion: { n: 12 } });
    expect(chips('03', f).inp).toContain('採用した実績 12 件');
    expect(chips('03', f).out).toContain('モデル v1 → v4');
    expect(chips('03', f).diff).toContain('版 (v1〜v4)');
  });

  it('読み込み中（null）は数値を出さない', () => {
    expect(flowStagesFor(null)).toBe(FLOW_STAGES);
    const all = JSON.stringify(FLOW_STAGES);
    expect(all).not.toMatch(/11 件|S\.T\.|Y\.T\.|v1|v3|グループ A/);
    expect(chips('03', null).inp).toContain('採用した実績');
  });

  it('版がない・使用中の版がない・専門家がいないときは数値なしの文言のまま', () => {
    const f = flowFacts({ factors: [], groups: [], versions: [], activeVersion: null });
    const s3 = chips('03', f);
    expect(s3.inp).toEqual(['要因定義', '採用した実績', '専門家 (各人 / 平均)']);
    expect(s3.out).toContain('モデルの版');
    expect(s3.diff).toContain('版を残して');
    expect(chips('01', f).inp).toContain('専門家の判断');
    expect(chips('02', f).out).toContain('グループ');
  });

  it('0 件は「0 件」と出す（使用中の版が 0 件で作られた場合）', () => {
    expect(chips('03', flowFacts({ ...bundle, activeVersion: { n: 0 } })).inp).toContain('採用した実績 0 件');
  });

  it('差し込み以外の段・項目は変えない', () => {
    const out = flowStagesFor(flowFacts(bundle));
    expect(out.map((s) => s.no)).toEqual(FLOW_STAGES.map((s) => s.no));
    for (const no of ['04', '05', '06']) expect(out.find((s) => s.no === no)).toBe(FLOW_STAGES.find((s) => s.no === no));
    expect(FLOW_STAGES.find((s) => s.no === '04')!.desc).toContain('10,000 回 (既定)');
  });

  it('versionSpan', () => {
    expect(versionSpan(null)).toBeNull();
    expect(versionSpan(flowFacts(bundle))).toBe('v1 → v3');
    expect(versionSpan(flowFacts(bundle), '〜')).toBe('v1〜v3');
    expect(versionSpan(flowFacts({ ...bundle, versions: [{ version: 2 }] }))).toBe('v2');
    expect(versionSpan(flowFacts({ ...bundle, versions: [] }))).toBeNull();
  });
});
