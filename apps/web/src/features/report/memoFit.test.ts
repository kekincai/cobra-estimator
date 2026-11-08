import { describe, expect, it } from 'vitest';
import { estimateLines, fitMemo, memoNoteText, memoOmittedNote, textUnits, truncateUnits } from './memoFit';

describe('textUnits / estimateLines', () => {
  it('全角は 1、半角は 0.55', () => {
    expect(textUnits('要件')).toBe(2);
    expect(textUnits('FP')).toBeCloseTo(1.1, 9);
    expect(textUnits('規模 1,200 FP')).toBeCloseTo(2 + 0.55 * 9, 9);
    expect(textUnits('')).toBe(0);
    expect(textUnits('ｱｲ')).toBeCloseTo(1.1, 9); // 半角カナ
  });
  it('行数は切り上げ、空でも 1 行', () => {
    expect(estimateLines('', 10)).toBe(1);
    expect(estimateLines('あ'.repeat(10), 10)).toBe(1);
    expect(estimateLines('あ'.repeat(11), 10)).toBe(2);
    expect(estimateLines('あ'.repeat(30), 10)).toBe(3);
  });
  it('サンプルの前提メモは各 1 行', () => {
    for (const s of ['規模 1,200 FP は要件定義の中間成果物から概算したもの。', '外部連携 6 システムのうち 2 つは接続仕様が未確定。']) expect(estimateLines(s)).toBe(1);
  });
  it('1 行の幅が 0 以下なら 1 行扱い', () => {
    expect(estimateLines('あああ', 0)).toBe(1);
  });
});

describe('truncateUnits', () => {
  it('収まればそのまま', () => {
    expect(truncateUnits('あいう', 3)).toBe('あいう');
  });
  it('収まらなければ「…」込みで maxUnits 以内', () => {
    const t = truncateUnits('あいうえおかきくけこ', 5);
    expect(t).toBe('あいうえ…');
    expect(textUnits(t)).toBeLessThanOrEqual(5);
  });
  it('半角混じり', () => {
    const t = truncateUnits('ABCDEFGHIJ', 3);
    expect(textUnits(t)).toBeLessThanOrEqual(3);
    expect(t.endsWith('…')).toBe(true);
  });
});

describe('fitMemo（2 ページに収める）', () => {
  const one = (i: number) => `前提 ${i}: 一行で収まる短い文。`;
  const two = (i: number) => `前提 ${i}: ${'あ'.repeat(70)}`; // 2 行

  it('空', () => {
    expect(fitMemo([], 7)).toEqual({ items: [], omitted: 0, truncated: false });
  });
  it('ちょうど上限まではそのまま（現行 4 行 + 3 行 = 7 行）', () => {
    const items = Array.from({ length: 7 }, (_, i) => one(i));
    expect(fitMemo(items, 7)).toEqual({ items, omitted: 0, truncated: false });
  });
  it('1 行でも超えたら注記に 1 行使い、残りは省略', () => {
    const items = Array.from({ length: 8 }, (_, i) => one(i));
    const r = fitMemo(items, 7);
    expect(r.items).toEqual(items.slice(0, 6));
    expect(r.omitted).toBe(2);
    expect(r.truncated).toBe(false);
  });
  it('+10 行（14 項目）は 6 項目 + 注記', () => {
    const items = Array.from({ length: 14 }, (_, i) => one(i));
    const r = fitMemo(items, 7);
    expect(r.items.length).toBe(6);
    expect(r.omitted).toBe(8);
  });
  it('はみ出す項目は残りの行で切って「…」', () => {
    const items = [one(0), one(1), one(2), one(3), one(4), two(5), one(6), one(7)];
    const r = fitMemo(items, 7);
    expect(r.items.slice(0, 5)).toEqual(items.slice(0, 5));
    expect(r.items[5]!.endsWith('…')).toBe(true);
    expect(estimateLines(r.items[5]!)).toBe(1);
    expect(r.omitted).toBe(2);
    expect(r.truncated).toBe(true);
  });
  it('1 項目がとても長いときも上限の行数に収まる', () => {
    const items = ['あ'.repeat(1000)];
    const r = fitMemo(items, 7);
    const lines = r.items.reduce((s, it) => s + estimateLines(it), 0);
    expect(lines + 1).toBeLessThanOrEqual(7);
    expect(r).toMatchObject({ omitted: 0, truncated: true });
  });
  it('使える行が 1 行以下なら項目は載せず注記だけ', () => {
    expect(fitMemo([one(0), one(1)], 1)).toEqual({ items: [], omitted: 2, truncated: false });
    expect(fitMemo([one(0)], 0)).toEqual({ items: [], omitted: 1, truncated: false });
  });
  it('結果は常に maxLines 行以内（注記を含む）', () => {
    for (let n = 0; n <= 20; n++) {
      const items = Array.from({ length: n }, (_, i) => (i % 3 === 0 ? two(i) : one(i)));
      for (const max of [3, 7, 11]) {
        const r = fitMemo(items, max);
        const lines = r.items.reduce((s, it) => s + estimateLines(it), 0) + (memoOmittedNote(r) ? 1 : 0);
        expect(lines).toBeLessThanOrEqual(max);
      }
    }
  });
});

describe('memoOmittedNote', () => {
  it('省略なしは null', () => {
    expect(memoOmittedNote({ items: ['a'], omitted: 0, truncated: false })).toBeNull();
  });
  it('件数を出す', () => {
    expect(memoNoteText(memoOmittedNote({ items: [], omitted: 3, truncated: false })!)).toBe('前提メモの残り 3 件は省略しました。全文は見積り画面を参照してください。');
  });
  it('切っただけ', () => {
    expect(memoNoteText(memoOmittedNote({ items: ['a…'], omitted: 0, truncated: true })!)).toBe('前提メモの一部を省略しました。全文は見積り画面を参照してください。');
  });
  it('注記は 1 行に収まる', () => {
    expect(estimateLines(memoNoteText(memoOmittedNote({ items: [], omitted: 12, truncated: true })!))).toBe(1);
  });
});
