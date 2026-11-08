import { describe, expect, it } from 'vitest';
import { displayDelta, factorNo, fmt1, fmtInt, fmtPct, fmtSigned, fmtSignedPct, roundTo } from './format';

describe('fmt1', () => {
  it('小数 1 桁（toFixed の丸め）', () => {
    expect(fmt1(43.928581148527556)).toBe('43.9');
    expect(fmt1(49.95)).toBe('50.0'); // 49.95 は 2 進で 49.950000000000003
    expect(fmt1(1.05)).toBe('1.1'); // 1.0500000000000000444
    expect(fmt1(1.0492)).toBe('1.0');
    expect(fmt1(1.0541)).toBe('1.1');
    expect(fmt1(0)).toBe('0.0');
    expect(fmt1(-3.56)).toBe('-3.6');
  });
  it('丸めて 0 になる負の値は「0.0」（「-0.0」を出さない）', () => {
    expect(fmt1(-0.04)).toBe('0.0');
    expect(fmt1(-0)).toBe('0.0');
    expect(fmt1(-0.05)).toBe('-0.1'); // -0.05 は 2 進で -0.05000000000000000277 なので -0.1
  });
  it('NaN・Infinity は「—」', () => {
    expect(fmt1(Number.NaN)).toBe('—');
    expect(fmt1(Infinity)).toBe('—');
    expect(fmt1(-Infinity)).toBe('—');
  });
});

describe('fmtInt', () => {
  it('四捨五入して 3 桁区切り', () => {
    expect(fmtInt(1200)).toBe('1,200');
    expect(fmtInt(1234567.5)).toBe('1,234,568');
    expect(fmtInt(0.4)).toBe('0');
    expect(fmtInt(-1234.4)).toBe('-1,234');
  });
  it('-0 を出さない、非有限は「—」', () => {
    expect(fmtInt(-0.4)).toBe('0');
    expect(fmtInt(-0)).toBe('0');
    expect(fmtInt(Number.NaN)).toBe('—');
    expect(fmtInt(Infinity)).toBe('—');
  });
});

describe('fmtPct / fmtSignedPct', () => {
  it('割合 → %', () => {
    expect(fmtPct(0.4336)).toBe('43%');
    expect(fmtPct(0.128, 1)).toBe('12.8%');
    expect(fmtPct(0.8181818181818182)).toBe('82%');
    expect(fmtPct(0)).toBe('0%');
    expect(fmtPct(1)).toBe('100%');
    expect(fmtPct(-0.001)).toBe('0%');
    expect(fmtPct(Number.NaN)).toBe('—');
  });
  it('符号付き: +74% / −26% / 丸めて 0 は +0%', () => {
    expect(fmtSignedPct(0.7433333)).toBe('+74%');
    expect(fmtSignedPct(-0.26008)).toBe('−26%');
    expect(fmtSignedPct(0)).toBe('+0%');
    expect(fmtSignedPct(-0.001)).toBe('+0%'); // 以前は「−0%」
    expect(fmtSignedPct(-0.0051, 1)).toBe('−0.5%');
    expect(fmtSignedPct(Infinity)).toBe('—');
  });
});

describe('factorNo', () => {
  it('2 桁ゼロ埋め', () => {
    expect(factorNo(1)).toBe('01');
    expect(factorNo(12)).toBe('12');
    expect(factorNo(123)).toBe('123');
  });
});

describe('roundTo', () => {
  it('fmt1 / toFixed の表示と一致する', () => {
    for (const x of [43.928581148527556, 33.47605609712455, 1.05, 1.0492, 2.55, 0.15, 49.95, -3.56, 1e-7, 123456.789]) {
      expect(roundTo(x, 1)).toBe(Number(fmt1(x)));
      expect(roundTo(x, 2)).toBe(Number(x.toFixed(2)));
    }
  });
  it('桁数', () => {
    expect(roundTo(43.928)).toBe(43.9);
    expect(roundTo(43.928, 0)).toBe(44);
    expect(roundTo(43.928, 2)).toBe(43.93);
    expect(roundTo(0.0209843, 4)).toBe(0.021);
  });
  it('−0 は 0、非有限はそのまま', () => {
    expect(Object.is(roundTo(-0.04), 0)).toBe(true);
    expect(Object.is(roundTo(-0), 0)).toBe(true);
    expect(roundTo(Number.NaN)).toBeNaN();
    expect(roundTo(Infinity)).toBe(Infinity);
    expect(roundTo(-Infinity)).toBe(-Infinity);
  });
  it('負の値', () => {
    expect(roundTo(-2.5756937)).toBe(-2.6);
    expect(roundTo(-1.2705679)).toBe(-1.3);
  });
});

