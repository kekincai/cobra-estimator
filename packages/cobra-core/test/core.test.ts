import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SEED,
  DEFAULT_UNITS,
  HISTOGRAM_BINS,
  buildModel,
  effortAtExceedance,
  exceedance,
  expectedCO,
  histogram,
  isInconsistent,
  levers,
  mulberry32,
  multipliers,
  normalInv,
  predictiveSigma,
  projectAlpha,
  projectGap,
  quantile,
  resolveTriangle,
  sampleTriangle,
  scaleTriangle,
  simulate,
  toFP,
  toMM,
  triMean,
  type ModelSpec,
  type ProjectRecord,
} from '../src/index';
import { SEED_FACTORS, SEED_G3, SEED_MODEL, SEED_PROJECTS, SEED_VERSIONS } from '../src/seed';

/** 相対誤差 ±tol（既定 1%）で一致 */
const near = (actual: number, expected: number, tol = 0.01) =>
  expect(Math.abs(actual - expected) / Math.abs(expected), `${actual} vs ${expected}`).toBeLessThanOrEqual(tol);

const adopted = SEED_PROJECTS.filter((p) => p.adopted);
const excluded = SEED_PROJECTS.filter((p) => !p.adopted);
const BUILD = { runs: 10_000, seed: DEFAULT_SEED };
const v3 = buildModel(SEED_MODEL, adopted, { ...BUILD, excluded });
const g3 = { alpha: v3.alpha, sizeFP: SEED_G3.sizeFP, levels: SEED_G3.levels, sigma: v3.sigma };
const factor = (id: string) => SEED_FACTORS.find((f) => f.id === id)!;

