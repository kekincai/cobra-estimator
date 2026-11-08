import { DEFAULT_SEED, buildModel, expectedCO, simulate, type ModelSpec } from 'cobra-core';
import { SEED_G3, SEED_GENERATIONS, SEED_MODEL, SEED_PROJECTS } from 'cobra-core/seed';
import { describe, expect, it } from 'vitest';
import { apportion, contributionTotal, displayContribution, factorContributions, topWithRest } from './contribution';
import { fmt1 } from './format';

const adopted = SEED_PROJECTS.filter((p) => p.adopted);
const excluded = SEED_PROJECTS.filter((p) => !p.adopted);
const v3 = buildModel(SEED_MODEL, adopted, { runs: 10_000, seed: DEFAULT_SEED, excluded });
const nominalG3 = v3.alpha * SEED_G3.sizeFP;

describe('factorContributions（期待値の寄与）', () => {
  const cs = factorContributions(SEED_MODEL, SEED_G3.levels, nominalG3);

  it('mm = 名目 × expectedCO.byFactor、直接要因だけ、大きい順', () => {
    const det = expectedCO(SEED_MODEL, SEED_G3.levels);
    expect(cs.map((c) => c.factorId)).toEqual(['F01', 'F06', 'F05', 'F04', 'F03', 'F07', 'F08']);
    for (const c of cs) expect(c.mm).toBeCloseTo(nominalG3 * det.byFactor[c.factorId]!, 12);
    expect(contributionTotal(cs)).toBeCloseTo(nominalG3 * det.sco, 12);
    expect(cs.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1, 12);
  });

  it('§6 G3 の寄与（表示 1 桁）: 01 7.7 / 06 4.7 / 05 2.5 / 04 1.8 / 03 1.0 / 07 0.5 / 08 0.4', () => {
    expect(cs.map((c) => fmt1(c.mm))).toEqual(['7.7', '4.7', '2.5', '1.8', '1.0', '0.5', '0.4']);
    expect(cs.map((c) => displayContribution(c.mm))).toEqual([7.7, 4.7, 2.5, 1.8, 1.0, 0.5, 0.4]);
  });

  it('根因: 「開発者のスキル・経験」(F03) は期待値 1.049 → 1.0、保存済みのモンテカルロ値 1.054 → 1.1', () => {
    const f03 = cs.find((c) => c.factorId === 'F03')!;
    expect(f03.mm).toBeCloseTo(1.0492, 4);
    const sim = simulate(SEED_MODEL, { alpha: v3.alpha, sizeFP: SEED_G3.sizeFP, levels: SEED_G3.levels, sigma: v3.sigma }, { runs: 10_000, seed: DEFAULT_SEED });
    const mc = sim.contributions.find((c) => c.factorId === 'F03')!;
    expect(mc.mm).toBeCloseTo(1.0541, 4);
    expect(fmt1(mc.mm)).toBe('1.1');
    expect(fmt1(f03.mm)).toBe('1.0');
    // 同じ量の推定: 差はモンテカルロの乱数誤差（< 1%）
    expect(Math.abs(mc.mm / f03.mm - 1)).toBeLessThan(0.01);
    // 名目は同じ（口径の違いは名目ではなく E[CO_i × m_i] の求め方）
    expect(sim.nominal).toBe(nominalG3);
  });

  it('同じ入力なら画面に依らず同じ値（乱数・runs・seed に依存しない）', () => {
    expect(factorContributions(SEED_MODEL, SEED_G3.levels, nominalG3)).toEqual(cs);
  });

  it('G1・G2（規模 1,050 FP）の F03 は 0.9', () => {
    for (const g of SEED_GENERATIONS.slice(0, 2)) {
      const c = factorContributions(SEED_MODEL, g.levels, v3.alpha * g.sizeFP);
      expect(fmt1(c.find((x) => x.factorId === 'F03')!.mm)).toBe('0.9');
    }
  });

  it('間接要因 F02 は行に出ず、F01 に × m で入る', () => {
    const without = factorContributions(SEED_MODEL, { ...SEED_G3.levels, F02: 0 }, nominalG3);
    const f01 = (x: typeof cs) => x.find((c) => c.factorId === 'F01')!.mm;
    expect(cs.some((c) => c.factorId === 'F02')).toBe(false);
    expect(f01(cs) / f01(without)).toBeCloseTo(1.15, 12);
  });

  it('全要因 L0・名目 0・名目 NaN → mm も share も 0', () => {
    for (const [levels, nominal] of [[{}, nominalG3], [SEED_G3.levels, 0], [SEED_G3.levels, Number.NaN]] as const) {
      const z = factorContributions(SEED_MODEL, levels, nominal);
      expect(z).toHaveLength(7);
      expect(z.every((c) => c.mm === 0 && c.share === 0)).toBe(true);
    }
  });

  it('同値は要因の並び順（安定）', () => {
    const tri = [{ expert: 'e', best: 0.3, likely: 0.3, worst: 0.3 }];
    const base = { no: 1, category: '', definition: '', levels: ['', '', '', ''] as [string, string, string, string], origin: 'custom' as const, triangles: tri };
    const m: ModelSpec = { k: 0.225, expertMode: { kind: 'average' }, factors: ['B', 'A', 'C'].map((id) => ({ ...base, id, name: id, kind: 'direct' as const })) };
    expect(factorContributions(m, { A: 1, B: 1, C: 2 }, 10).map((c) => c.factorId)).toEqual(['C', 'B', 'A']);
  });
});

