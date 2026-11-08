import { SEED_G3, SEED_MODEL } from 'cobra-core/seed';
import { simulate } from 'cobra-core';
import { describe, expect, it } from 'vitest';
import { axisTicks, bandScale, binsInRange, exceedAt, fromSim, fromStored, sharedBandScale, viewBins } from './results';

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

describe('全世代共通の目盛り', () => {
  const g2 = fromSim(simulate(SEED_MODEL, { alpha: 0.021, sizeFP: 1000, levels: SEED_G3.levels }, { runs: 4000, seed: 1 }));

  it('全世代の P5〜P95 を覆い、選択に依存しない', () => {
    const s = sharedBandScale([live, g2])!;
    expect(s.lo % 5).toBe(0);
    expect(s.hi % 5).toBe(0);
    expect(s.lo).toBeLessThanOrEqual(Math.min(live.pct[5], g2.pct[5]));
    expect(s.hi).toBeGreaterThan(Math.max(live.pct[95], g2.pct[95]));
    expect(sharedBandScale([g2, live])).toEqual(s);
    // 1 世代なら従来の bandScale と同じ
    expect(sharedBandScale([live])).toEqual(bandScale(live));
    expect(sharedBandScale([live], 45)).toEqual(bandScale(live, 45));
  });

  it('保存済みの予算も含める', () => {
    expect(sharedBandScale([live], 90)!.hi).toBeGreaterThanOrEqual(95);
    expect(sharedBandScale([live], 3)!.lo).toBe(0);
    expect(sharedBandScale([live], -1)).toEqual(sharedBandScale([live]));
  });

  it('結果が無ければ null（null は無視）', () => {
    expect(sharedBandScale([])).toBeNull();
    expect(sharedBandScale([null, undefined])).toBeNull();
    expect(sharedBandScale([null, live])).toEqual(sharedBandScale([live]));
  });
});

describe('binsInRange', () => {
  it('サンプルがあれば範囲内を厳密に数える', () => {
    const b = binsInRange(live, 25, 65);
    expect(b).toHaveLength(24);
    const inRange = Array.from(live.samples!).filter((v) => v >= 25 && v <= 65).length;
    expect(b.reduce((s, x) => s + x.count, 0)).toBe(inRange);
    expect(b[0]!.x).toBeCloseTo(25 + 40 / 48, 9);
  });

  it('保存済みヒストグラムは重なりで按分し、総数を保つ（範囲が全体を覆うとき）', () => {
    const h = stored.histogram;
    const lo = Math.floor(h.lo) - 5;
    const hi = Math.ceil(h.lo + h.width * h.counts.length) + 5;
    const b = binsInRange(stored, lo, hi);
    const total = h.counts.reduce((s, c) => s + c, 0);
    expect(b.reduce((s, x) => s + x.count, 0)).toBeCloseTo(total, 6);
  });

  it('保存済みとサンプルで形がほぼ同じ', () => {
    const a = binsInRange(live, 25, 65);
    const c = binsInRange(stored, 25, 65);
    const ta = a.reduce((s, x) => s + x.count, 0);
    const tc = c.reduce((s, x) => s + x.count, 0);
    for (let i = 0; i < a.length; i++) expect(Math.abs(a[i]!.count / ta - c[i]!.count / tc)).toBeLessThan(0.03);
  });

  it('不正な範囲は空', () => {
    expect(binsInRange(live, 50, 50)).toEqual([]);
    expect(binsInRange(live, 60, 50)).toEqual([]);
    expect(binsInRange(live, 25, 65, 0)).toEqual([]);
  });
});

describe('axisTicks', () => {
  it('両端と 10 刻み（端に近すぎる目盛りは落とす）', () => {
    expect(axisTicks(25, 65).map((t) => t.value)).toEqual([25, 40, 50, 65]);
    expect(axisTicks(30, 65).map((t) => t.value)).toEqual([30, 40, 50, 65]);
    expect(axisTicks(20, 70).map((t) => t.value)).toEqual([20, 30, 40, 50, 60, 70]);
  });
  it('幅 20 以下は 5 刻み', () => {
    expect(axisTicks(30, 45).map((t) => t.value)).toEqual([30, 35, 40, 45]);
  });
  it('位置は 0〜1', () => {
    const t = axisTicks(20, 70);
    expect(t[0]!.at).toBe(0);
    expect(t[t.length - 1]!.at).toBe(1);
    expect(t[1]!.at).toBeCloseTo(0.2, 9);
  });
  it('不正な範囲は空', () => {
    expect(axisTicks(5, 5)).toEqual([]);
    expect(axisTicks(Number.NaN, 5)).toEqual([]);
  });
});
