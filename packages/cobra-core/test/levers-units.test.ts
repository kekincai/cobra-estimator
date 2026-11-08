// 効く打ち手（§2.5）と単位換算（§2.1）。
import { describe, expect, it } from 'vitest';
import { DEFAULT_UNITS, exceedance, levers, simulate, toFP, toMM, type EstimateInput } from '../src/index';
import { SEED_G3, SEED_MODEL } from '../src/seed';

const input: EstimateInput = { alpha: 0.021, sizeFP: 1200, levels: SEED_G3.levels, sigma: 0.145 };
const opts = { runs: 5000, seed: 17 };

describe('levers', () => {
  const all = levers(SEED_MODEL, input, { ...opts, budget: 45, top: 100 });
  const base = simulate(SEED_MODEL, input, opts);

  it('L ≥ 1 の直接要因すべてが候補（間接要因 F02 は対象外）', () => {
    expect(all.map((l) => l.factorId).sort()).toEqual(['F01', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08']);
  });
  it('1 段下げた条件でのシミュレーションと一致（同じ seed・同じ runs）', () => {
    for (const l of all) {
      expect(l.toLevel).toBe(l.fromLevel - 1);
      const r = simulate(SEED_MODEL, { ...input, levels: { ...input.levels, [l.factorId]: l.toLevel } }, opts);
      expect(l.p50).toBe(r.p50);
      expect(l.deltaP50).toBe(r.p50 - base.p50);
      expect(l.exceedance).toBe(exceedance(r.samples, 45));
    }
  });
  it('削減の大きい順（deltaP50 昇順）、top で切る', () => {
    for (let i = 1; i < all.length; i++) expect(all[i]!.deltaP50).toBeGreaterThanOrEqual(all[i - 1]!.deltaP50);
    expect(levers(SEED_MODEL, input, { ...opts, top: 2 })).toHaveLength(2);
    expect(levers(SEED_MODEL, input, opts)).toHaveLength(3); // 既定 3 件
  });
  it('どれもレベルを下げると P50 は下がる', () => {
    for (const l of all) expect(l.deltaP50).toBeLessThan(0);
  });
  it('全要因 L0 なら打ち手なし', () => {
    expect(levers(SEED_MODEL, { ...input, levels: {} }, opts)).toEqual([]);
  });
  it('予算なしなら exceedance は null', () => {
    expect(levers(SEED_MODEL, input, opts).every((l) => l.exceedance === null)).toBe(true);
  });
  it('入力のレベルを書き換えない', () => {
    const levels = { ...SEED_G3.levels };
    levers(SEED_MODEL, { ...input, levels }, opts);
    expect(levels).toEqual(SEED_G3.levels);
  });
});

describe('toFP / toMM', () => {
  it('既定係数', () => {
    expect(DEFAULT_UNITS).toEqual({ fpPerKloc: 100, fpPerScreen: 30, hoursPerMM: 160 });
    expect(toFP(0, 'KLOC')).toBe(0);
    expect(toFP(1.5, 'KLOC')).toBe(150);
    expect(toFP(1, 'screen')).toBe(30);
    expect(toMM(160, 'hours')).toBe(1);
    expect(toMM(80, 'hours')).toBe(0.5);
    expect(toMM(0, 'hours')).toBe(0);
  });
  it('FP・人月はそのまま（係数に依らない）', () => {
    const u = { fpPerKloc: 1, fpPerScreen: 1, hoursPerMM: 1 };
    expect(toFP(123.4, 'FP', u)).toBe(123.4);
    expect(toMM(12.3, 'MM', u)).toBe(12.3);
  });
  it('換算して戻すと元の値（FP ↔ KLOC、人時 ↔ 人月）', () => {
    for (const v of [0.1, 1, 12.5, 999]) {
      expect(toFP(v, 'KLOC') / DEFAULT_UNITS.fpPerKloc).toBeCloseTo(v, 12);
      expect(toMM(v * DEFAULT_UNITS.hoursPerMM, 'hours')).toBeCloseTo(v, 12);
    }
  });
});
