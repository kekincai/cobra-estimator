// モンテカルロ見積り（§2.3）の性質テスト。
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SEED,
  HISTOGRAM_BINS,
  PERCENTILES,
  buildModel,
  expectedCO,
  quantile,
  simulate,
  type EstimateInput,
  type ModelSpec,
} from '../src/index';
import { SEED_G3, SEED_MODEL, SEED_PROJECTS } from '../src/seed';

const adopted = SEED_PROJECTS.filter((p) => p.adopted);
const excluded = SEED_PROJECTS.filter((p) => !p.adopted);
const v3 = buildModel(SEED_MODEL, adopted, { runs: 10_000, seed: DEFAULT_SEED, excluded });
const g3: EstimateInput = { alpha: v3.alpha, sizeFP: SEED_G3.sizeFP, levels: SEED_G3.levels, sigma: v3.sigma };
const g3NoSigma: EstimateInput = { ...g3, sigma: 0 };

describe('再現性', () => {
  it('同じ seed・同じ入力 → 全フィールドが完全一致', () => {
    const a = simulate(SEED_MODEL, g3, { runs: 5000, seed: 11 });
    const b = simulate(SEED_MODEL, g3, { runs: 5000, seed: 11 });
    expect(a).toEqual(b);
  });
  it('seed が違えばサンプル列が違う（統計量は近い）', () => {
    const a = simulate(SEED_MODEL, g3, { runs: 20_000, seed: 1 });
    const b = simulate(SEED_MODEL, g3, { runs: 20_000, seed: 2 });
    expect(a.samples).not.toEqual(b.samples);
    expect(a.p50).not.toBe(b.p50);
    expect(Math.abs(a.p50 - b.p50) / a.p50).toBeLessThan(0.01);
  });
  it('入力オブジェクトを書き換えない', () => {
    const input = JSON.parse(JSON.stringify(g3)) as typeof g3;
    const model = JSON.parse(JSON.stringify(SEED_MODEL)) as typeof SEED_MODEL;
    simulate(model, input, { runs: 100, seed: 1 });
    expect(input).toEqual(g3);
    expect(model).toEqual(SEED_MODEL);
  });
});

describe('出力の形', () => {
  const r = simulate(SEED_MODEL, g3, { runs: 4321, seed: 5 });
  it('samples は runs 件、昇順', () => {
    expect(r.samples).toHaveLength(4321);
    for (let i = 1; i < r.samples.length; i++) expect(r.samples[i]!).toBeGreaterThanOrEqual(r.samples[i - 1]!);
  });
  it('分位点は P5 ≤ P10 ≤ … ≤ P95、quantile と一致、p50 = pct[50]', () => {
    for (let i = 1; i < PERCENTILES.length; i++) expect(r.pct[PERCENTILES[i]!]).toBeGreaterThanOrEqual(r.pct[PERCENTILES[i - 1]!]);
    for (const p of PERCENTILES) expect(r.pct[p]).toBe(quantile(r.samples, p / 100));
    expect(r.p50).toBe(r.pct[50]);
    expect(r.pct[20]).toBeLessThan(r.pct[50]);
    expect(r.pct[50]).toBeLessThan(r.pct[80]);
    expect(r.pct[80]).toBeLessThan(r.pct[95]);
  });
  it('名目 = α × 規模、上乗せ = P50 − 名目、scoExpected = expectedCO', () => {
    expect(r.nominal).toBe(g3.alpha * g3.sizeFP);
    expect(r.overhead).toBe(r.p50 - r.nominal);
    expect(r.scoExpected).toBe(expectedCO(SEED_MODEL, g3.levels).sco);
  });
  it('平均はサンプルの平均、ヒストグラムは全件', () => {
    expect(r.mean).toBeCloseTo(r.samples.reduce((s, x) => s + x, 0) / r.runs, 9);
    expect(r.histogram.counts).toHaveLength(HISTOGRAM_BINS);
    expect(r.histogram.counts.reduce((a, b) => a + b, 0)).toBe(r.runs);
    expect(r.histogram.lo).toBe(r.samples[0]);
    expect(r.histogram.hi).toBe(r.samples[r.runs - 1]);
  });
  it('runs と seed を返す', () => {
    expect(r.runs).toBe(4321);
    expect(r.seed).toBe(5);
  });
});

