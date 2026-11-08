import { describe, expect, it } from 'vitest';
import { createEstimateInput, updateEstimateInput } from './estimates';

describe('createEstimateInput', () => {
  it('名前だけで作れる（予算は未設定 = null）', () => {
    expect(createEstimateInput.parse({ name: 'テスト' })).toEqual({ name: 'テスト', budget: null });
    expect(createEstimateInput.parse({ name: ' テスト ', budget: 45 })).toEqual({ name: 'テスト', budget: 45 });
  });
  it('空の名前・0 以下の予算は 400', () => {
    for (const v of [{ name: '' }, { name: '   ' }, { name: 'a', budget: 0 }, { name: 'a', budget: -1 }, { name: 'a', budget: '45' }, {}])
      expect(createEstimateInput.safeParse(v).success).toBe(false);
  });
});

describe('updateEstimateInput', () => {
  it('予算だけ・レポート世代だけの部分更新（従来どおり）', () => {
    expect(updateEstimateInput.parse({ budget: 40.5 })).toEqual({ budget: 40.5 });
    expect(updateEstimateInput.parse({ budget: null })).toEqual({ budget: null });
    expect(updateEstimateInput.parse({ reportGenerationId: 'g1' })).toEqual({ reportGenerationId: 'g1' });
    expect(updateEstimateInput.parse({})).toEqual({});
  });
  it('0 以下・非有限の予算は 400', () => {
    for (const budget of [0, -3, Number.POSITIVE_INFINITY, Number.NaN, '45']) expect(updateEstimateInput.safeParse({ budget }).success).toBe(false);
  });
});
