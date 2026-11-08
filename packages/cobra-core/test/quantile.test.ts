// 分位点・超過確率・ヒストグラム。
import { describe, expect, it } from 'vitest';
import { HISTOGRAM_BINS, effortAtExceedance, exceedance, histogram, mulberry32, quantile } from '../src/index';

const sortedRandom = (n: number, seed: number) => {
  const r = mulberry32(seed);
  return Float64Array.from({ length: n }, () => 20 + 30 * r()).sort();
};

describe('quantile', () => {
  it('空配列は NaN、1 要素はその値', () => {
    expect(quantile([], 0.5)).toBeNaN();
    expect(quantile([7], 0)).toBe(7);
    expect(quantile([7], 0.5)).toBe(7);
    expect(quantile([7], 1)).toBe(7);
  });
  it('線形補間（type 7）: h = (n − 1)p', () => {
    const s = [10, 20, 30, 40];
    expect(quantile(s, 0)).toBe(10);
    expect(quantile(s, 1)).toBe(40);
    expect(quantile(s, 0.5)).toBe(25);
    expect(quantile(s, 0.25)).toBeCloseTo(17.5, 12);
    expect(quantile(s, 0.9)).toBeCloseTo(37, 12);
  });
  it('p は [0, 1] に丸める', () => {
    const s = [1, 2, 3];
    expect(quantile(s, -0.5)).toBe(1);
    expect(quantile(s, 1.5)).toBe(3);
  });
  it('p について単調非減少', () => {
    const s = sortedRandom(997, 3);
    let prev = -Infinity;
    for (let i = 0; i <= 1000; i++) {
      const q = quantile(s, i / 1000);
      expect(q).toBeGreaterThanOrEqual(prev);
      prev = q;
    }
  });
  it('同じ値が続いても正しい', () => {
    expect(quantile([5, 5, 5, 5], 0.37)).toBe(5);
  });
});

describe('exceedance = P(effort > x)', () => {
  it('空配列は NaN、1 要素は x 未満で 1・以上で 0', () => {
    expect(exceedance([], 1)).toBeNaN();
    expect(exceedance([3], 2.999)).toBe(1);
    expect(exceedance([3], 3)).toBe(0);
    expect(exceedance([3], 4)).toBe(0);
  });
  it('「より大きい」の割合（等しい値は超過に数えない）', () => {
    expect(exceedance([1, 1, 1, 2], 1)).toBe(0.25);
    expect(exceedance([1, 1, 1, 2], 0.5)).toBe(1);
    expect(exceedance([1, 2, 3, 4, 5], 2.5)).toBe(0.6);
    expect(exceedance([1, 2, 3, 4, 5], Infinity)).toBe(0);
    expect(exceedance([1, 2, 3, 4, 5], -Infinity)).toBe(1);
  });
  it('二分探索の結果が線形走査と一致', () => {
    const s = sortedRandom(1013, 4);
    for (const x of [0, 20, 25.5, 30, 33.3, 41, 49.99, 50, 60, s[0]!, s[500]!, s[1012]!]) {
      let count = 0;
      for (const v of s) if (v > x) count++;
      expect(exceedance(s, x)).toBe(count / s.length);
    }
  });
  it('x について単調非増加', () => {
    const s = sortedRandom(500, 5);
    let prev = 1;
    for (let x = 15; x <= 55; x += 0.1) {
      const e = exceedance(s, x);
      expect(e).toBeLessThanOrEqual(prev);
      prev = e;
    }
  });
});

describe('effortAtExceedance と exceedance は互いに逆', () => {
  it('effortAtExceedance(p) = quantile(1 − p)（p = 0.2 → P80）', () => {
    const s = sortedRandom(10_000, 6);
    expect(effortAtExceedance(s, 0.2)).toBe(quantile(s, 0.8));
    expect(effortAtExceedance(s, 0.5)).toBe(quantile(s, 0.5));
    expect(effortAtExceedance(s, 0)).toBe(s[s.length - 1]);
    expect(effortAtExceedance(s, 1)).toBe(s[0]);
  });
  it('exceedance(effortAtExceedance(p)) ≈ p（誤差 ≤ 1/n）', () => {
    for (const n of [10, 101, 10_000]) {
      const s = sortedRandom(n, n);
      for (let i = 0; i <= 100; i++) {
        const p = i / 100;
        expect(Math.abs(exceedance(s, effortAtExceedance(s, p)) - p), `n=${n} p=${p}`).toBeLessThanOrEqual(1 / n + 1e-12);
      }
    }
  });
  it('effortAtExceedance(exceedance(x)) は x を挟む隣のサンプルの範囲', () => {
    const s = sortedRandom(2000, 8);
    for (const x of [25, 30, 35, 40, 45]) {
      const y = effortAtExceedance(s, exceedance(s, x));
      const i = s.findIndex((v) => v > x);
      expect(y).toBeGreaterThanOrEqual(s[i - 1]!);
      expect(y).toBeLessThanOrEqual(s[i]!);
    }
  });
  it('超過確率 p について工数は単調非増加', () => {
    const s = sortedRandom(3000, 9);
    let prev = Infinity;
    for (let i = 0; i <= 100; i++) {
      const y = effortAtExceedance(s, i / 100);
      expect(y).toBeLessThanOrEqual(prev);
      prev = y;
    }
  });
  it('空配列は NaN', () => {
    expect(effortAtExceedance([], 0.2)).toBeNaN();
  });
});

describe('histogram', () => {
  it('件数の合計 = サンプル数、既定 24 区間', () => {
    for (const n of [1, 2, 23, 24, 25, 9999]) {
      const h = histogram(sortedRandom(n, n));
      expect(h.counts).toHaveLength(HISTOGRAM_BINS);
      expect(h.counts.reduce((a, b) => a + b, 0)).toBe(n);
    }
  });
  it('最小値は先頭、最大値は最後の区間に入る', () => {
    const h = histogram(Float64Array.from([0, 10]), 10);
    expect(h.counts).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(h.width).toBe(1);
  });
  it('境界値 lo + k × width は区間 k（左閉）', () => {
    const s = Float64Array.from({ length: 11 }, (_, i) => i * 2); // 0, 2, …, 20、幅 2 の 10 区間
    const h = histogram(s, 10);
    expect(h.lo).toBe(0);
    expect(h.hi).toBe(20);
    expect(h.width).toBe(2);
    expect(h.counts).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 2]); // 20 は最後の区間に含める
  });
  it('各サンプルは自分の区間の範囲 [lo + bw, lo + (b+1)w) に入る', () => {
    const s = sortedRandom(5000, 10);
    const h = histogram(s);
    const expected = new Array<number>(HISTOGRAM_BINS).fill(0);
    for (const v of s) {
      let b = 0;
      while (b < HISTOGRAM_BINS - 1 && v >= h.lo + (b + 1) * h.width) b++;
      expected[b]!++;
    }
    expect(h.counts).toEqual(expected);
  });
  it('全部同じ値なら幅 1 で先頭の区間に全件', () => {
    const h = histogram(Float64Array.from([5, 5, 5]), 4);
    expect(h).toEqual({ lo: 5, hi: 5, width: 1, counts: [3, 0, 0, 0] });
  });
  it('空なら 0 件', () => {
    const h = histogram(new Float64Array(0), 3);
    expect(h).toEqual({ lo: 0, hi: 0, width: 1, counts: [0, 0, 0] });
  });
});