describe('runs の扱い', () => {
  it('小数は切り捨て、1 未満は 1 回', () => {
    expect(simulate(SEED_MODEL, g3, { runs: 10.9, seed: 1 }).runs).toBe(10);
    expect(simulate(SEED_MODEL, g3, { runs: 0, seed: 1 }).runs).toBe(1);
    expect(simulate(SEED_MODEL, g3, { runs: -5, seed: 1 }).samples).toHaveLength(1);
  });
  it('1 回だけでも全分位点が同じ値で有限', () => {
    const r = simulate(SEED_MODEL, g3, { runs: 1, seed: 1 });
    for (const p of PERCENTILES) expect(r.pct[p]).toBe(r.samples[0]);
    expect(Number.isFinite(r.p50)).toBe(true);
  });
  it('runs を増やすと統計量が収束（seed 間のばらつきが縮む）', () => {
    const spread = (runs: number) => {
      const p50s = [1, 2, 3, 4, 5].map((seed) => simulate(SEED_MODEL, g3, { runs, seed }).p50);
      return Math.max(...p50s) - Math.min(...p50s);
    };
    const s1k = spread(1000);
    const s50k = spread(50_000);
    expect(s50k).toBeLessThan(s1k);
    expect(s50k / 43.9).toBeLessThan(0.006);
  });
  it('同じ seed なら runs を変えても先頭の試行列は共通（10,000 回の結果は 100,000 回に近い）', () => {
    const a = simulate(SEED_MODEL, g3, { runs: 10_000, seed: DEFAULT_SEED });
    const b = simulate(SEED_MODEL, g3, { runs: 100_000, seed: DEFAULT_SEED });
    for (const p of [20, 50, 80, 95] as const) expect(Math.abs(a.pct[p] - b.pct[p]) / b.pct[p]).toBeLessThan(0.01);
  });
});

describe('レベルと名目', () => {
  it('全要因 L0・σ = 0 → 全サンプル = 名目、上乗せ 0、寄与 0', () => {
    const r = simulate(SEED_MODEL, { alpha: 0.021, sizeFP: 1000, levels: {} }, { runs: 1000, seed: 1 });
    expect(new Set(r.samples).size).toBe(1);
    expect(r.samples[0]).toBe(r.nominal);
    expect(r.nominal).toBeCloseTo(21, 12);
    expect(r.p50).toBe(r.nominal);
    expect(r.pct[5]).toBe(r.nominal);
    expect(r.pct[95]).toBe(r.nominal);
    expect(r.overhead).toBe(0);
    expect(r.scoExpected).toBe(0);
    for (const c of r.contributions) {
      expect(c.mm).toBe(0);
      expect(c.share).toBe(0);
    }
  });
  it('全要因 L0・σ > 0 → 名目 × exp(σz) だけ（P50 ≈ 名目）', () => {
    const r = simulate(SEED_MODEL, { alpha: 0.021, sizeFP: 1000, levels: {}, sigma: 0.145 }, { runs: 50_000, seed: 1 });
    expect(Math.abs(r.p50 / r.nominal - 1)).toBeLessThan(0.005);
    expect(r.contributions.every((c) => c.mm === 0)).toBe(true);
  });
  it('規模 0 → すべて 0（NaN にならない）', () => {
    const r = simulate(SEED_MODEL, { ...g3, sizeFP: 0 }, { runs: 100, seed: 1 });
    expect(r.nominal).toBe(0);
    expect(r.p50).toBe(0);
    expect(r.contributions.every((c) => c.mm === 0 && c.share === 0)).toBe(true);
  });
  it('σ = 0: サンプルは 名目 × (1 + ΣCO の範囲) に収まる', () => {
    const r = simulate(SEED_MODEL, g3NoSigma, { runs: 10_000, seed: 3 });
    // ΣCO の最小・最大 = 各要因の best / worst（× L/3 × m）の和
    const lo = expectedCOBound(SEED_MODEL, g3.levels, 'best');
    const hi = expectedCOBound(SEED_MODEL, g3.levels, 'worst');
    expect(r.samples[0]!).toBeGreaterThanOrEqual(r.nominal * (1 + lo) - 1e-9);
    expect(r.samples[r.runs - 1]!).toBeLessThanOrEqual(r.nominal * (1 + hi) + 1e-9);
  });
  it('レベルを上げると P50 が上がる', () => {
    const base = simulate(SEED_MODEL, g3, { runs: 10_000, seed: 1 });
    const up = simulate(SEED_MODEL, { ...g3, levels: { ...g3.levels, F03: 3 } }, { runs: 10_000, seed: 1 });
    expect(up.p50).toBeGreaterThan(base.p50);
  });
});

/** ΣCO の端（全要因が best / worst） */
function expectedCOBound(model: ModelSpec, levels: Record<string, number>, key: 'best' | 'worst'): number {
  const pinned: ModelSpec = {
    ...model,
    factors: model.factors.map((f) => ({ ...f, triangles: f.triangles.map((t) => ({ ...t, best: t[key], likely: t[key], worst: t[key] })) })),
  };
  return expectedCO(pinned, levels).sco;
}

describe('期待値との整合（大標本）', () => {
  it('σ = 0: 平均 = 名目 × (1 + E[ΣCO])', () => {
    const r = simulate(SEED_MODEL, g3NoSigma, { runs: 100_000, seed: 21 });
    expect(Math.abs(r.mean / (r.nominal * (1 + r.scoExpected)) - 1)).toBeLessThan(0.001);
  });
  it('σ > 0: 平均 = 名目 × (1 + E[ΣCO]) × exp(σ²/2)（ε は独立な対数正規）', () => {
    const r = simulate(SEED_MODEL, g3, { runs: 200_000, seed: 22 });
    const expected = r.nominal * (1 + r.scoExpected) * Math.exp(v3.sigma! ** 2 / 2);
    expect(Math.abs(r.mean / expected - 1)).toBeLessThan(0.002);
  });
  it('σ > 0 でも P50 ≈ 名目 × (1 + E[ΣCO])（§2.3「推定値 = 名目 + 上乗せ」）', () => {
    const r = simulate(SEED_MODEL, g3, { runs: 200_000, seed: 23 });
    expect(Math.abs(r.p50 / (r.nominal * (1 + r.scoExpected)) - 1)).toBeLessThan(0.003);
  });
});

