import { describe, expect, it } from 'vitest';
import { binSamples, histRange, niceStep, niceTicks } from './stats';

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