describe('topWithRest', () => {
  const cs = factorContributions(SEED_MODEL, SEED_G3.levels, nominalG3);
  it('上位 5 + その他 2（生の値の和）', () => {
    const { rows, rest } = topWithRest(cs, 5);
    expect(rows.map((r) => r.factorId)).toEqual(['F01', 'F06', 'F05', 'F04', 'F03']);
    expect(rest!.count).toBe(2);
    expect(rest!.mm).toBeCloseTo(cs[5]!.mm + cs[6]!.mm, 12);
    expect(fmt1(rest!.mm)).toBe('0.9');
    expect(rest!.share).toBeCloseTo(cs[5]!.share + cs[6]!.share, 12);
  });
  it('L0（mm = 0）の要因は除く、件数が足りなければ rest は null', () => {
    const few = factorContributions(SEED_MODEL, { F01: 3, F03: 1 }, nominalG3);
    const { rows, rest } = topWithRest(few, 5);
    expect(rows.map((r) => r.factorId)).toEqual(['F01', 'F03']);
    expect(rest).toBeNull();
    expect(topWithRest(few, 0).rows).toEqual([]);
  });
});

describe('apportion（最大剰余法）', () => {
  it('G3: 和 18.718 → 各行の和が 18.7 になるよう配分', () => {
    const cs = factorContributions(SEED_MODEL, SEED_G3.levels, nominalG3);
    const a = apportion(cs.map((c) => c.mm));
    expect(a).toEqual([7.7, 4.7, 2.5, 1.8, 1.1, 0.5, 0.4]);
    expect(Math.round(a.reduce((s, v) => s + v, 0) * 10) / 10).toBe(18.7);
  });
  it('各行の誤差は 1 単位未満、和は常に合計の丸め', () => {
    const xs = [3.333, 3.333, 3.334];
    const a = apportion(xs);
    expect(a).toEqual([3.3, 3.3, 3.4]);
    for (let trial = 0; trial < 50; trial++) {
      const vs = Array.from({ length: 7 }, (_, i) => ((i + 1) * 1.37 * (trial + 1)) % 9.7);
      const r = apportion(vs);
      const sum = vs.reduce((s, v) => s + v, 0);
      expect(Math.round(r.reduce((s, v) => s + v, 0) * 10)).toBe(Math.round(sum * 10));
      r.forEach((v, i) => expect(Math.abs(v - vs[i]!)).toBeLessThan(0.1 + 1e-9));
    }
  });
  it('total を指定すると、その丸めに合わせる（比例配分）', () => {
    expect(apportion([1, 1], 1, 3)).toEqual([1.5, 1.5]);
    expect(apportion([2, 1], 0, 10)).toEqual([7, 3]);
  });
  it('端数が同じなら元の値が大きい方、さらに同じなら先の行', () => {
    expect(apportion([0.05, 0.05], 1, 0.1)).toEqual([0.1, 0]);
    expect(apportion([1.25, 0.25], 1)).toEqual([1.3, 0.2]);
  });
  it('空・全 0・負・NaN', () => {
    expect(apportion([])).toEqual([]);
    expect(apportion([0, 0])).toEqual([0, 0]);
    expect(apportion([-1, 2])).toEqual([0, 2]);
    expect(apportion([Number.NaN, 1.04])).toEqual([0, 1]);
    expect(apportion([1, 2], 1, Number.NaN)).toEqual([0, 0]);
  });
  it('桁数 0（%）: 33/33/33 → 和 100', () => {
    expect(apportion([1 / 3, 1 / 3, 1 / 3].map((x) => x * 100), 0)).toEqual([34, 33, 33]);
  });
});
