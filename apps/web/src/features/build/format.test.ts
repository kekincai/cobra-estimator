import { describe, expect, it } from 'vitest';
import { deltaTone, displayDelta, roundTo, signed } from './format';
import { stageAt } from './progress';
import { estimateComputeMs, estimateWaitMs, formatElapsed, formatWait, MIN_VISIBLE_MS } from './runEstimate';

describe('roundTo / displayDelta', () => {
  it('subtracts the values as displayed', () => {
    // 0.02284 → 0.0228、0.02096 → 0.0210：表示どおり +0.0018（生の差 0.00188 を丸めた +0.0019 ではない）
    expect(displayDelta(0.02284, 0.02096, 4)).toBe(0.0018);
    expect(signed(displayDelta(0.02284, 0.02096, 4)!, 4)).toBe('+0.0018');
  });
  it('MMRE pt: 12.84% vs 18.36% → −5.6 pt (12.8 − 18.4)', () => {
    expect(displayDelta(12.84, 18.36, 1)).toBe(-5.6);
  });
  it('rounding boundary x.x5', () => {
    expect(roundTo(0.125, 2)).toBe(0.13);
    expect(displayDelta(0.02105, 0.0210, 4)).toBe(0.0001);
  });
  it('same displayed value → exactly 0 (not −0)', () => {
    const d = displayDelta(0.020981, 0.020979, 4);
    expect(d).toBe(0);
    expect(Object.is(d, -0)).toBe(false);
    expect(signed(d!, 4)).toBe('±0.0000');
  });
  it('null / non-finite', () => {
    expect(displayDelta(null, 1, 1)).toBeNull();
    expect(displayDelta(1, undefined, 1)).toBeNull();
    expect(displayDelta(NaN, 1, 1)).toBeNull();
  });
});

describe('deltaTone', () => {
  it('0 is neutral, not worse', () => {
    expect(deltaTone(0)).toBe('same');
    expect(deltaTone(0.0012)).toBe('worse');
    expect(deltaTone(-0.4)).toBe('better');
    expect(deltaTone(1, false)).toBe('better');
    expect(deltaTone(null)).toBeNull();
  });
});

describe('stageAt', () => {
  it('maps overall progress to stage', () => {
    expect(stageAt(0)).toBe('alpha');
    expect(stageAt(0.349)).toBe('alpha');
    expect(stageAt(0.35)).toBe('montecarlo');
    expect(stageAt(0.8)).toBe('loo');
    expect(stageAt(1)).toBe('loo');
    expect(stageAt(NaN)).toBe('alpha');
  });
});

describe('build time estimate', () => {
  it('compute grows with runs × projects', () => {
    expect(estimateComputeMs(11, 100_000)).toBeGreaterThan(estimateComputeMs(11, 10_000));
    expect(estimateComputeMs(200, 100_000)).toBeGreaterThan(estimateComputeMs(11, 100_000));
    expect(estimateComputeMs(0, 0)).toBeGreaterThan(0);
  });
  it('seed sizes are well under a second of compute', () => {
    expect(estimateComputeMs(11, 10_000)).toBeLessThan(1000);
    expect(estimateComputeMs(11, 100_000)).toBeLessThan(1000);
  });
  it('wait includes the minimum visible time unless reduced motion', () => {
    expect(estimateWaitMs(11, 10_000)).toBe(MIN_VISIBLE_MS);
    expect(estimateWaitMs(11, 10_000, true)).toBeLessThan(1000);
    expect(estimateWaitMs(500, 100_000)).toBeGreaterThan(MIN_VISIBLE_MS);
  });
  it('bad input does not produce NaN', () => {
    expect(Number.isFinite(estimateComputeMs(NaN, -5))).toBe(true);
  });
  it('formatWait / formatElapsed', () => {
    expect(formatWait(150)).toBe('1 秒未満');
    expect(formatWait(1800)).toBe('約 2 秒');
    expect(formatWait(1000)).toBe('約 1 秒');
    expect(formatWait(61_000)).toBe('約 2 分');
    expect(formatWait(NaN)).toBe('—');
    expect(formatElapsed(180)).toBe('0.18 s');
    expect(formatElapsed(2400)).toBe('2.4 s');
    expect(formatElapsed(null)).toBe('—');
  });
});
