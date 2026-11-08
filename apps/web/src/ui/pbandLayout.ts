// P 帯（ui/PBand.tsx）の目盛り範囲とラベル配置の計算。DOM に依存しない純関数だけを置く。

export interface AxisRange {
  lo: number;
  hi: number;
}

/**
 * 帯の目盛り範囲（人月）。設計稿の式: lo = ⌊min × 0.8 / 5⌋ × 5、hi = ⌈max × 1.1 / 5⌉ × 5。
 * 設計稿は lo の下限を 5 にしていたが、それだと min × 0.8 < 5 の小さな見積りで帯が左端に潰れるので下限は 0 にする
 * （min × 0.8 ≥ 5 なら設計稿と同じ値。ただし 5 の倍数ちょうどの浮動小数誤差は丸める）。非有限値は無視し、値が無い・幅が 0 以下なら 5 人月の幅を取る。
 */
export function bandRange(values: readonly number[]): AxisRange {
  const vs = values.filter((v) => Number.isFinite(v));
  if (vs.length === 0) return { lo: 0, hi: 5 };
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  // 50 × 1.1 = 55.000…01 のような浮動小数の尾で 1 目盛り飛ばないよう、ごく小さな許容差を入れる
  const lo = Math.max(0, Math.floor((min * 0.8) / 5 + 1e-9) * 5);
  let hi = Math.ceil((max * 1.1) / 5 - 1e-9) * 5;
  if (!(hi > lo)) hi = lo + 5;
  return { lo, hi };
}

/**
 * 編集中に目盛りが揺れないよう、前回の範囲を「広げる方向にだけ」更新する。
 * ・前回が無ければ need
 * ・前回と need の和集合が need の幅の maxZoomOut 倍を超える（規模を大きく変えた等で帯が細くなりすぎる）なら need に戻す
 * ・それ以外は和集合。前回と同じなら前回のオブジェクトをそのまま返す（React の state 比較用）
 */
export function stableRange(prev: AxisRange | null, need: AxisRange, maxZoomOut = 2): AxisRange {
  if (!prev) return need;
  const lo = Math.min(prev.lo, need.lo);
  const hi = Math.max(prev.hi, need.hi);
  if (hi - lo > maxZoomOut * (need.hi - need.lo)) return need;
  if (lo === prev.lo && hi === prev.hi) return prev;
  return { lo, hi };
}

/** 値 → 帯の左端からの割合（0〜100、範囲外は端に寄せる） */
export function rangePct(v: number, r: AxisRange): number {
  const span = r.hi - r.lo;
  if (!(span > 0) || !Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, ((v - r.lo) / span) * 100));
}

/** ラベル 1 つ: 指す位置 x と幅 w（どちらも px、帯の左端が 0） */
export interface LabelBox {
  x: number;
  w: number;
}

/**
 * P 値ラベルの配置。
 * - positioned: 各ラベルを指す位置の上に 1 段で置く（left は px）。各ラベルは必ず自分の位置 x をまたぎ、
 *   順序を保ち、隣と gap 以上離れ、帯の幅からはみ出さない。
 * - columns: その条件で 1 段に置けない（値が近すぎる・幅が足りない）ときは、等幅の列に順に並べる。
 */
export type LabelLayout = { mode: 'positioned'; left: number[] } | { mode: 'columns' };

export function placeLabels(items: readonly LabelBox[], width: number, gap = 8): LabelLayout {
  const n = items.length;
  if (n === 0) return { mode: 'positioned', left: [] };
  if (!(width > 0) || items.some((it) => !Number.isFinite(it.x) || !Number.isFinite(it.w) || it.w < 0)) return { mode: 'columns' };
  // 各ラベルの左端が取りうる範囲: x をまたぐ（x − w ≤ left ≤ x）かつ帯の中（0 ≤ left ≤ width − w）
  const minL = items.map((it) => Math.max(0, it.x - it.w));
  const maxL = items.map((it) => Math.min(it.x, width - it.w));
  // 前から詰めた最も左の位置 E と、後ろから詰めた最も右の位置 L
  const E: number[] = [];
  for (let i = 0; i < n; i++) E[i] = i === 0 ? minL[i]! : Math.max(minL[i]!, E[i - 1]! + items[i - 1]!.w + gap);
  const L: number[] = [];
  for (let i = n - 1; i >= 0; i--) L[i] = i === n - 1 ? maxL[i]! : Math.min(maxL[i]!, L[i + 1]! - items[i]!.w - gap);
  for (let i = 0; i < n; i++) if (E[i]! > L[i]! + 1e-9) return { mode: 'columns' };
  // 実行可能。各ラベルをできるだけ中央（x − w/2）に寄せる
  const left: number[] = [];
  for (let i = 0; i < n; i++) {
    const it = items[i]!;
    const lower = i === 0 ? E[i]! : Math.max(E[i]!, left[i - 1]! + items[i - 1]!.w + gap);
    left[i] = Math.min(L[i]!, Math.max(lower, it.x - it.w / 2));
  }
  return { mode: 'positioned', left };
}

/**
 * ▲（参照値）のラベル位置。▲ の印は帯の直下の x にあり、目盛り行の左端に lo、右端に hi のラベルがある。
 * - row 0 / side right: ▲ の右隣（x + markerHalf + 2 から）に置き、hi のラベルと gap 以上あけて収まる
 * - row 0 / side left: 右隣に入らなければ ▲ の左隣に置き、lo のラベルと gap 以上あけて収まる
 * - row 1: どちらにも入らなければ次の行に、▲ の位置を中心にして帯の幅の中に置く（このときは文字の「▲」を付けて表示する）
 * w は「▲」を除いた文字の幅。left は px。ref が帯の外（x < 0 や x > width）でも端に寄せて返す。
 */
export function placeRefLabel(
  ref: LabelBox,
  ends: { loW: number; hiW: number },
  width: number,
  gap = 8,
  markerHalf = 5,
): { row: 0; side: 'left' | 'right'; left: number } | { row: 1; left: number } {
  const x = Math.min(Math.max(Number.isFinite(ref.x) ? ref.x : 0, 0), Math.max(0, width));
  const minL = ends.loW + gap;
  const maxR = width - ends.hiW - gap;
  const right = x + markerHalf + 2;
  if (right >= minL && right + ref.w <= maxR) return { row: 0, side: 'right', left: right };
  const left = x - markerHalf - 2 - ref.w;
  if (left >= minL && left + ref.w <= maxR) return { row: 0, side: 'left', left };
  return { row: 1, left: Math.max(0, Math.min(width - ref.w, x - ref.w / 2)) };
}
