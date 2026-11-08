import { describe, expect, it } from 'vitest';
import { ceilTo, linear, niceCeil } from './scale';

describe('linear', () => {
  it('[d0, d1] → [r0, r1]（反転した範囲も）', () => {
    const x = linear(30, 65, 0, 700);
    expect(x(30)).toBe(0);
    expect(x(65)).toBe(700);
    expect(x(45)).toBeCloseTo(300, 12);
    const y = linear(0, 1, 200, 0); // SVG の y 軸
    expect(y(0)).toBe(200);
    expect(y(1)).toBe(0);
    expect(y(0.25)).toBe(150);
  });
  it('clamp なしなら範囲外へ外挿、clamp ありなら端に寄せる', () => {
    expect(linear(0, 10, 0, 100)(15)).toBe(150);
    expect(linear(0, 10, 0, 100, true)(15)).toBe(100);
    expect(linear(0, 10, 0, 100, true)(-5)).toBe(0);
    expect(linear(10, 0, 0, 100, true)(15)).toBe(0); // 定義域が逆向きでも
    expect(linear(10, 0, 0, 100, true)(-5)).toBe(100);
  });
  it('定義域の幅 0 なら常に r0（0 除算しない）', () => {
    const f = linear(5, 5, 10, 20);
    expect(f(5)).toBe(10);
    expect(f(100)).toBe(10);
  });
  it('NaN は NaN のまま（呼び出し側で弾く）', () => {
    expect(linear(0, 1, 0, 1)(Number.NaN)).toBeNaN();
  });
});

describe('ceilTo', () => {
  it('step 単位で切り上げ', () => {
    expect(ceilTo(43.9, 5)).toBe(45);
    expect(ceilTo(45, 5)).toBe(45);
    expect(ceilTo(0.1, 5)).toBe(5);
  });
  it('0 以下・NaN は step', () => {
    expect(ceilTo(0, 5)).toBe(5);
    expect(ceilTo(-3, 5)).toBe(5);
    expect(ceilTo(Number.NaN, 5)).toBe(5);
  });
});

describe('niceCeil', () => {
  it('1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10 × 10^k に切り上げ', () => {
    expect(niceCeil(1)).toBe(1);
    expect(niceCeil(1.1)).toBe(1.2);
    expect(niceCeil(43.9)).toBe(50);
    expect(niceCeil(56.2)).toBe(60);
    expect(niceCeil(0.034)).toBeCloseTo(0.04, 12);
    expect(niceCeil(9.5)).toBe(10);
    expect(niceCeil(1200)).toBe(1200);
    expect(niceCeil(1201)).toBe(1500);
  });
  it('結果は常に入力以上', () => {
    for (let v = 0.013; v < 5000; v *= 1.37) expect(niceCeil(v)).toBeGreaterThanOrEqual(v - 1e-9);
  });
  it('0 以下・NaN は 1', () => {
    expect(niceCeil(0)).toBe(1);
    expect(niceCeil(-4)).toBe(1);
    expect(niceCeil(Number.NaN)).toBe(1);
  });
});