describe('寄与（contribution_i = 名目 × E[CO_i × m_i]）', () => {
  const r = simulate(SEED_MODEL, g3, { runs: 10_000, seed: DEFAULT_SEED });
  const det = expectedCO(SEED_MODEL, g3.levels);
  it('直接要因だけ・大きい順・share の合計 1', () => {
    expect(r.contributions.map((c) => c.factorId)).not.toContain('F02');
    expect(r.contributions).toHaveLength(7);
    for (let i = 1; i < r.contributions.length; i++) expect(r.contributions[i]!.mm).toBeLessThanOrEqual(r.contributions[i - 1]!.mm);
    expect(r.contributions.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1, 12);
  });
  it('寄与の合計 = 名目 × mean(ΣCO_r)（サンプル内で厳密）', () => {
    // σ = 0 なら samples = 名目 × (1 + ΣCO_r) なので mean から ΣCO の標本平均が逆算できる
    const r0 = simulate(SEED_MODEL, g3NoSigma, { runs: 10_000, seed: 4 });
    const total = r0.contributions.reduce((s, c) => s + c.mm, 0);
    expect(total).toBeCloseTo(r0.mean - r0.nominal, 9);
  });
  it('モンテカルロの寄与は確定計算 名目 × CO_i の推定値（10,000 回で ±1%）', () => {
    for (const c of r.contributions) {
      const exact = r.nominal * det.byFactor[c.factorId]!;
      expect(Math.abs(c.mm - exact) / exact, c.factorId).toBeLessThan(0.01);
    }
  });
  it('他の要因のレベルを変えても、ある要因の寄与のサンプル列は変わらない（L0 も乱数を消費）', () => {
    const a = simulate(SEED_MODEL, g3NoSigma, { runs: 3000, seed: 9 });
    const b = simulate(SEED_MODEL, { ...g3NoSigma, levels: { ...g3.levels, F05: 0, F08: 3 } }, { runs: 3000, seed: 9 });
    const mm = (x: typeof a, id: string) => x.contributions.find((c) => c.factorId === id)!.mm;
    for (const id of ['F01', 'F03', 'F04', 'F06', 'F07']) expect(mm(b, id)).toBe(mm(a, id));
  });
  it('間接要因のレベルは対象の寄与だけを m 倍にする（同じ乱数列）', () => {
    const a = simulate(SEED_MODEL, g3NoSigma, { runs: 3000, seed: 9 });
    const b = simulate(SEED_MODEL, { ...g3NoSigma, levels: { ...g3.levels, F02: 0 } }, { runs: 3000, seed: 9 });
    const mm = (x: typeof a, id: string) => x.contributions.find((c) => c.factorId === id)!.mm;
    expect(mm(a, 'F01') / mm(b, 'F01')).toBeCloseTo(1.15, 12);
    expect(mm(a, 'F06')).toBe(mm(b, 'F06'));
  });
});

describe('進捗', () => {
  it('単調増加で 1 で終わる、回数はおよそ 20 + 1', () => {
    const seen: number[] = [];
    simulate(SEED_MODEL, g3, { runs: 10_000, seed: 1, onProgress: (f) => seen.push(f) });
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
    expect(seen.at(-1)).toBe(1);
    expect(seen.length).toBeGreaterThanOrEqual(20);
    expect(seen.length).toBeLessThanOrEqual(22);
    expect(seen.every((f) => f > 0 && f <= 1)).toBe(true);
  });
  it('runs < 20 でも進捗が出る', () => {
    const seen: number[] = [];
    simulate(SEED_MODEL, g3, { runs: 3, seed: 1, onProgress: (f) => seen.push(f) });
    expect(seen.at(-1)).toBe(1);
  });
});

describe('専門家モード', () => {
  it('S.T. の分布は Y.T. より CO が大きい → P50 も大きい', () => {
    const st = simulate({ ...SEED_MODEL, expertMode: { kind: 'expert', expert: 'S.T.' } }, g3, { runs: 10_000, seed: 1 });
    const yt = simulate({ ...SEED_MODEL, expertMode: { kind: 'expert', expert: 'Y.T.' } }, g3, { runs: 10_000, seed: 1 });
    const avg = simulate(SEED_MODEL, g3, { runs: 10_000, seed: 1 });
    expect(st.scoExpected).toBeGreaterThan(avg.scoExpected);
    expect(avg.scoExpected).toBeGreaterThan(yt.scoExpected);
    expect(st.p50).toBeGreaterThan(yt.p50);
  });
});
