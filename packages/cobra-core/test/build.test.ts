// モデル構築（§2.4）: α・LOO・不整合・σ。
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SEED,
  INCONSISTENCY_THRESHOLD,
  buildModel,
  expectedCO,
  isInconsistent,
  predictiveSigma,
  projectAlpha,
  projectGap,
  type ModelSpec,
  type ProjectRecord,
} from '../src/index';
import { SEED_MODEL, SEED_PROJECTS } from '../src/seed';

const adopted: ProjectRecord[] = SEED_PROJECTS.filter((p) => p.adopted);
const excluded: ProjectRecord[] = SEED_PROJECTS.filter((p) => !p.adopted);
const opts = { runs: 2000, seed: DEFAULT_SEED };

describe('projectAlpha / projectGap / isInconsistent', () => {
  it('α_j = 工数 / (規模 × (1 + ΣCO_j))', () => {
    for (const p of adopted) {
      const sco = expectedCO(SEED_MODEL, p.levels).sco;
      expect(projectAlpha(SEED_MODEL, p)).toBeCloseTo(p.effortMM / (p.sizeFP * (1 + sco)), 15);
    }
    // PJ-001: L0 以外は F08 = 1 → ΣCO = 平均(0.015, 0.045, 0.085)/3 = 0.0161…
    const p1 = adopted[0]!;
    const sco1 = (0.015 + 0.045 + 0.085) / 3 / 3;
    expect(projectAlpha(SEED_MODEL, p1)).toBeCloseTo(8.2 / (420 * (1 + sco1)), 14);
  });
  it('gap = α_j / α − 1', () => {
    const p = adopted[3]!;
    expect(projectGap(SEED_MODEL, 0.02, p)).toBeCloseTo(projectAlpha(SEED_MODEL, p) / 0.02 - 1, 15);
  });
  it('閾値は |gap| > 0.25（ちょうど 0.25 は整合）', () => {
    expect(INCONSISTENCY_THRESHOLD).toBe(0.25);
    expect(isInconsistent(0.25)).toBe(false);
    expect(isInconsistent(-0.25)).toBe(false);
    expect(isInconsistent(0.2500001)).toBe(true);
    expect(isInconsistent(-0.26)).toBe(true);
    expect(isInconsistent(0)).toBe(false);
  });
});

describe('buildModel（§6 の実績）', () => {
  const r = buildModel(SEED_MODEL, adopted, { ...opts, excluded });

  it('α = mean(α_j)、alphas は入力順', () => {
    expect(r.alphas.map((a) => a.projectId)).toEqual(adopted.map((p) => p.id));
    const mean = r.alphas.reduce((s, a) => s + a.alpha, 0) / r.n;
    expect(r.alpha).toBeCloseTo(mean, 15);
    for (const [j, a] of r.alphas.entries()) {
      expect(a.sco).toBe(expectedCO(SEED_MODEL, adopted[j]!.levels).sco);
      expect(a.alpha).toBe(projectAlpha(SEED_MODEL, adopted[j]!));
    }
  });

  it('LOO の予測は自分を除いた α で計算する（他の実績だけで構築した α と一致）', () => {
    for (const [j, p] of adopted.entries()) {
      const others = adopted.filter((_, i) => i !== j);
      const alphaMinus = buildModel(SEED_MODEL, others, { runs: 10, seed: 1 }).alpha;
      const sco = expectedCO(SEED_MODEL, p.levels).sco;
      expect(r.loo[j]!.projectId).toBe(p.id);
      expect(r.loo[j]!.predicted).toBeCloseTo(alphaMinus * p.sizeFP * (1 + sco), 10);
    }
  });

  it('LOO の予測は自分の工数に依存しない（工数を変えても予測は同じ）', () => {
    const j = 4;
    const tweaked = adopted.map((p, i) => (i === j ? { ...p, effortMM: p.effortMM * 3 } : p));
    const t = buildModel(SEED_MODEL, tweaked, opts);
    expect(t.loo[j]!.predicted).toBeCloseTo(r.loo[j]!.predicted, 12);
    expect(t.loo[j]!.actual).toBeCloseTo(adopted[j]!.effortMM * 3, 12);
    // 他の実績の予測は変わる（α_j が他の α₋ᵢ に入るため）
    expect(t.loo[0]!.predicted).not.toBeCloseTo(r.loo[0]!.predicted, 6);
  });

  it('error = (予測 − 実績) / 実績、mre = |error|、MMRE / PRED(25)', () => {
    for (const l of r.loo) {
      expect(l.error).toBeCloseTo((l.predicted - l.actual) / l.actual, 15);
      expect(l.mre).toBe(Math.abs(l.error));
    }
    expect(r.mmre).toBeCloseTo(r.loo.reduce((s, l) => s + l.mre, 0) / r.n, 15);
    expect(r.pred25).toBe(r.loo.filter((l) => l.mre <= 0.25).length / r.n);
  });

  it('σ = sqrt(mean(ln(実績 / 予測)²))（平均を引かない）', () => {
    const hand = Math.sqrt(r.loo.reduce((s, l) => s + Math.log(l.actual / l.predicted) ** 2, 0) / r.n);
    expect(r.sigma).toBeCloseTo(hand, 15);
    expect(predictiveSigma(r.loo)).toBe(r.sigma);
  });

  it('CI は bootstrap の 2.5 / 97.5 パーセンタイル: 下限 < α < 上限、同じ seed で同じ、seed が違えば少し違う', () => {
    expect(r.ci95[0]).toBeLessThan(r.alpha);
    expect(r.ci95[1]).toBeGreaterThan(r.alpha);
    expect(buildModel(SEED_MODEL, adopted, opts).ci95).toEqual(r.ci95);
    const other = buildModel(SEED_MODEL, adopted, { ...opts, seed: 1 }).ci95;
    expect(other).not.toEqual(r.ci95);
    expect(Math.abs(other[0] - r.ci95[0]) / r.ci95[0]).toBeLessThan(0.01);
    // α_j の最小・最大の外には出ない
    const as = r.alphas.map((a) => a.alpha);
    expect(r.ci95[0]).toBeGreaterThanOrEqual(Math.min(...as));
    expect(r.ci95[1]).toBeLessThanOrEqual(Math.max(...as));
  });

  it('除外中の実績は α に使わず、不整合だけ判定する（excluded: true）', () => {
    const withoutExcluded = buildModel(SEED_MODEL, adopted, opts);
    expect(r.alpha).toBe(withoutExcluded.alpha);
    expect(r.n).toBe(adopted.length);
    expect(r.inconsistencies).toEqual([{ projectId: 'PJ-007', gap: projectGap(SEED_MODEL, r.alpha, excluded[0]!), excluded: true }]);
    expect(r.inconsistencies[0]!.gap).toBeCloseTo(-0.26008, 4);
  });

  it('除外中でも整合していれば挙げない', () => {
    const fine = { ...excluded[0]!, levels: {}, effortMM: 1100 * r.alpha };
    expect(buildModel(SEED_MODEL, adopted, { ...opts, excluded: [fine] }).inconsistencies).toEqual([]);
  });
});

