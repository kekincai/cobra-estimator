// 三角分布・レベル・CO（§2.2）。手計算の小さなモデルと突き合わせる。
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_K,
  clampLevel,
  directFactors,
  expectedCO,
  levelOf,
  mulberry32,
  multipliers,
  resolveTriangle,
  sampleTriangle,
  scaleTriangle,
  triMean,
  type Factor,
  type ModelSpec,
} from '../src/index';
import { SEED_FACTORS, SEED_G3, SEED_MODEL } from '../src/seed';

const factor = (p: Partial<Factor> & Pick<Factor, 'id' | 'kind'>): Factor => ({
  no: 1, name: p.id, category: 'x', definition: '', levels: ['', '', '', ''], origin: 'custom', triangles: [], ...p,
});

/** 直接 A・B、間接 C → A の小さなモデル（k = 0.3） */
const toy: ModelSpec = {
  k: 0.3,
  expertMode: { kind: 'average' },
  factors: [
    factor({ id: 'A', kind: 'direct', triangles: [{ expert: 'e1', best: 0.3, likely: 0.6, worst: 1.2 }, { expert: 'e2', best: 0.0, likely: 0.3, worst: 0.6 }] }),
    factor({ id: 'B', kind: 'direct', triangles: [{ expert: 'e1', best: 0.09, likely: 0.12, worst: 0.15 }] }),
    factor({ id: 'C', kind: 'indirect', targetFactorId: 'A', triangles: [{ expert: 'e1', best: 0.5, likely: 0.5, worst: 0.5 }] }),
  ],
};

describe('triMean / scaleTriangle', () => {
  it('平均は (best + likely + worst) / 3', () => {
    expect(triMean({ best: 0.1, likely: 0.2, worst: 0.6 })).toBeCloseTo(0.3, 15);
    expect(triMean({ best: 0, likely: 0, worst: 0 })).toBe(0);
  });
  it('L で線形内挿（3 点とも × L/3）、平均も × L/3', () => {
    const t = { best: 0.12, likely: 0.27, worst: 0.48 };
    for (const l of [0, 1, 2, 3]) {
      const s = scaleTriangle(t, l);
      expect(s.best).toBeCloseTo((t.best * l) / 3, 15);
      expect(s.likely).toBeCloseTo((t.likely * l) / 3, 15);
      expect(s.worst).toBeCloseTo((t.worst * l) / 3, 15);
      expect(triMean(s)).toBeCloseTo((triMean(t) * l) / 3, 15);
    }
  });
  it('レベルは丸めて 0〜3 に収める（1.4 → 1、2.5 → 3、負・NaN → 0、7 → 3）', () => {
    const t = { best: 0.3, likely: 0.6, worst: 0.9 };
    expect(scaleTriangle(t, 1.4)).toEqual(scaleTriangle(t, 1));
    expect(scaleTriangle(t, 2.5)).toEqual(scaleTriangle(t, 3));
    expect(scaleTriangle(t, -2)).toEqual({ best: 0, likely: 0, worst: 0 });
    expect(scaleTriangle(t, Number.NaN)).toEqual({ best: 0, likely: 0, worst: 0 });
    expect(scaleTriangle(t, 7)).toEqual(t);
  });
});

