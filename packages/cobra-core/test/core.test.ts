import { describe, expect, it } from 'vitest';
import { buildModel, exceedance, expectedCO, mulberry32, quantile, sampleTriangle, simulate } from '../src/index';
import { SEED_G3, SEED_MODEL, SEED_PROJECTS } from '../src/seed';

const g3 = { alpha: 0.021, sizeFP: SEED_G3.sizeFP, levels: SEED_G3.levels };

describe('基本', () => {
  it('mulberry32 は同じシードで同じ系列', () => {
    const a = mulberry32(42), b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('三角分布の逆 CDF は端点を返す', () => {
    const t = { best: 0.1, likely: 0.2, worst: 0.4 };
    expect(sampleTriangle(t, 0)).toBeCloseTo(0.1);
    expect(sampleTriangle(t, 0.999999)).toBeCloseTo(0.4, 2);
  });
  it('quantile / exceedance', () => {
    const s = Float64Array.from([1, 2, 3, 4, 5]);
    expect(quantile(s, 0.5)).toBe(3);
    expect(exceedance(s, 3)).toBeCloseTo(0.4);
  });
  it('L0 だけなら ΣCO = 0', () => {
    expect(expectedCO(SEED_MODEL, {}).sco).toBe(0);
  });
});

describe('再現性', () => {
  it('同じ seed・同じ入力で完全一致', () => {
    const a = simulate(SEED_MODEL, g3, { runs: 2000, seed: 7 });
    const b = simulate(SEED_MODEL, g3, { runs: 2000, seed: 7 });
    expect(a.p50).toBe(b.p50);
    expect(a.pct).toEqual(b.pct);
  });
});

describe('構築', () => {
  it('採用分で α・LOO・不整合を出す', () => {
    const r = buildModel(SEED_MODEL, SEED_PROJECTS.filter((p) => p.adopted), { runs: 1000, seed: 1 });
    expect(r.n).toBe(11);
    expect(r.ci95[0]).toBeLessThan(r.alpha);
    expect(r.ci95[1]).toBeGreaterThan(r.alpha);
    expect(r.loo).toHaveLength(11);
  });
});

// §6 の数値との突き合わせは cobra-core タスクで有効化する（レベル値・規則の調整が必要）
describe.todo('§6 G3 の数値 (42.3 / 49.1 / 34%) を ±1% で再現');
