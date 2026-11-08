import { describe, expect, it } from 'vitest';
import {
  EXCEED_CHOICES,
  EXCEED_TABLE,
  budgetChanged,
  exceedAux,
  leverDelta,
  leverExceedText,
  marginParts,
  pOfExceed,
  parseBudget,
  pctRound,
  showCumulative,
  verdictOf,
} from './display';

describe('超過確率 → P 値（向きを逆にしない）', () => {
  it('超過確率 20% は P80、5% は P95、50% は P50', () => {
    expect(pOfExceed(20)).toBe(80);
    expect(pOfExceed(5)).toBe(95);
    expect(pOfExceed(50)).toBe(50);
    expect(exceedAux(20)).toBe('P80');
    expect(exceedAux(30)).toBe('P70');
  });
  it('選択肢と速見表', () => {
    expect([...EXCEED_CHOICES]).toEqual([5, 10, 20, 30, 50]);
    expect([...EXCEED_TABLE]).toEqual([50, 30, 20, 10, 5]);
  });
});

describe('marginParts（推定値に対する余裕）', () => {
  it('§6 の G3: 超過確率 20% 49.9 は 推定 43.9 に対して +6.0 (+14%)', () => {
    expect(marginParts(49.93, 43.93)).toEqual({ median: '43.9', diff: '+6.0', pct: '+14%' });
  });
  it('差は表示値どうし（49.96 − 43.94 = 6.02 でも 50.0 − 43.9 = 6.1）', () => {
    expect(marginParts(49.96, 43.94).diff).toBe('+6.1');
  });
  it('同じ値は ±0.0 / ±0%', () => {
    expect(marginParts(43.9, 43.9)).toEqual({ median: '43.9', diff: '±0.0', pct: '±0%' });
  });
  it('下回るときは U+2212 のマイナス', () => {
    expect(marginParts(40, 43.9)).toEqual({ median: '43.9', diff: '−3.9', pct: '−9%' });
  });
  it('中央値 0 でも落ちない', () => {
    expect(marginParts(0, 0).pct).toBe('±0%');
  });
});

describe('pctRound / verdictOf', () => {
  it('四捨五入（境目）', () => {
    expect(pctRound(0.432)).toBe(43);
    expect(pctRound(0.435)).toBe(44);
    expect(pctRound(0)).toBe(0);
    expect(pctRound(1)).toBe(100);
  });
  it('判定の境目は従来どおり', () => {
    expect(verdictOf(0.51)).toBe('推定値を下回る予算');
    expect(verdictOf(0.5)).toBe('やや楽観的');
    expect(verdictOf(0.43)).toBe('やや楽観的');
    expect(verdictOf(0.3)).toBe('妥当な余裕');
    expect(verdictOf(0.15)).toBe('十分な余裕');
  });
});

describe('parseBudget', () => {
  it('半角・全角・カンマ・小数', () => {
    expect(parseBudget('45')).toBe(45);
    expect(parseBudget('４５．５')).toBe(45.5);
    expect(parseBudget('1,200')).toBe(1200);
    expect(parseBudget(' 40.0 ')).toBe(40);
  });
  it('0 以下・不正・空は null（0 にしない）', () => {
    for (const v of ['', '0', '-5', '－5', 'abc', '4a5', '.', '1e3']) expect(parseBudget(v)).toBeNull();
  });
});

describe('budgetChanged', () => {
  it('保存済みと比べる', () => {
    expect(budgetChanged(45, 45, 45)).toBe(false);
    expect(budgetChanged(40, 45, 45)).toBe(true);
  });
  it('未保存（null）は最初の提案値から動かしたら変更あり', () => {
    expect(budgetChanged(44, null, 44)).toBe(false);
    expect(budgetChanged(44.5, null, 44)).toBe(true);
  });
});

describe('showCumulative', () => {
  it('寄与度順のときだけ累積を出す', () => {
    expect(showCumulative('share')).toBe(true);
    expect(showCumulative('no')).toBe(false);
  });
});

describe('打ち手', () => {
  it('超過確率は「現在 → 下げた後」', () => {
    expect(leverExceedText(0.432, 0.291)).toBe('超過確率 43% → 29%');
    expect(leverExceedText(0.432, null)).toBeNull();
  });
  it('P50 の差は実際の差を丸める（§6: 43.93 → 41.36 で −2.6）', () => {
    // §6: 01 L3→L2 は P50 −2.6（実際の差 −2.57 を丸める。表示値どうしの −2.5 ではない）
    expect(leverDelta({ p50: 41.36, deltaP50: 41.36 - 43.93 })).toBe(-2.6);
    expect(leverDelta({ p50: 10, deltaP50: -0.04 })).toBe(0);
    expect(leverDelta({ p50: 41.3, deltaP50: -2.6 })).toBe(-2.6);
    expect(leverDelta({ p50: 10, deltaP50: 0 })).toBe(0);
  });
});