describe('sampleTriangle（逆 CDF）', () => {
  const t = { best: 0.1, likely: 0.25, worst: 0.7 };
  const fc = (t.likely - t.best) / (t.worst - t.best);

  it('u = 0 → best、u = fc → likely、u → 1 → worst', () => {
    expect(sampleTriangle(t, 0)).toBe(t.best);
    expect(sampleTriangle(t, fc)).toBeCloseTo(t.likely, 12);
    expect(sampleTriangle(t, 1)).toBe(t.worst);
    expect(sampleTriangle(t, 1 - 1e-12)).toBeCloseTo(t.worst, 5);
  });

  it('u について単調非減少で、常に [best, worst] に収まる', () => {
    let prev = -Infinity;
    for (let i = 0; i <= 10_000; i++) {
      const v = sampleTriangle(t, i / 10_000);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeGreaterThanOrEqual(t.best);
      expect(v).toBeLessThanOrEqual(t.worst);
      prev = v;
    }
  });

  it('CDF の逆関数: F(sample(u)) = u', () => {
    const F = (x: number) => {
      const { best: a, likely: c, worst: b } = t;
      return x <= c ? ((x - a) ** 2) / ((b - a) * (c - a)) : 1 - ((b - x) ** 2) / ((b - a) * (b - c));
    };
    for (const u of [0.01, 0.1, fc / 2, fc, 0.5, 0.9, 0.999]) expect(F(sampleTriangle(t, u))).toBeCloseTo(u, 12);
  });

  it('大標本の平均 ≈ triMean、分散 ≈ (a²+b²+c²−ab−ac−bc)/18', () => {
    const r = mulberry32(2024);
    const n = 200_000;
    let s = 0;
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      const v = sampleTriangle(t, r());
      s += v;
      s2 += v * v;
    }
    const m = s / n;
    const { best: a, likely: c, worst: b } = t;
    const varExp = (a * a + b * b + c * c - a * b - a * c - b * c) / 18;
    expect(Math.abs(m - triMean(t)) / triMean(t)).toBeLessThan(0.003);
    expect(Math.abs(s2 / n - m * m - varExp) / varExp).toBeLessThan(0.02);
  });

  it('退化した分布（幅 0）は best、最頻値が端でも範囲内', () => {
    expect(sampleTriangle({ best: 0.2, likely: 0.2, worst: 0.2 }, 0.7)).toBe(0.2);
    expect(sampleTriangle({ best: 0, likely: 0, worst: 0 }, 0.3)).toBe(0);
    const left = { best: 0.1, likely: 0.1, worst: 0.4 }; // 最頻値 = 最小
    const right = { best: 0.1, likely: 0.4, worst: 0.4 }; // 最頻値 = 最大
    for (const u of [0, 0.25, 0.5, 0.75, 0.999]) {
      for (const tt of [left, right]) {
        const v = sampleTriangle(tt, u);
        // 浮動小数の丸めで端を 1 ulp 程度はみ出すことはある（0.4 − √0.09 = 0.09999999999999998）
        expect(v).toBeGreaterThanOrEqual(0.1 - 1e-12);
        expect(v).toBeLessThanOrEqual(0.4 + 1e-12);
        expect(Number.isNaN(v)).toBe(false);
      }
    }
    expect(sampleTriangle(left, 0)).toBeCloseTo(0.1, 12);
    expect(sampleTriangle(right, 0.999999)).toBeCloseTo(0.4, 3);
  });
});

describe('resolveTriangle（専門家モード）', () => {
  const f = toy.factors[0]!;
  it('平均は 3 点それぞれの平均', () => {
    const t = resolveTriangle(f, { kind: 'average' });
    expect(t.best).toBeCloseTo(0.15, 15);
    expect(t.likely).toBeCloseTo(0.45, 15);
    expect(t.worst).toBeCloseTo(0.9, 15);
  });
  it('指定した専門家の分布（expert キーは落とす）', () => {
    expect(resolveTriangle(f, { kind: 'expert', expert: 'e2' })).toEqual({ best: 0, likely: 0.3, worst: 0.6 });
  });
  it('その要因に該当の専門家がいなければ平均に戻る', () => {
    expect(resolveTriangle(f, { kind: 'expert', expert: 'nobody' })).toEqual(resolveTriangle(f, { kind: 'average' }));
  });
  it('三角分布が無い要因は 0', () => {
    expect(resolveTriangle(factor({ id: 'Z', kind: 'direct' }), { kind: 'average' })).toEqual({ best: 0, likely: 0, worst: 0 });
  });
  it('§6: 全要因の平均分布（S.T. / Y.T. の各点平均）', () => {
    const avg = Object.fromEntries(SEED_FACTORS.map((x) => [x.id, resolveTriangle(x, { kind: 'average' })]));
    expect(avg.F03!.best).toBeCloseTo(0.055, 12);
    expect(avg.F03!.likely).toBeCloseTo(0.11, 12);
    expect(avg.F03!.worst).toBeCloseTo(0.21, 12);
    expect(triMean(avg.F06!)).toBeCloseTo((0.095 + 0.175 + 0.285) / 3, 12);
  });
});

describe('clampLevel / levelOf', () => {
  it('丸めと範囲', () => {
    expect(clampLevel(undefined)).toBe(0);
    expect(clampLevel(Number.NaN)).toBe(0);
    expect(clampLevel(Infinity)).toBe(0); // 非有限は L0 扱い
    expect(clampLevel(-1)).toBe(0);
    expect(Object.is(clampLevel(-0.4), -0)).toBe(false);
    expect(clampLevel(0)).toBe(0);
    expect(clampLevel(1)).toBe(1);
    expect(clampLevel(2.4)).toBe(2);
    expect(clampLevel(2.5)).toBe(3);
    expect(clampLevel(3)).toBe(3);
    expect(clampLevel(4)).toBe(3);
  });
  it('キーが無い要因は L0', () => {
    expect(levelOf({ A: 2 }, 'A')).toBe(2);
    expect(levelOf({ A: 2 }, 'B')).toBe(0);
  });
});

