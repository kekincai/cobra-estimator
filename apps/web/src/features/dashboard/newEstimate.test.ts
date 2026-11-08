import { describe, expect, it } from 'vitest';
import { isBudgetDirty } from './useBudgetDraft';
import { validateNewEstimate } from './newEstimate';

describe('validateNewEstimate', () => {
  it('名前だけで作れる（予算なし）', () => {
    expect(validateNewEstimate('  顧客ポータル刷新  ', '')).toEqual({ ok: true, value: { name: '顧客ポータル刷新', budget: null }, errors: {} });
  });
  it('名前は必須', () => {
    const r = validateNewEstimate('   ', '45');
    expect(r.ok).toBe(false);
    expect(r.errors.name).toContain('名前');
  });
  it('全角数字・小数を読む', () => {
    const r = validateNewEstimate('A', '４５．５');
    expect(r.ok && r.value.budget).toBe(45.5);
  });
  it('不正・0・負数・% は 0 にせずエラー', () => {
    for (const s of ['abc', '0', '-10', '－１０', '45%', '1e3x']) {
      const r = validateNewEstimate('A', s);
      expect(r.ok, s).toBe(false);
      expect(r.errors.budget, s).toBeTruthy();
    }
  });
  it('桁区切りは許す、上限超えはエラー', () => {
    const r = validateNewEstimate('A', '1,200');
    expect(r.ok && r.value.budget).toBe(1200);
    expect(validateNewEstimate('A', '100001').ok).toBe(false);
    expect(validateNewEstimate('A', '100000').ok).toBe(true);
  });
  it('長すぎる名前はエラー', () => {
    expect(validateNewEstimate('あ'.repeat(121), '').ok).toBe(false);
    expect(validateNewEstimate('あ'.repeat(120), '').ok).toBe(true);
  });
});

describe('isBudgetDirty', () => {
  it('下書きが無ければ未変更', () => {
    expect(isBudgetDirty(null, 45)).toBe(false);
    expect(isBudgetDirty(null, null)).toBe(false);
  });
  it('保存値と違えば変更あり', () => {
    expect(isBudgetDirty(55, 45)).toBe(true);
    expect(isBudgetDirty(45, 45)).toBe(false);
    expect(isBudgetDirty(45.004, 45)).toBe(false);
    expect(isBudgetDirty(45.5, 45)).toBe(true);
  });
  it('保存値なしで動かしたら変更あり', () => {
    expect(isBudgetDirty(50, null)).toBe(true);
  });
  it('非有限の下書きは無視', () => {
    expect(isBudgetDirty(Number.NaN, 45)).toBe(false);
  });
});
