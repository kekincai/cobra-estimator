import { describe, expect, it } from 'vitest';
import { bandRange, placeLabels, placeRefLabel, rangePct, stableRange, type LabelBox } from './pbandLayout';

/** 配置結果の不変条件: 順序、x をまたぐ、重ならない、帯の中 */
function expectValid(items: LabelBox[], left: number[], width: number, gap = 8) {
  items.forEach((it, i) => {
    const l = left[i]!;
    expect(l).toBeGreaterThanOrEqual(-1e-9);
    expect(l + it.w).toBeLessThanOrEqual(width + 1e-9);
    expect(l).toBeLessThanOrEqual(it.x + 1e-9);
    expect(l + it.w).toBeGreaterThanOrEqual(it.x - 1e-9);
    if (i > 0) expect(l).toBeGreaterThanOrEqual(left[i - 1]! + items[i - 1]!.w + gap - 1e-9);
  });
}

describe('bandRange（目盛り範囲。設計稿の式）', () => {
  it('portal G3（P20 38.7 / P95 56.2 / 保存済み 43.9）は 30〜65', () => {
    expect(bandRange([38.7, 56.2, 43.9])).toEqual({ lo: 30, hi: 65 });
  });
  it('5 の倍数の境目: 37.5 × 0.8 = 30 → lo 30、50 × 1.1 = 55 → hi 55', () => {
    expect(bandRange([37.5, 50])).toEqual({ lo: 30, hi: 55 });
    expect(bandRange([37.4, 50.1])).toEqual({ lo: 25, hi: 60 });
  });
  it('小さな値でも lo は 0 未満にならず、帯が潰れない', () => {
    expect(bandRange([2, 3])).toEqual({ lo: 0, hi: 5 });
    expect(bandRange([0, 0])).toEqual({ lo: 0, hi: 5 });
  });
  it('全部同じ値でも hi > lo', () => {
    const r = bandRange([40, 40, 40, 40]);
    expect(r).toEqual({ lo: 30, hi: 45 });
    expect(r.hi).toBeGreaterThan(r.lo);
  });
  it('空・非有限値は無視する', () => {
    expect(bandRange([])).toEqual({ lo: 0, hi: 5 });
    expect(bandRange([NaN, Infinity, 40])).toEqual(bandRange([40]));
  });
});

describe('stableRange（編集中は広げる方向にだけ動く）', () => {
  const r0 = { lo: 30, hi: 65 };
  it('前回が無ければ need', () => {
    expect(stableRange(null, r0)).toBe(r0);
  });
  it('need が前回の内側なら前回のまま（同じオブジェクト）', () => {
    expect(stableRange(r0, { lo: 35, hi: 60 })).toBe(r0);
  });
  it('need がはみ出す側だけ広げる', () => {
    expect(stableRange(r0, { lo: 30, hi: 70 })).toEqual({ lo: 30, hi: 70 });
    expect(stableRange(r0, { lo: 25, hi: 60 })).toEqual({ lo: 25, hi: 65 });
  });
  it('レベルを 1 つずつ動かしても範囲は縮まない（揺れない）', () => {
    let r = stableRange(null, bandRange([38.7, 56.2, 43.9]));
    for (const [p20, p95] of [[37.1, 54.0], [38.9, 56.6], [36.2, 52.9], [38.7, 56.2]]) r = stableRange(r, bandRange([p20!, p95!, 43.9]));
    expect(r).toEqual({ lo: 25, hi: 65 });
  });
  it('need の 2 倍を超えて広がるなら need に戻す（規模を大きく変えたとき）', () => {
    expect(stableRange(r0, { lo: 90, hi: 140 })).toEqual({ lo: 90, hi: 140 });
    // ちょうど 2 倍までは和集合
    expect(stableRange(r0, { lo: 80, hi: 130 })).toEqual({ lo: 30, hi: 130 });
    expect(stableRange(r0, { lo: 5, hi: 20 })).toEqual({ lo: 5, hi: 20 });
  });
});

describe('rangePct', () => {
  it('範囲内は割合、範囲外は端に寄せる', () => {
    expect(rangePct(30, { lo: 30, hi: 65 })).toBe(0);
    expect(rangePct(47.5, { lo: 30, hi: 65 })).toBe(50);
    expect(rangePct(10, { lo: 30, hi: 65 })).toBe(0);
    expect(rangePct(99, { lo: 30, hi: 65 })).toBe(100);
  });
  it('幅 0・非有限値は 0', () => {
    expect(rangePct(40, { lo: 40, hi: 40 })).toBe(0);
    expect(rangePct(NaN, { lo: 30, hi: 65 })).toBe(0);
  });
});

