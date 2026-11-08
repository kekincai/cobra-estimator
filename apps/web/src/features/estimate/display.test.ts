import { describe, expect, it } from 'vitest';
import { ESTIMATE_QUANTILES, MEDIAN_LABEL, fmtSco, stackFormula, sumShown } from './display';

describe('ESTIMATE_QUANTILES（P 値 → 超過確率。向きを逆にしない）', () => {
  it('P20 は超過確率 80%（楽観）、P80 は 20%（安全側）、P95 は 5%', () => {
    expect(ESTIMATE_QUANTILES.map((q) => [q.p, q.exceed, q.tag, q.label])).toEqual([
      [20, 80, '楽観', '超過確率 80%・P20'],
      [80, 20, '安全側', '超過確率 20%・P80'],
      [95, 5, 'ほぼ上限', '超過確率 5%・P95'],
    ]);
  });
  it('「最悪」は使わない', () => {
    expect(ESTIMATE_QUANTILES.some((q) => q.tag.includes('最悪') || q.label.includes('最悪'))).toBe(false);
  });
  it('中央値は超過確率 50%', () => {
    expect(MEDIAN_LABEL).toBe('中央値（超過確率 50%）');
  });
});

describe('stackFormula（名目 + 上乗せ = 推定。表示値で式が合う）', () => {
  it('§6 の G3: 25.2 + 18.7 = 43.9', () => {
    expect(stackFormula(0.02098 * 1200, 43.93)).toEqual({ nominal: '25.2', overhead: '18.7', total: '43.9' });
  });
  it('生の差では 1 桁ずれる場合も、表示値どうしの差にする', () => {
    // 生: 43.94 − 25.16 = 18.78 → 18.8 だが、表示は 43.9 − 25.2 = 18.7
    expect(stackFormula(25.16, 43.94)).toEqual({ nominal: '25.2', overhead: '18.7', total: '43.9' });
  });
  it('上乗せ 0（すべて L0）', () => {
    expect(stackFormula(25.2, 25.2).overhead).toBe('0.0');
  });
});

describe('sumShown', () => {
  it('各行を丸めてから足す（G3 の寄与: 行の和 18.6、生の和 18.718）', () => {
    expect(sumShown([7.722, 4.659, 2.546, 1.847, 1.049, 0.49, 0.406])).toBe(18.6);
  });
  it('空・単一・x.x5 の境目', () => {
    expect(sumShown([])).toBe(0);
    expect(sumShown([1.05])).toBe(1.1); // 1.05 は 2 進で 1.0500…04 → toFixed は 1.1
    expect(sumShown([0.25, 0.25])).toBe(0.6); // 0.25.toFixed(1) = "0.3"（2 進で 0.25 ちょうど→偶数丸めではなく toFixed の挙動）
  });
});

describe('fmtSco', () => {
  it('ΣCO を % で', () => {
    expect(fmtSco(0.743)).toBe('+74%');
    expect(fmtSco(0)).toBe('+0%');
    expect(fmtSco(0.005)).toBe('+1%');
  });
});
