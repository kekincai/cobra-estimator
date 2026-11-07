import { SEED_G3, SEED_MODEL } from 'cobra-core/seed';
import { simulate } from 'cobra-core';
import { describe, expect, it } from 'vitest';
import { bandScale, exceedAt, fromSim, fromStored, viewBins } from './results';

const sim = simulate(SEED_MODEL, { alpha: 0.021, sizeFP: SEED_G3.sizeFP, levels: SEED_G3.levels }, { runs: 10_000, seed: 20261106 });
const live = fromSim(sim);
const { samples: _drop, ...storedShape } = sim;
const stored = fromStored(JSON.parse(JSON.stringify(storedShape)))!;

describe('dashboard results', () => {
  it('保存済み results を読み取れる', () => {
    expect(stored).not.toBeNull();
    expect(stored.p50).toBeCloseTo(sim.p50, 6);
    expect(stored.samples).toBeUndefined();
    expect(fromStored({ foo: 1 })).toBeNull();
    expect(fromStored(null)).toBeNull();
  });

  it('ヒストグラム補間の超過確率はサンプルの値に近い', () => {
    for (const x of [35, 42, 45, 50]) expect(Math.abs(exceedAt(stored, x) - exceedAt(live, x))).toBeLessThan(0.02);
    expect(exceedAt(live, 0)).toBe(1);
    expect(exceedAt(stored, 1e9)).toBe(0);
  });

  it('帯の目盛りは 5 人月刻みで P5〜P95 を含む', () => {
    const { lo, hi } = bandScale(live);
    expect(lo % 5).toBe(0);
    expect(hi % 5).toBe(0);
    expect(lo).toBeLessThanOrEqual(live.pct[5]);
    expect(hi).toBeGreaterThan(live.pct[95]);
    const wide = bandScale(live, 80);
    expect(wide.hi).toBeGreaterThanOrEqual(85);
    expect(bandScale(live, 5).lo).toBe(5);
  });

  it('表示ビンは 24 本で中央付近を覆う', () => {
    const v = viewBins(live);
    expect(v.bins).toHaveLength(24);
    expect(v.lo).toBeLessThan(live.pct[5]);
    expect(v.hi).toBeGreaterThan(live.pct[95]);
    expect(viewBins(stored).bins).toHaveLength(stored.histogram.counts.length);
  });
});
