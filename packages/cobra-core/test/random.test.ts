// 乱数（mulberry32）と標準正規の逆 CDF（normalInv）。
import { describe, expect, it } from 'vitest';
import { mulberry32, normalInv } from '../src/index';

/** 標準正規 CDF（テスト側の独立実装: erfc の連分数 / 級数、誤差 < 1e-12 程度） */
function phi(x: number): number {
  // Φ(x) = erfc(−x/√2) / 2。W. J. Cody の有理近似の代わりに、精度の高い級数・連分数で計算する
  const z = Math.abs(x) / Math.SQRT2;
  let erfcZ: number;
  if (z < 2) {
    // erf の Maclaurin 級数
    let sum = z;
    let term = z;
    for (let n = 1; n < 200; n++) {
      term *= (-z * z) / n;
      const add = term / (2 * n + 1);
      sum += add;
      if (Math.abs(add) < 1e-17) break;
    }
    erfcZ = 1 - (2 / Math.sqrt(Math.PI)) * sum;
  } else {
    // erfc の連分数（Lentz）
    let f = z;
    let c = z;
    let d = 0;
    for (let n = 1; n < 300; n++) {
      const an = n / 2;
      d = z + an * d;
      d = 1 / d;
      c = z + an / c;
      const delta = c * d;
      f *= delta;
      if (Math.abs(delta - 1) < 1e-16) break;
    }
    erfcZ = Math.exp(-z * z) / (Math.sqrt(Math.PI) * f);
  }
  return x >= 0 ? 1 - erfcZ / 2 : erfcZ / 2;
}

describe('mulberry32', () => {
  it('参照実装と同じ系列（seed 1 の先頭 3 個）', () => {
    const r = mulberry32(1);
    expect([r(), r(), r()]).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
  });

  it('同じ seed → 同じ系列、違う seed → 違う系列', () => {
    const a = mulberry32(20261106);
    const b = mulberry32(20261106);
    const c = mulberry32(20261107);
    const xs = Array.from({ length: 1000 }, () => a());
    const ys = Array.from({ length: 1000 }, () => b());
    const zs = Array.from({ length: 1000 }, () => c());
    expect(xs).toEqual(ys);
    expect(xs).not.toEqual(zs);
  });

  it('seed は 32 bit 符号なし整数に正規化される（2^32 周期・小数は切り捨て）', () => {
    const first = (s: number) => mulberry32(s)();
    expect(first(5 + 2 ** 32)).toBe(first(5));
    expect(first(-1)).toBe(first(2 ** 32 - 1));
    expect(first(7.9)).toBe(first(7));
  });

  it('値は [0, 1)、平均 ≈ 0.5、10 区間の χ² が小さい', () => {
    const r = mulberry32(12345);
    const n = 200_000;
    const bins = new Array<number>(10).fill(0);
    let sum = 0;
    let min = 1;
    let max = 0;
    for (let i = 0; i < n; i++) {
      const u = r();
      expect(u >= 0 && u < 1).toBe(true);
      sum += u;
      min = Math.min(min, u);
      max = Math.max(max, u);
      bins[Math.floor(u * 10)]!++;
    }
    expect(Math.abs(sum / n - 0.5)).toBeLessThan(0.003);
    const e = n / 10;
    const chi2 = bins.reduce((s, o) => s + (o - e) ** 2 / e, 0);
    // 自由度 9 の 99.9% 点は 27.9
    expect(chi2).toBeLessThan(27.9);
    expect(min).toBeLessThan(1e-4);
    expect(max).toBeGreaterThan(1 - 1e-4);
  });
});

describe('normalInv', () => {
  it('既知の分位点', () => {
    const known: [number, number][] = [
      [0.5, 0],
      [0.8413447460685429, 1],
      [0.15865525393145707, -1],
      [0.9772498680518208, 2],
      [0.022750131948179195, -2],
      [0.9986501019683699, 3],
      [0.95, 1.6448536269514722],
      [0.975, 1.959963984540054],
      [0.99, 2.3263478740408408],
      [0.01, -2.3263478740408408],
      [0.2, -0.8416212335729143],
      [0.8, 0.8416212335729143],
    ];
    for (const [p, z] of known) expect(normalInv(p), `p=${p}`).toBeCloseTo(z, 7);
  });

  it('Φ(normalInv(p)) ≈ p（独立実装の Φ で全域を確認、領域の境界 0.02425 も含む）', () => {
    const ps = [1e-10, 1e-6, 1e-4, 0.001, 0.01, 0.02, 0.02424, 0.02425, 0.02426, 0.1, 0.3, 0.5, 0.7, 0.9, 0.97574, 0.97575, 0.97576, 0.99, 0.999, 0.9999];
    for (const p of ps) {
      const x = normalInv(p);
      // Acklam 近似は x の相対誤差 < 1.2e-9。p の相対誤差に直すと ≈ |x|² × 1.2e-9（p = 1e-10 で 5e-8）
      const tol = Math.max(1, x * x) * 1.2e-9 * 1.5;
      expect(Math.abs(phi(x) - p) / Math.min(p, 1 - p), `p=${p}`).toBeLessThan(tol);
    }
  });

  it('対称・単調増加', () => {
    let prev = -Infinity;
    for (let i = 1; i < 1000; i++) {
      const p = i / 1000;
      const x = normalInv(p);
      expect(x).toBeGreaterThan(prev);
      prev = x;
      expect(x).toBeCloseTo(-normalInv(1 - p), 8);
    }
  });

  it('端（0・1・範囲外）は ±7.03 付近に丸めて有限値を返す', () => {
    expect(normalInv(0)).toBe(normalInv(1e-12));
    expect(normalInv(-1)).toBe(normalInv(1e-12));
    expect(normalInv(1)).toBe(normalInv(1 - 1e-12));
    expect(normalInv(2)).toBe(normalInv(1 - 1e-12));
    expect(normalInv(0)).toBeCloseTo(-7.034, 2);
    expect(normalInv(1)).toBeCloseTo(7.034, 2);
  });

  it('一様乱数を通すと標準正規（平均 0・分散 1）', () => {
    const r = mulberry32(99);
    const n = 200_000;
    let s = 0;
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      const z = normalInv(r());
      s += z;
      s2 += z * z;
    }
    expect(Math.abs(s / n)).toBeLessThan(0.01);
    expect(Math.abs(s2 / n - 1)).toBeLessThan(0.015);
  });
});