describe('buildModel（手計算）', () => {
  const none: ModelSpec = { factors: [], k: 0.225, expertMode: { kind: 'average' } };
  it('2 件: α = 平均、LOO はもう一方の α_j そのもの', () => {
    const ps: ProjectRecord[] = [
      { id: 'a', sizeFP: 100, effortMM: 2, levels: {} },
      { id: 'b', sizeFP: 200, effortMM: 6, levels: {} },
    ];
    const r = buildModel(none, ps, { runs: 500, seed: 3 });
    expect(r.alpha).toBeCloseTo((0.02 + 0.03) / 2, 15);
    expect(r.loo[0]!.predicted).toBeCloseTo(0.03 * 100, 12);
    expect(r.loo[1]!.predicted).toBeCloseTo(0.02 * 200, 12);
    expect(r.loo[0]!.error).toBeCloseTo(0.5, 12);
    expect(r.loo[1]!.error).toBeCloseTo(-1 / 3, 12);
    expect(r.pred25).toBe(0);
    // gap = ±20% → 整合
    expect(r.inconsistencies).toEqual([]);
  });
  it('全件同じ生産性 → MMRE 0・PRED 1・σ 0・CI は点', () => {
    const ps: ProjectRecord[] = [1, 2, 3, 4].map((k) => ({ id: `p${k}`, sizeFP: 100 * k, effortMM: 2 * k, levels: {} }));
    const r = buildModel(none, ps, { runs: 300, seed: 3 });
    expect(r.alpha).toBeCloseTo(0.02, 15);
    expect(r.mmre).toBeCloseTo(0, 12);
    expect(r.pred25).toBe(1);
    expect(r.sigma).toBeCloseTo(0, 12);
    expect(r.ci95[0]).toBeCloseTo(0.02, 15);
    expect(r.ci95[1]).toBeCloseTo(0.02, 15);
  });
  it('ΣCO を含む: α_j = e / (s(1 + ΣCO))', () => {
    const m: ModelSpec = {
      k: 0.225,
      expertMode: { kind: 'average' },
      factors: [{ id: 'X', no: 1, name: 'X', category: '', kind: 'direct', definition: '', levels: ['', '', '', ''], origin: 'custom', triangles: [{ expert: 'e', best: 0.3, likely: 0.3, worst: 0.3 }] }],
    };
    const ps: ProjectRecord[] = [
      { id: 'a', sizeFP: 100, effortMM: 2.2, levels: { X: 1 } }, // ΣCO 0.1 → α 0.02
      { id: 'b', sizeFP: 100, effortMM: 3.9, levels: { X: 3 } }, // ΣCO 0.3 → α 0.03
    ];
    const r = buildModel(m, ps, { runs: 100, seed: 1 });
    expect(r.alphas.map((a) => a.alpha)).toEqual([expect.closeTo(0.02, 14), expect.closeTo(0.03, 14)]);
    expect(r.loo[0]!.predicted).toBeCloseTo(0.03 * 100 * 1.1, 12);
    expect(r.loo[1]!.predicted).toBeCloseTo(0.02 * 100 * 1.3, 12);
  });
  it('2 件未満はエラー（日本語メッセージ）', () => {
    expect(() => buildModel(none, [], { runs: 1, seed: 1 })).toThrow('2 件以上');
    expect(() => buildModel(none, [{ id: 'a', sizeFP: 1, effortMM: 1, levels: {} }], { runs: 1, seed: 1 })).toThrow('2 件以上');
  });
});

describe('predictiveSigma', () => {
  it('実績・予測が正でないものは除く', () => {
    expect(predictiveSigma([{ actual: 0, predicted: 1 }, { actual: 1, predicted: -1 }])).toBe(0);
    expect(predictiveSigma([{ actual: Math.E, predicted: 1 }, { actual: 0, predicted: 1 }])).toBeCloseTo(1, 15);
  });
  it('符号に依らない（過大・過小が対称）', () => {
    expect(predictiveSigma([{ actual: 2, predicted: 1 }])).toBeCloseTo(predictiveSigma([{ actual: 1, predicted: 2 }]), 15);
    expect(predictiveSigma([{ actual: 2, predicted: 1 }])).toBeCloseTo(Math.LN2, 15);
  });
});
