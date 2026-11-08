import { describe, expect, it } from 'vitest';
import { binSamples, clamp, histRange, niceStep, niceTicks } from './stats';

describe('binSamples', () => {
  it('counts values into equal-width bins and ignores out-of-range values', () => {
    expect(binSamples([0, 0.5, 1, 1.5, 2, 3.9, 4, 5], 0, 4, 4)).toEqual([2, 2, 1, 1]);
  });
  it('returns zeros for an empty range', () => {
    expect(binSamples([1, 2], 3, 3, 2)).toEqual([0, 0]);
  });
});

describe('niceTicks', () => {
  it('uses 1/2/5 steps', () => {
    expect(niceStep(38, 4)).toBe(10);
    expect(niceStep(8, 4)).toBe(2);
    expect(niceTicks(28, 66, 4)).toEqual([30, 40, 50, 60]);
    expect(niceTicks(37.2, 48.1, 4)).toEqual([38, 40, 42, 44, 46, 48]);
  });
});

describe('histRange', () => {
  it('pads the 0.5–99.5 percentile range', () => {
    const xs = Array.from({ length: 1001 }, (_, i) => 10 + i / 100);
    const { lo, hi } = histRange(xs);
    expect(lo).toBeLessThan(10.05);
    expect(hi).toBeGreaterThan(19.95);
    expect(lo).toBeGreaterThan(8);
    expect(hi).toBeLessThan(22);
  });
});

describe('binSamples（境界・異常値）', () => {
  it('左閉・右開: lo は先頭、hi ちょうどは数えない、区間の境目は右の区間', () => {
    expect(binSamples([0, 1, 2, 3, 4], 0, 4, 4)).toEqual([1, 1, 1, 1]);
  });
  it('件数の合計 = 範囲内のサンプル数', () => {
    const xs = Array.from({ length: 1000 }, (_, i) => i / 10); // 0〜99.9
    const c = binSamples(xs, 10, 60, 24);
    expect(c.reduce((a, b) => a + b, 0)).toBe(xs.filter((x) => x >= 10 && x < 60).length);
  });
  it('NaN・±Infinity は数えない', () => {
    expect(binSamples([Number.NaN, -Infinity, 1, Infinity], 0, 2, 2)).toEqual([0, 1]);
  });
  it('区間数 0・負・非有限、範囲が逆・非有限なら全 0', () => {
    expect(binSamples([1], 0, 2, 0)).toEqual([]);
    expect(binSamples([1], 0, 2, -3)).toEqual([]);
    expect(binSamples([1], 0, 2, Number.NaN)).toEqual([]);
    expect(binSamples([1], 2, 0, 2)).toEqual([0, 0]);
    expect(binSamples([1], 0, Infinity, 2)).toEqual([0, 0]);
    expect(binSamples([1], Number.NaN, 2, 2)).toEqual([0, 0]);
  });
  it('配列に余計なキーを作らない', () => {
    const c = binSamples([Number.NaN, 5], 0, 10, 2);
    expect(Object.keys(c)).toEqual(['0', '1']);
  });
});

describe('niceStep / niceTicks（境界・異常値）', () => {
  it('1 / 2 / 5 × 10^k、小さい・大きい幅', () => {
    expect(niceStep(1, 4)).toBe(0.2);
    expect(niceStep(0.03, 3)).toBeCloseTo(0.01, 12);
    expect(niceStep(5000, 5)).toBe(1000);
    expect(niceStep(35, 4)).toBe(10); // 8.75 → 10
    expect(niceStep(28, 4)).toBe(5); // 7 → 5
  });
  it('幅 0・負・NaN は 1', () => {
    expect(niceStep(0, 4)).toBe(1);
    expect(niceStep(-5, 4)).toBe(1);
    expect(niceStep(Number.NaN, 4)).toBe(1);
    expect(niceStep(10, 0)).toBe(niceStep(10, 1));
  });
  it('目盛りは [lo, hi] の内側、昇順、刻みは一定', () => {
    const t = niceTicks(31.4, 56.9, 5);
    expect(t).toEqual([35, 40, 45, 50, 55]);
    const u = niceTicks(0, 1, 5);
    expect(u).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });
  it('負の範囲・0 をまたぐ範囲', () => {
    expect(niceTicks(-3, 3, 3)).toEqual([-2, 0, 2]);
    expect(niceTicks(-10, -2, 4)).toEqual([-10, -8, -6, -4, -2]);
  });
  it('lo = hi はその点（刻みに乗るとき）、lo > hi・非有限は空', () => {
    expect(niceTicks(40, 40)).toEqual([40]);
    expect(niceTicks(50, 40)).toEqual([]);
    expect(niceTicks(Number.NaN, 40)).toEqual([]);
    expect(niceTicks(0, Infinity)).toEqual([]);
  });
  it('桁落ちする範囲でも止まる（最大 1,000 本）', () => {
    expect(niceTicks(1e20, 1e20 + 1, 4).length).toBeLessThanOrEqual(1000);
  });
});

describe('histRange（境界）', () => {
  it('空なら 0〜1、1 要素・全部同じ値でも幅を持つ', () => {
    expect(histRange([])).toEqual({ lo: 0, hi: 1 });
    const one = histRange([40]);
    expect(one.lo).toBeLessThan(40);
    expect(one.hi).toBeGreaterThan(40);
    const same = histRange([5, 5, 5]);
    expect(same.hi).toBeGreaterThan(same.lo);
  });
  it('下限は 0 未満にしない', () => {
    expect(histRange([0, 0.1, 0.2]).lo).toBe(0);
  });
  it('0.5〜99.5 パーセンタイルの外の外れ値は範囲を広げない', () => {
    const xs = [...Array.from({ length: 999 }, (_, i) => 30 + i / 50), 1000].sort((a, b) => a - b);
    expect(histRange(xs).hi).toBeLessThan(60);
  });
});

describe('clamp', () => {
  it('範囲に収める', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(0, 0, 0)).toBe(0);
  });
});
