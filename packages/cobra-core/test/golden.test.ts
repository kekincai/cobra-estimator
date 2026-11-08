// 黄金値（回帰防止のスナップショット）。
// seed.ts のモデル・実績・世代を固定 seed で計算した値を、ほぼ完全一致（相対 1e-9）で固定する。
// ここが落ちたら「計算結果が変わった」ということ。意図した変更なら、理由を IMPLEMENTATION_BRIEF §6/§11 に書いてから値を更新する。
// （§6 の表示値との ±1% 照合は core.test.ts。ここは丸める前の生の値。）
import { describe, expect, it } from 'vitest';
import { DEFAULT_SEED, buildModel, exceedance, levers, simulate } from '../src/index';
import { SEED_GENERATIONS, SEED_G3, SEED_MODEL, SEED_PROJECTS } from '../src/seed';

const exact = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected) / Math.max(1e-300, Math.abs(expected)), `${actual} vs ${expected}`).toBeLessThan(1e-9);

const adopted = SEED_PROJECTS.filter((p) => p.adopted);
const excluded = SEED_PROJECTS.filter((p) => !p.adopted);
const v3 = buildModel(SEED_MODEL, adopted, { runs: 10_000, seed: DEFAULT_SEED, excluded });

describe('黄金値: 構築 v3（平均・10,000 回・seed 20261106）', () => {
  it('α・CI・σ・MMRE・PRED', () => {
    exact(v3.alpha, 0.02098428947404917);
    exact(v3.ci95[0], 0.019371111451926982);
    exact(v3.ci95[1], 0.022475222155543095);
    exact(v3.sigma!, 0.14473537616971818);
    exact(v3.mmre, 0.1275998153253042);
    expect(v3.pred25).toBe(9 / 11);
    exact(v3.inconsistencies[0]!.gap, -0.26007999718565344);
  });
  it('LOO の予測値', () => {
    const golden: [string, number][] = [
      ['PJ-001', 9.030934798329223],
      ['PJ-002', 12.433445525501838],
      ['PJ-003', 16.409320558904664],
      ['PJ-004', 16.045501063643357],
      ['PJ-005', 19.90553745169938],
      ['PJ-006', 21.12091807627827],
      ['PJ-008', 28.298144518090282],
      ['PJ-009', 30.034168680397528],
      ['PJ-010', 55.05639830445042],
      ['PJ-011', 40.90939478096833],
      ['PJ-012', 45.927532241684254],
    ];
    expect(v3.loo.map((l) => l.projectId)).toEqual(golden.map((g) => g[0]));
    golden.forEach(([, v], i) => exact(v3.loo[i]!.predicted, v));
  });
});

const GOLDEN = {
  G1: { p5: 29.001877177550746, p20: 32.61841386109342, p50: 37.074598930428365, p80: 42.1224409137479, p95: 47.329055212564974, mean: 37.5111200328425, ex40: 0.3094, ex45: 0.0978, ex50: 0.0232, counts: [11, 44, 151, 270, 486, 778, 964, 1058, 1223, 1148, 947, 811, 680, 500, 342, 212, 148, 95, 54, 30, 22, 17, 5, 4] },
  G2: { p5: 26.273986671336193, p20: 29.482962314006016, p50: 33.47605609712455, p80: 38.00058781288045, p95: 42.63192730726254, mean: 33.853525179148015, ex40: 0.1148, ex45: 0.0233, ex50: 0.0036, counts: [9, 41, 126, 239, 456, 714, 930, 1025, 1209, 1173, 998, 843, 698, 528, 369, 237, 145, 118, 50, 39, 24, 18, 5, 6] },
  G3: { p5: 34.3239146414173, p20: 38.65698339734115, p50: 43.928581148527556, p80: 49.931438761813105, p95: 56.16146990025017, mean: 44.44113918086892, ex40: 0.7324, ex45: 0.4336, ex50: 0.1976, counts: [11, 56, 153, 314, 499, 838, 988, 1117, 1231, 1144, 930, 803, 628, 460, 315, 189, 137, 77, 44, 25, 24, 8, 7, 2] },
} as const;

describe('黄金値: 見積り portal の世代 G1〜G3（v3 の α・σ、10,000 回、seed 20261106）', () => {
  for (const g of SEED_GENERATIONS) {
    const want = GOLDEN[g.label as keyof typeof GOLDEN];
    it(`${g.label}: P5 / P20 / P50 / P80 / P95・平均・超過確率・ヒストグラム`, () => {
      const r = simulate(SEED_MODEL, { alpha: v3.alpha, sizeFP: g.sizeFP, levels: g.levels, sigma: v3.sigma }, { runs: 10_000, seed: DEFAULT_SEED });
      exact(r.pct[5], want.p5);
      exact(r.pct[20], want.p20);
      exact(r.p50, want.p50);
      exact(r.pct[80], want.p80);
      exact(r.pct[95], want.p95);
      exact(r.mean, want.mean);
      expect(exceedance(r.samples, 40)).toBe(want.ex40);
      expect(exceedance(r.samples, 45)).toBe(want.ex45);
      expect(exceedance(r.samples, 50)).toBe(want.ex50);
      expect(r.histogram.counts).toEqual(want.counts);
    });
  }

  it('G3 の表示値（小数 1 桁・超過確率は %）が §6 と一致', () => {
    const g = GOLDEN.G3;
    expect([g.p50, g.p80, g.p5, g.p95].map((x) => x.toFixed(1))).toEqual(['43.9', '49.9', '34.3', '56.2']);
    expect(Math.round(g.ex45 * 100)).toBe(43);
    expect(SEED_G3.budget).toBe(45);
  });

  it('世代間の差（表示値どうしの差）: G3 − G2 = 43.9 − 33.5 = 10.4、G2 − G1 = 33.5 − 37.1 = −3.6', () => {
    const r1 = (x: number) => Number(x.toFixed(1));
    expect(r1(r1(GOLDEN.G3.p50) - r1(GOLDEN.G2.p50))).toBe(10.4);
    // 丸める前の差は 10.45 → 10.5 になってしまう（表示の差は必ず丸めた値どうしで取る）
    expect(r1(GOLDEN.G3.p50 - GOLDEN.G2.p50)).toBe(10.5);
    expect(r1(r1(GOLDEN.G2.p50) - r1(GOLDEN.G1.p50))).toBe(-3.6);
  });
});

describe('黄金値: 効く打ち手（G3、予算 45）', () => {
  it('F01 L3→L2 / F06 L3→L2 / F05 L2→L1', () => {
    const ls = levers(SEED_MODEL, { alpha: v3.alpha, sizeFP: SEED_G3.sizeFP, levels: SEED_G3.levels, sigma: v3.sigma }, { runs: 10_000, seed: DEFAULT_SEED, budget: SEED_G3.budget });
    expect(ls.map((l) => [l.factorId, l.fromLevel, l.toLevel, l.exceedance])).toEqual([
      ['F01', 3, 2, 0.2884],
      ['F06', 3, 2, 0.3443],
      ['F05', 2, 1, 0.3605],
    ]);
    exact(ls[0]!.p50, 41.352887419890926);
    exact(ls[0]!.deltaP50, -2.5756937286366295);
    exact(ls[1]!.deltaP50, -1.5576109423237199);
    exact(ls[2]!.deltaP50, -1.2705679277244428);
    // §6: P50 −2.6 / −1.6 / −1.3
    expect(ls.map((l) => l.deltaP50.toFixed(1))).toEqual(['-2.6', '-1.6', '-1.3']);
  });
});