describe('placeLabels（P 値ラベルの配置）', () => {
  const W = 76; // 「超過確率 80%」11px のおよその幅
  const at = (r: { lo: number; hi: number }, width: number, vs: number[]) => vs.map((v) => ({ x: (rangePct(v, r) / 100) * width, w: W }));

  it('1440 幅（帯 ≈ 600px）の portal G3 は各ラベルを値の真上に 1 段で置く', () => {
    const items = at({ lo: 30, hi: 65 }, 600, [38.7, 43.9, 49.9, 56.2]);
    const res = placeLabels(items, 600);
    expect(res.mode).toBe('positioned');
    if (res.mode !== 'positioned') return;
    expectValid(items, res.left, 600);
    // 余裕があるので中央揃えのまま
    items.forEach((it, i) => expect(res.left[i]).toBeCloseTo(it.x - W / 2, 6));
  });

  it('近い値（P20 と P50 が 1.5 人月差）は重ならないようにずらす。どちらも自分の位置をまたぐ', () => {
    const items = at({ lo: 30, hi: 65 }, 600, [42.4, 43.9, 49.9, 56.2]);
    const res = placeLabels(items, 600);
    expect(res.mode).toBe('positioned');
    if (res.mode === 'positioned') expectValid(items, res.left, 600);
  });

  it('前のラベルを左へずらせば入る場合も 1 段にする（後ろへ押すだけの貪欲法では失敗する配置）', () => {
    const items = [
      { x: 300, w: 90 },
      { x: 320, w: 90 },
    ];
    const res = placeLabels(items, 800);
    expect(res.mode).toBe('positioned');
    if (res.mode === 'positioned') expectValid(items, res.left, 800);
  });

  it('全部同じ値は 1 段に置けないので列に並べる', () => {
    expect(placeLabels(at({ lo: 30, hi: 45 }, 600, [40, 40, 40, 40]), 600)).toEqual({ mode: 'columns' });
  });

  it('375 幅（帯 ≈ 311px）の portal G3 は 1 段に入らないので列に並べる', () => {
    expect(placeLabels(at({ lo: 30, hi: 65 }, 311, [38.7, 43.9, 49.9, 56.2]), 311).mode).toBe('columns');
  });

  it('端の値でもラベルは帯の幅からはみ出さない', () => {
    const items = at({ lo: 30, hi: 65 }, 600, [30, 40, 55, 65]);
    const res = placeLabels(items, 600);
    expect(res.mode).toBe('positioned');
    if (res.mode === 'positioned') {
      expectValid(items, res.left, 600);
      expect(res.left[0]).toBe(0);
      expect(res.left[3]! + W).toBe(600);
    }
  });

  it('ラベルが帯より広い・幅 0・非有限値は列に並べる', () => {
    expect(placeLabels([{ x: 10, w: 400 }], 300).mode).toBe('columns');
    expect(placeLabels([{ x: 10, w: 40 }], 0).mode).toBe('columns');
    expect(placeLabels([{ x: NaN, w: 40 }], 300).mode).toBe('columns');
  });

  it('ラベル無しは空の配置', () => {
    expect(placeLabels([], 300)).toEqual({ mode: 'positioned', left: [] });
  });
});

describe('placeRefLabel（▲ 参照ラベルは端の目盛りと重ならない）', () => {
  const ends = { loW: 16, hiW: 48 };
  const noOverlap = (left: number, w: number, width: number) => {
    expect(left).toBeGreaterThanOrEqual(ends.loW + 8);
    expect(left + w).toBeLessThanOrEqual(width - ends.hiW - 8);
  };
  it('既定は ▲ の右隣', () => {
    expect(placeRefLabel({ x: 300, w: 100 }, ends, 600)).toEqual({ row: 0, side: 'right', left: 307 });
  });
  it('▲ が左端の目盛りに近くても、右隣なら lo と重ならない', () => {
    const r = placeRefLabel({ x: 20, w: 100 }, ends, 600);
    expect(r).toEqual({ row: 0, side: 'right', left: 27 });
    noOverlap(r.left, 100, 600);
  });
  it('▲ が右端の目盛りに近いときは ▲ の左隣に置き、hi と重ならない', () => {
    const r = placeRefLabel({ x: 520, w: 100 }, ends, 600);
    expect(r).toEqual({ row: 0, side: 'left', left: 413 });
    noOverlap(r.left, 100, 600);
  });
  it('▲ が lo の目盛りの真下（右隣だと lo に食い込む）なら次の行', () => {
    expect(placeRefLabel({ x: 5, w: 100 }, ends, 600)).toEqual({ row: 1, left: 0 });
  });
  it('帯の外の参照値は端に寄せる', () => {
    expect(placeRefLabel({ x: -50, w: 100 }, ends, 600)).toEqual({ row: 1, left: 0 });
    expect(placeRefLabel({ x: 900, w: 100 }, ends, 600)).toEqual({ row: 1, left: 500 });
  });
  it('▲ が hi の目盛りの真下なら左隣でも hi に食い込むので次の行', () => {
    expect(placeRefLabel({ x: 560, w: 100 }, ends, 600)).toEqual({ row: 1, left: 500 });
  });
  it('375 幅（帯 311px）の portal G3: ▲ 43.9 は 30〜65 の 40% → 右隣に入る', () => {
    const x = (rangePct(43.9, { lo: 30, hi: 65 }) / 100) * 311;
    const r = placeRefLabel({ x, w: 96 }, { loW: 14, hiW: 40 }, 311);
    expect(r.row).toBe(0);
    if (r.row === 0) {
      expect(r.side).toBe('right');
      expect(r.left + 96).toBeLessThanOrEqual(311 - 40 - 8);
    }
  });
  it('375 幅で 200% 文字（ラベルが広い）なら次の行に置き、帯からはみ出さない', () => {
    const r = placeRefLabel({ x: 120, w: 200 }, { loW: 28, hiW: 80 }, 311);
    expect(r.row).toBe(1);
    expect(r.left).toBeGreaterThanOrEqual(0);
    expect(r.left + 200).toBeLessThanOrEqual(311);
  });
  it('次の行でも帯より広いラベルは左端から', () => {
    expect(placeRefLabel({ x: 120, w: 400 }, ends, 311)).toEqual({ row: 1, left: 0 });
  });
});
