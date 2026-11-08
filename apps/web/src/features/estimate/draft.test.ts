import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearDraft,
  draftAsGeneration,
  getDraft,
  inputsOfGen,
  resetDraftCacheForTest,
  sameInputs,
  sameLevels,
  sanitizeDraft,
  setDraft,
  subscribeDrafts,
  syncDraft,
  type DraftInputs,
} from './draft';

const base: DraftInputs = { name: '案B', sizeFP: 1200, levels: { F01: 3, F02: 2, F03: 1 }, memo: 'メモ' };

beforeEach(() => {
  resetDraftCacheForTest();
  clearDraft('e1');
  clearDraft('e2');
});

describe('sameLevels / sameInputs', () => {
  it('欠けている要因は L0 とみなす', () => {
    expect(sameLevels({ F01: 1, F02: 0 }, { F01: 1 })).toBe(true);
    expect(sameLevels({ F01: 1 }, { F01: 2 })).toBe(false);
    expect(sameLevels({}, {})).toBe(true);
  });
  it('名前とメモの前後の空白は無視、規模とレベルは厳密', () => {
    expect(sameInputs(base, { ...base, name: ' 案B ', memo: 'メモ\n' })).toBe(true);
    expect(sameInputs(base, { ...base, sizeFP: 1210 })).toBe(false);
    expect(sameInputs(base, { ...base, levels: { ...base.levels, F03: 2 } })).toBe(false);
    expect(sameInputs(base, { ...base, memo: '別' })).toBe(false);
  });
});

describe('inputsOfGen', () => {
  it('notes.memo をメモに、無ければ空', () => {
    expect(inputsOfGen({ name: 'n', sizeFP: 1, levels: { a: 1 }, notes: { memo: 'm', F01: 'x' } })).toEqual({ name: 'n', sizeFP: 1, levels: { a: 1 }, memo: 'm' });
    expect(inputsOfGen({ name: 'n', sizeFP: 1, levels: {}, notes: {} }).memo).toBe('');
  });
});

describe('sanitizeDraft', () => {
  it('正しい値は通す', () => {
    expect(sanitizeDraft({ ...base, baseGenId: 'g3' })).toEqual({ ...base, baseGenId: 'g3' });
    expect(sanitizeDraft({ ...base })?.baseGenId).toBeNull();
  });
  it('壊れた値は null', () => {
    for (const v of [null, 1, 'x', { ...base, sizeFP: 0 }, { ...base, sizeFP: -1 }, { ...base, sizeFP: Number.NaN }, { ...base, levels: { F01: 4 } }, { ...base, levels: { F01: 1.5 } }, { ...base, name: 1 }, { ...base, levels: null }])
      expect(sanitizeDraft(v)).toBeNull();
  });
});

describe('ストア', () => {
  it('見積りごとに保持し、条件⇄リスクの行き来（画面の作り直し）でも残る', () => {
    setDraft('e1', { ...base, sizeFP: 900, baseGenId: 'g3' });
    // 画面が外れて作り直されても、ストアから同じ値が読める
    expect(getDraft('e1')?.sizeFP).toBe(900);
    expect(getDraft('e2')).toBeNull();
  });
  it('変更を通知し、同じ値の書き込みでは通知しない', () => {
    let n = 0;
    const off = subscribeDrafts(() => n++);
    setDraft('e1', { ...base, baseGenId: null });
    setDraft('e1', { ...base, baseGenId: null });
    expect(n).toBe(1);
    clearDraft('e1');
    clearDraft('e1');
    expect(n).toBe(2);
    off();
  });
  it('保存したオブジェクトを後から書き換えてもストアは変わらない', () => {
    const levels = { F01: 1 };
    setDraft('e1', { ...base, levels, baseGenId: null });
    levels.F01 = 3;
    expect(getDraft('e1')?.levels.F01).toBe(1);
  });
});

describe('syncDraft', () => {
  it('元と違えば下書きを保存して true、元に戻ったら消して false', () => {
    expect(syncDraft('e1', { ...base, levels: { ...base.levels, F01: 1 } }, base, 'g3')).toBe(true);
    expect(getDraft('e1')).toMatchObject({ baseGenId: 'g3', levels: { F01: 1 } });
    expect(syncDraft('e1', base, base, 'g3')).toBe(false);
    expect(getDraft('e1')).toBeNull();
  });
  it('メモだけの変更も下書きになる', () => {
    expect(syncDraft('e1', { ...base, memo: '編集中のメモ' }, base, 'g3')).toBe(true);
    expect(getDraft('e1')?.memo).toBe('編集中のメモ');
  });
});

describe('draftAsGeneration', () => {
  const opts = { runs: 10_000, seed: 20261106, modelVersionId: 'v3' };
  it('見積り画面のプレビューと同じ回数・シード・版で、入力をそのまま渡す', () => {
    const g = draftAsGeneration('e1', { ...base, memo: ' m ' }, opts);
    expect(g).toMatchObject({ estimateId: 'e1', sizeFP: 1200, levels: base.levels, runs: 10_000, seed: 20261106, modelVersionId: 'v3', notes: { memo: 'm' }, results: null });
  });
  it('id は入力（規模・レベル）で決まる。要因の並び順には依存しない', () => {
    const a = draftAsGeneration('e1', base, opts);
    const b = draftAsGeneration('e1', { ...base, levels: { F03: 1, F02: 2, F01: 3 }, name: '別名', memo: '' }, opts);
    const c = draftAsGeneration('e1', { ...base, sizeFP: 1210 }, opts);
    const d = draftAsGeneration('e1', { ...base, levels: { ...base.levels, F01: 2 } }, opts);
    expect(a.id).toBe(b.id);
    expect(a.id).not.toBe(c.id);
    expect(a.id).not.toBe(d.id);
  });
});