describe('displayDelta（丸めた値どうしの差）', () => {
  it('43.94 − 33.46 → 43.9 − 33.5 = 10.4（生の差 10.48 → 10.5 にしない）', () => {
    expect(displayDelta(43.94, 33.46)).toBe(10.4);
    expect(roundTo(43.94 - 33.46)).toBe(10.5);
  });
  it('§6 portal: G3 − G2 = +10.4、G2 − G1 = −3.6', () => {
    expect(displayDelta(43.928581148527556, 33.47605609712455)).toBe(10.4);
    expect(displayDelta(33.47605609712455, 37.074598930428365)).toBe(-3.6);
  });
  it('浮動小数の尾を残さない（43.9 − 33.5 = 10.399999999999999 → 10.4）', () => {
    expect(43.9 - 33.5).not.toBe(10.4);
    expect(displayDelta(43.9, 33.5)).toBe(10.4);
    expect(displayDelta(0.3, 0.1)).toBe(0.2);
    expect(displayDelta(0.3, 0.1, 2)).toBe(0.2);
  });
  it('表示が同じなら差は 0（−0 にならない）', () => {
    expect(Object.is(displayDelta(43.91, 43.94), 0)).toBe(true);
    expect(Object.is(displayDelta(-0.01, 0.01), 0)).toBe(true);
  });
  it('x.x5 の境界: 表示に出る値（toFixed）で引く', () => {
    // 1.05 → 1.1、1.04 → 1.0
    expect(displayDelta(1.05, 1.04)).toBe(0.1);
    // 2.25 は 2 進で厳密に 2.25 → toFixed(1) は "2.3"（V8）。0.25 → "0.3"
    expect(displayDelta(2.25, 0.25)).toBe(roundTo(Number((2.25).toFixed(1)) - Number((0.25).toFixed(1))));
  });
  it('桁数 0（%・整数）', () => {
    expect(displayDelta(43.36, 28.84, 0)).toBe(14);
    expect(displayDelta(0.4336 * 100, 0.2884 * 100, 0)).toBe(14);
  });
  it('どちらかが非有限なら NaN / Infinity', () => {
    expect(displayDelta(Number.NaN, 1)).toBeNaN();
    expect(displayDelta(Infinity, 1)).toBe(Infinity);
  });
  it('a − b = −(b − a)（対称）', () => {
    for (const [a, b] of [[43.94, 33.46], [1.05, 2.95], [10, 3.333]] as const) {
      expect(displayDelta(a, b)).toBe(-displayDelta(b, a) || 0);
    }
  });
});

describe('fmtSigned', () => {
  it('+ / U+2212 / ±', () => {
    expect(fmtSigned(10.4)).toBe('+10.4');
    expect(fmtSigned(-3.6)).toBe('−3.6');
    expect(fmtSigned(0)).toBe('±0.0');
    expect(fmtSigned(-0.04)).toBe('±0.0');
    expect(fmtSigned(0.04)).toBe('±0.0');
    expect(fmtSigned(-2.5756937)).toBe('−2.6');
    expect(fmtSigned(14, 0)).toBe('+14');
    expect(fmtSigned(0, 0)).toBe('±0');
    expect(fmtSigned(Number.NaN)).toBe('—');
  });
  it('fmtSigned(displayDelta(a, b)) で世代差', () => {
    expect(fmtSigned(displayDelta(43.928581148527556, 33.47605609712455))).toBe('+10.4');
    expect(fmtSigned(displayDelta(33.47605609712455, 37.074598930428365))).toBe('−3.6');
  });
});