describe('基本', () => {
  it('mulberry32 は同じシードで同じ系列', () => {
    const a = mulberry32(42), b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('三角分布の逆 CDF は端点・最頻値を返し、平均は (a+c+b)/3', () => {
    const t = { best: 0.1, likely: 0.2, worst: 0.4 };
    expect(sampleTriangle(t, 0)).toBeCloseTo(0.1);
    expect(sampleTriangle(t, (0.2 - 0.1) / (0.4 - 0.1))).toBeCloseTo(0.2);
    expect(sampleTriangle(t, 0.999999)).toBeCloseTo(0.4, 2);
    const rand = mulberry32(1);
    let s = 0;
    for (let i = 0; i < 100_000; i++) s += sampleTriangle(t, rand());
    near(s / 100_000, triMean(t), 0.005);
  });
  it('quantile / exceedance / effortAtExceedance', () => {
    const s = Float64Array.from([1, 2, 3, 4, 5]);
    expect(quantile(s, 0.5)).toBe(3);
    expect(quantile(s, 0.25)).toBe(2);
    expect(exceedance(s, 3)).toBeCloseTo(0.4);
    expect(exceedance(s, 0)).toBe(1);
    expect(exceedance(s, 5)).toBe(0);
    expect(effortAtExceedance(s, 0.5)).toBe(3);
  });
  it('histogram は 24 桶で全件を数える', () => {
    const s = Float64Array.from({ length: 1000 }, (_, i) => i);
    const h = histogram(s);
    expect(h.counts).toHaveLength(HISTOGRAM_BINS);
    expect(h.counts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(h.lo).toBe(0);
    expect(h.hi).toBe(999);
  });
  it('normalInv は標準正規の分位点', () => {
    expect(normalInv(0.5)).toBeCloseTo(0, 9);
    expect(normalInv(0.975)).toBeCloseTo(1.959964, 5);
    expect(normalInv(0.05)).toBeCloseTo(-1.644854, 5);
    expect(normalInv(0.001)).toBeCloseTo(-3.090232, 5);
    expect(normalInv(0.8)).toBeCloseTo(-normalInv(0.2), 9);
    expect(Number.isFinite(normalInv(0))).toBe(true);
  });
});

describe('CO（§2.2）', () => {
  it('L0 だけなら ΣCO = 0', () => {
    expect(expectedCO(SEED_MODEL, {}).sco).toBe(0);
  });
  it('レベルで線形内挿: tri_L = tri_L3 × L / 3', () => {
    const t = { best: 0.3, likely: 0.6, worst: 0.9 };
    const l1 = scaleTriangle(t, 1);
    expect([l1.best, l1.likely, l1.worst].map((x) => x.toFixed(12))).toEqual(['0.100000000000', '0.200000000000', '0.300000000000']);
    expect(scaleTriangle(t, 0)).toEqual({ best: 0, likely: 0, worst: 0 });
    expect(scaleTriangle(t, 7)).toEqual(t); // 範囲外は L3 に丸める
  });
  it('間接要因の倍率 m = 1 + k × L / 3（L2 → ×1.15、L3 → ×1.225）', () => {
    expect(multipliers(SEED_MODEL, {})).toEqual({ F01: 1 });
    expect(multipliers(SEED_MODEL, { F02: 2 }).F01).toBeCloseTo(1.15, 12);
    expect(multipliers(SEED_MODEL, { F02: 3 }).F01).toBeCloseTo(1.225, 12);
    // 間接要因は自分の CO を足さない
    expect(expectedCO(SEED_MODEL, { F02: 3 }).sco).toBe(0);
    const f01 = triMean(resolveTriangle(factor('F01'), { kind: 'average' }));
    expect(expectedCO(SEED_MODEL, { F01: 3, F02: 2 }).byFactor.F01).toBeCloseTo(f01 * 1.15, 12);
    expect(expectedCO(SEED_MODEL, { F01: 3, F02: 2 }).byFactor).not.toHaveProperty('F02');
  });
  it('専門家モード: 個人 / 平均（各点の平均）/ 不明な専門家は平均', () => {
    const f = factor('F01');
    expect(resolveTriangle(f, { kind: 'expert', expert: 'S.T.' })).toEqual({ best: 0.18, likely: 0.26, worst: 0.4 });
    expect(resolveTriangle(f, { kind: 'expert', expert: 'Y.T.' })).toEqual({ best: 0.15, likely: 0.25, worst: 0.36 });
    const avg = resolveTriangle(f, { kind: 'average' });
    expect(avg.best).toBeCloseTo(0.165, 12);
    expect(avg.likely).toBeCloseTo(0.255, 12);
    expect(avg.worst).toBeCloseTo(0.38, 12);
    expect(resolveTriangle(f, { kind: 'expert', expert: '??' })).toEqual(avg);
    const st = expectedCO({ ...SEED_MODEL, expertMode: { kind: 'expert', expert: 'S.T.' } }, { F01: 3 }).sco;
    const yt = expectedCO({ ...SEED_MODEL, expertMode: { kind: 'expert', expert: 'Y.T.' } }, { F01: 3 }).sco;
    expect(st).toBeCloseTo((0.18 + 0.26 + 0.4) / 3, 12);
    expect(yt).toBeCloseTo((0.15 + 0.25 + 0.36) / 3, 12);
  });
});

describe('構築（§2.4）', () => {
  // ΣCO = 0 の小さな例で手計算と突き合わせる: α_j = 1, 2, 3 → α = 2
  const empty: ModelSpec = { factors: [], k: 0.225, expertMode: { kind: 'average' } };
  const toy: ProjectRecord[] = [1, 2, 3].map((e, i) => ({ id: `T${i}`, sizeFP: 1, effortMM: e, levels: {} }));
  const r = buildModel(empty, toy, { runs: 2000, seed: 1 });

  it('α = mean(α_j)、LOO は残りの平均で予測', () => {
    expect(r.alpha).toBeCloseTo(2, 12);
    expect(r.loo.map((l) => l.predicted)).toEqual([2.5, 2, 1.5]);
    expect(r.loo[0]!.error).toBeCloseTo(1.5, 12); // (2.5 − 1) / 1
    expect(r.loo[2]!.error).toBeCloseTo(-0.5, 12);
  });
  it('MMRE = mean|error|、PRED(25) = |error| ≤ 0.25 の割合', () => {
    expect(r.mmre).toBeCloseTo((1.5 + 0 + 0.5) / 3, 12);
    expect(r.pred25).toBeCloseTo(1 / 3, 12);
  });
  it('不整合: |α_j / α − 1| > 0.25', () => {
    expect(r.inconsistencies.map((x) => [x.projectId, x.gap])).toEqual([['T0', -0.5], ['T2', 0.5]]);
    expect(isInconsistent(0.25)).toBe(false);
    expect(isInconsistent(-0.2501)).toBe(true);
  });
  it('σ = LOO 残差の対数 RMS', () => {
    expect(r.sigma).toBeCloseTo(Math.sqrt((Math.log(1 / 2.5) ** 2 + 0 + Math.log(3 / 1.5) ** 2) / 3), 12);
    expect(predictiveSigma(r.loo)).toBe(r.sigma);
    expect(predictiveSigma([])).toBe(0);
  });
  it('ブートストラップ CI は同じ seed で同じ、α を含む', () => {
    const again = buildModel(empty, toy, { runs: 2000, seed: 1 });
    expect(again.ci95).toEqual(r.ci95);
    expect(r.ci95[0]).toBeLessThan(r.alpha);
    expect(r.ci95[1]).toBeGreaterThan(r.alpha);
  });
  it('2 件未満はエラー', () => {
    expect(() => buildModel(empty, toy.slice(0, 1), { runs: 10, seed: 1 })).toThrow();
  });
  it('進捗は α → モンテカルロ → 交差検証 の順', () => {
    const stages: string[] = [];
    buildModel(empty, toy, { runs: 100, seed: 1, onProgress: (s) => stages.at(-1) !== s && stages.push(s) });
    expect(stages).toEqual(['alpha', 'montecarlo', 'loo']);
  });
});

describe('§6 構築 v3（平均・グループ A 採用 11 件）', () => {
  it('α = 0.0210、95% CI 0.0194–0.0225', () => {
    expect(v3.n).toBe(11);
    expect(v3.alpha.toFixed(4)).toBe('0.0210');
    expect(v3.ci95.map((x) => x.toFixed(4))).toEqual(['0.0194', '0.0225']);
  });
  it('MMRE 12.8%、PRED(25) 82%（9/11）', () => {
    near(v3.mmre, 0.128);
    expect(Math.round(v3.pred25 * 11)).toBe(9);
  });
  it('LOO: PJ-010 +33%、PJ-003 +25% が ±25% 帯の外', () => {
    const out = v3.loo.filter((l) => l.mre > 0.25).map((l) => [l.projectId, Math.round(l.error * 100)]);
    expect(out).toEqual([['PJ-003', 25], ['PJ-010', 33]]);
  });
  it('PJ-007（除外中）を不整合として挙げる', () => {
    expect(v3.inconsistencies).toHaveLength(1);
    const x = v3.inconsistencies[0]!;
    expect(x.projectId).toBe('PJ-007');
    expect(x.excluded).toBe(true);
    expect(x.gap).toBeLessThan(-0.25);
    expect(projectGap(SEED_MODEL, v3.alpha, excluded[0]!)).toBe(x.gap);
    expect(projectAlpha(SEED_MODEL, adopted[0]!)).toBe(v3.alphas[0]!.alpha);
  });
  it('σ = 0.145', () => {
    near(v3.sigma!, 0.145);
  });
  it('SEED_VERSIONS v3 は構築結果を表示桁に丸めた値', () => {
    const s = SEED_VERSIONS.find((v) => v.version === 3)!;
    expect(s.alpha.toFixed(4)).toBe(v3.alpha.toFixed(4));
    expect(s.ci95.map((x) => x.toFixed(4))).toEqual(v3.ci95.map((x) => x.toFixed(4)));
    expect(s.mmre).toBe(Number(v3.mmre.toFixed(3)));
    expect(s.pred25).toBe(Number(v3.pred25.toFixed(3)));
    expect(s.sigma).toBe(Number(v3.sigma!.toFixed(3)));
    expect(s.n).toBe(v3.n);
  });
});

describe('§6 G3 見積り（v3 の α・σ、10,000 回、seed 20261106）', () => {
  const r = simulate(SEED_MODEL, g3, { runs: 10_000, seed: DEFAULT_SEED });
  const e = SEED_G3.expected;
  it('ΣCO・名目・上乗せ', () => {
    near(r.scoExpected, e.sco);
    near(r.nominal, e.nominal);
    near(r.overhead, e.overhead);
  });
  it('P50 / P80 / P5 / P95 を ±1% で再現', () => {
    near(r.p50, e.p50);
    near(r.pct[80], e.p80);
    near(r.pct[5], e.p5);
    near(r.pct[95], e.p95);
  });
  it('予算 45 の超過確率', () => {
    expect(Math.abs(exceedance(r.samples, SEED_G3.budget) - e.exceedAtBudget)).toBeLessThanOrEqual(0.01);
  });
  it('寄与 = 名目 × E[CO_i × m_i]、大きい順', () => {
    for (const c of r.contributions) expect(Math.abs(c.mm - e.contributions[c.factorId as keyof typeof e.contributions])).toBeLessThan(0.06);
    expect(r.contributions.map((c) => c.factorId)).toEqual(['F01', 'F06', 'F05', 'F04', 'F03', 'F07', 'F08']);
    const total = r.contributions.reduce((s, c) => s + c.mm, 0);
    near(total, r.nominal * r.scoExpected);
    near(r.contributions.reduce((s, c) => s + c.share, 0), 1, 1e-9);
  });
  it('100,000 回でも ±1% 以内', () => {
    const big = simulate(SEED_MODEL, g3, { runs: 100_000, seed: DEFAULT_SEED });
    near(big.p50, e.p50);
    near(big.pct[80], e.p80);
    near(big.pct[5], e.p5);
    near(big.pct[95], e.p95);
  });
});

describe('モデル誤差 σ（§2.3）', () => {
  const base = { alpha: 0.021, sizeFP: 1200, levels: SEED_G3.levels };
  const opts = { runs: 10_000, seed: 7 };
  it('σ 未指定と σ = 0 は同じ（CO のばらつきだけ）', () => {
    const a = simulate(SEED_MODEL, base, opts);
    const b = simulate(SEED_MODEL, { ...base, sigma: 0 }, opts);
    expect(a.pct).toEqual(b.pct);
  });
  it('σ > 0 で幅が広がり、P50 はほぼ変わらない', () => {
    const a = simulate(SEED_MODEL, base, opts);
    const b = simulate(SEED_MODEL, { ...base, sigma: 0.15 }, opts);
    near(b.p50, a.p50);
    expect(b.pct[95] - b.pct[5]).toBeGreaterThan(3 * (a.pct[95] - a.pct[5]));
  });
  it('ΣCO = 0 なら工数は対数正規: P95 / P50 = exp(1.645σ)', () => {
    const r = simulate(SEED_MODEL, { alpha: 0.02, sizeFP: 1000, levels: {}, sigma: 0.2 }, { runs: 100_000, seed: 3 });
    near(r.p50, 20);
    near(r.pct[95] / r.p50, Math.exp(1.644854 * 0.2));
    near(r.pct[5] / r.p50, Math.exp(-1.644854 * 0.2));
  });
});

describe('再現性', () => {
  it('同じ seed・同じ入力で完全一致', () => {
    const a = simulate(SEED_MODEL, g3, { runs: 2000, seed: 7 });
    const b = simulate(SEED_MODEL, g3, { runs: 2000, seed: 7 });
    expect(a.p50).toBe(b.p50);
    expect(a.pct).toEqual(b.pct);
    expect(a.samples).toEqual(b.samples);
  });
  it('seed が違えば結果も違う', () => {
    expect(simulate(SEED_MODEL, g3, { runs: 2000, seed: 7 }).p50).not.toBe(simulate(SEED_MODEL, g3, { runs: 2000, seed: 8 }).p50);
  });
  it('進捗は 1 で終わる', () => {
    const seen: number[] = [];
    simulate(SEED_MODEL, g3, { runs: 1000, seed: 1, onProgress: (f) => seen.push(f) });
    expect(seen.at(-1)).toBe(1);
  });
});

describe('効く打ち手（§2.5）', () => {
  const opts = { runs: 10_000, seed: DEFAULT_SEED, budget: SEED_G3.budget };
  const ls = levers(SEED_MODEL, g3, opts);
  const base = simulate(SEED_MODEL, g3, opts);
  it('上位 3 件: F01 → F06 → F05、1 段下げ', () => {
    expect(ls.map((l) => [l.factorId, l.fromLevel, l.toLevel])).toEqual([['F01', 3, 2], ['F06', 3, 2], ['F05', 2, 1]]);
  });
  it('P50 が下がり、予算超過確率も下がる', () => {
    for (const l of ls) {
      expect(l.deltaP50).toBeLessThan(0);
      expect(l.p50).toBeCloseTo(base.p50 + l.deltaP50, 9);
      expect(l.exceedance!).toBeLessThan(exceedance(base.samples, SEED_G3.budget));
    }
    expect(ls[0]!.deltaP50).toBeLessThanOrEqual(ls[1]!.deltaP50);
  });
  it('L0 の要因・間接要因は対象外、予算なしなら exceedance は null', () => {
    const all = levers(SEED_MODEL, { ...g3, levels: { F01: 1, F02: 3 } }, { runs: 1000, seed: 1, top: 10 });
    expect(all.map((l) => l.factorId)).toEqual(['F01']);
    expect(all[0]!.exceedance).toBeNull();
  });
});

describe('単位換算（§2.1）', () => {
  it('既定: 1 KLOC = 100 FP、1 画面 = 30 FP、160 h = 1 人月', () => {
    expect(toFP(1200, 'FP')).toBe(1200);
    expect(toFP(12, 'KLOC')).toBe(1200);
    expect(toFP(40, 'screen')).toBe(1200);
    expect(toMM(43.9, 'MM')).toBe(43.9);
    expect(toMM(320, 'hours')).toBe(2);
    expect(DEFAULT_UNITS).toEqual({ fpPerKloc: 100, fpPerScreen: 30, hoursPerMM: 160 });
  });
  it('係数は差し替えられる', () => {
    const u = { fpPerKloc: 50, fpPerScreen: 20, hoursPerMM: 140 };
    expect(toFP(10, 'KLOC', u)).toBe(500);
    expect(toFP(10, 'screen', u)).toBe(200);
    expect(toMM(280, 'hours', u)).toBe(2);
  });
});

describe('性能（§8）', () => {
  const time = (runs: number) => {
    simulate(SEED_MODEL, g3, { runs: 1000, seed: 1 }); // JIT ウォームアップ
    const t = Date.now();
    simulate(SEED_MODEL, g3, { runs, seed: 1 });
    return Date.now() - t;
  };
  it('10,000 回 < 1 s', () => {
    expect(time(10_000)).toBeLessThan(1000);
  });
  it('100,000 回 < 3 s', () => {
    expect(time(100_000)).toBeLessThan(3000);
  });
  it('構築（ブートストラップ 100,000 回）< 3 s', () => {
    const t = Date.now();
    buildModel(SEED_MODEL, adopted, { runs: 100_000, seed: 1 });
    expect(Date.now() - t).toBeLessThan(3000);
  });
});