describe('multipliers / expectedCO（手計算の小モデル）', () => {
  // 平均の分布: A (0.15, 0.45, 0.9) → 平均 0.5、B (0.09, 0.12, 0.15) → 平均 0.12
  it('間接要因 L → 対象の直接要因に m = 1 + k × L/3', () => {
    expect(multipliers(toy, {})).toEqual({ A: 1 });
    expect(multipliers(toy, { C: 1 }).A).toBeCloseTo(1.1, 15);
    expect(multipliers(toy, { C: 2 }).A).toBeCloseTo(1.2, 15);
    expect(multipliers(toy, { C: 3 }).A).toBeCloseTo(1.3, 15);
    expect(multipliers(toy, { C: 3 })).not.toHaveProperty('B');
  });

  it('ΣCO = Σ CO_i × m_i（A: 0.5 × 2/3 × 1.2、B: 0.12 × 1）', () => {
    const r = expectedCO(toy, { A: 2, B: 3, C: 2 });
    expect(r.byFactor.A).toBeCloseTo(0.5 * (2 / 3) * 1.2, 14);
    expect(r.byFactor.B).toBeCloseTo(0.12, 14);
    expect(r.sco).toBeCloseTo(0.4 + 0.12, 14);
  });

  it('間接要因は自分の CO を足さない（三角分布を持っていても）', () => {
    expect(expectedCO(toy, { C: 3 }).sco).toBe(0);
    expect(expectedCO(toy, { C: 3 }).byFactor).not.toHaveProperty('C');
    expect(directFactors(toy).map((f) => f.id)).toEqual(['A', 'B']);
  });

  it('対象の直接要因が L0 なら間接要因は効かない', () => {
    expect(expectedCO(toy, { A: 0, C: 3, B: 1 }).sco).toBeCloseTo(0.04, 14);
  });

  it('間接要因の対象が存在しない・未設定なら無視', () => {
    const m: ModelSpec = { ...toy, factors: [...toy.factors.slice(0, 2), factor({ id: 'D', kind: 'indirect', targetFactorId: 'X' }), factor({ id: 'E', kind: 'indirect' })] };
    expect(expectedCO(m, { A: 3, D: 3, E: 3 }).byFactor.A).toBeCloseTo(0.5, 14);
  });

  it('専門家モードで ΣCO が変わる（e1: A 平均 0.7、B 0.12）', () => {
    const e1 = expectedCO({ ...toy, expertMode: { kind: 'expert', expert: 'e1' } }, { A: 3, B: 3 });
    expect(e1.byFactor.A).toBeCloseTo(0.7, 14);
    expect(e1.sco).toBeCloseTo(0.82, 14);
  });

  it('§6 G3: ΣCO = 0.7433…（要因ごとの手計算の和）', () => {
    const avgMean = (id: string) => triMean(resolveTriangle(SEED_FACTORS.find((f) => f.id === id)!, { kind: 'average' }));
    const L = SEED_G3.levels as Record<string, number>;
    const mF01 = 1 + DEFAULT_K * (L.F02! / 3);
    expect(mF01).toBeCloseTo(1.15, 14);
    const hand =
      avgMean('F01') * (L.F01! / 3) * mF01 +
      ['F03', 'F04', 'F05', 'F06', 'F07', 'F08'].reduce((s, id) => s + avgMean(id) * (L[id]! / 3), 0);
    const r = expectedCO(SEED_MODEL, SEED_G3.levels);
    expect(r.sco).toBeCloseTo(hand, 14);
    expect(r.sco).toBeCloseTo(0.74333333, 7);
    // 開発者のスキル・経験（F03, L1）: 0.125 × 1/3
    expect(r.byFactor.F03).toBeCloseTo(0.125 / 3, 14);
    expect(Object.keys(r.byFactor).sort()).toEqual(['F01', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08']);
  });

  it('レベルについて ΣCO は単調非減少', () => {
    for (const id of ['F01', 'F02', 'F03', 'F06']) {
      let prev = -1;
      for (let l = 0; l <= 3; l++) {
        const s = expectedCO(SEED_MODEL, { ...SEED_G3.levels, [id]: l }).sco;
        expect(s).toBeGreaterThanOrEqual(prev);
        prev = s;
      }
    }
  });
});
