// 関係図の配置計算。直接要因を中央の式カードの周りの楕円に並べ、間接要因は対象の直接要因の近くの空きに置く。
// 要因が 8 つまでは設計稿（design/Relations.dc.html）と同じ 768 × 760・半径 220 の円になる。
// それより多いときは、ノード同士が重ならない最小の楕円（必要なら 2 段に互い違い）を探し、キャンバスを広げる。

/** ノードと中央カードの大きさ、設計稿のキャンバス */
export const RING = { W: 768, H: 760, cx: 384, cy: 370, R: 220, nodeW: 164, nodeH: 76, centerW: 180, centerH: 100 } as const;

/** ノード同士の最小の隙間（px） */
export const NODE_GAP = 8;
const MARGIN = 14;

export interface Pos {
  x: number;
  y: number;
}

export interface LayoutItem {
  id: string;
  kind: 'direct' | 'indirect';
  targetFactorId: string | null;
}

export interface RingLayout {
  /** キャンバスの大きさ */
  W: number;
  H: number;
  /** 中央の式カードの中心 */
  cx: number;
  cy: number;
  /** 直接要因を並べた楕円（点線の円の描画用） */
  rx: number;
  ry: number;
  /** ノードの中心（a は楕円上の角度） */
  pos: Record<string, Pos & { a: number }>;
}

type P = Pos & { a: number };

const boxHit = (a: Pos, b: Pos, gap = NODE_GAP) => Math.abs(a.x - b.x) < RING.nodeW + gap && Math.abs(a.y - b.y) < RING.nodeH + gap;
// 中央の式カードとの重なり（中心を原点とした相対座標）
const hitsCenter = (p: Pos, gap = NODE_GAP) => Math.abs(p.x) < (RING.centerW + RING.nodeW) / 2 + gap && Math.abs(p.y) < (RING.centerH + RING.nodeH) / 2 + gap;

/** 線分 p→q がノード（中心 c）の箱を通るか（Liang–Barsky） */
function segmentHitsBox(p: Pos, q: Pos, c: Pos, shrink = 4): boolean {
  const hw = RING.nodeW / 2 - shrink, hh = RING.nodeH / 2 - shrink;
  let t0 = 0, t1 = 1;
  const dx = q.x - p.x, dy = q.y - p.y;
  const edges: [number, number][] = [
    [-dx, p.x - (c.x - hw)],
    [dx, c.x + hw - p.x],
    [-dy, p.y - (c.y - hh)],
    [dy, c.y + hh - p.y],
  ];
  for (const [pp, qq] of edges) {
    if (pp === 0) {
      if (qq < 0) return false;
      continue;
    }
    const r = qq / pp;
    if (pp < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}

/** 直接要因の位置（中心を原点とした相対座標） */
function placeDirects(n: number, rx: number, ry: number, stagger: number): P[] {
  return Array.from({ length: n }, (_, k) => {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / Math.max(1, n);
    const s = stagger && k % 2 === 1 ? stagger : 0;
    return { x: (rx + s * 0.6) * Math.cos(a), y: (ry + s) * Math.sin(a), a };
  });
}

function directsValid(ps: P[], stagger: number): boolean {
  for (let i = 0; i < ps.length; i++) {
    if (hitsCenter(ps[i]!)) return false;
    for (let j = i + 1; j < ps.length; j++) if (boxHit(ps[i]!, ps[j]!)) return false;
  }
  if (stagger) {
    // 外側の段から中央への線が、内側の段のノードを横切らないこと
    const o = { x: 0, y: 0 };
    for (let i = 0; i < ps.length; i++) for (let j = 0; j < ps.length; j++) if (i !== j && segmentHitsBox(ps[i]!, o, ps[j]!)) return false;
  }
  return true;
}

/** 間接要因を対象の近くの空きに置く。inside が与えられたら、その範囲に収まる候補を先に試す */
function placeIndirect(t: P | undefined, placed: P[], inside?: (p: Pos) => boolean): P {
  const free = (c: Pos) => !hitsCenter(c) && placed.every((p) => !boxHit(c, p));
  const out: Pos[] = [];
  if (t) {
    const tx = -Math.sin(t.a), ty = Math.cos(t.a);
    const ox = Math.cos(t.a), oy = Math.sin(t.a);
    // 設計稿の順: 接線方向（時計回り / 反時計回り）→ 外向き → 斜め外 → 内向き
    out.push(
      { x: t.x + tx * 236, y: t.y + ty * 236 - 6 },
      { x: t.x - tx * 236, y: t.y - ty * 236 - 6 },
      { x: t.x + ox * 110, y: t.y + oy * 110 },
      { x: t.x + tx * 180 + ox * 90, y: t.y + ty * 180 + oy * 90 },
      { x: t.x - tx * 180 + ox * 90, y: t.y - ty * 180 + oy * 90 },
      { x: t.x - ox * 120, y: t.y - oy * 120 },
    );
    const first = out.find((c) => (!inside || inside(c)) && free(c));
    if (first) return { ...first, a: t.a };
    // 外向きに少しずつ離しながら探す（外側はいずれ必ず空く）
    for (let d = 110; d < 6000; d += 24) {
      for (const off of [0, 120, -120, 236, -236]) {
        const c = { x: t.x + ox * d + tx * off, y: t.y + oy * d + ty * off };
        if (free(c)) return { ...c, a: t.a };
      }
    }
    return { x: t.x + ox * 6000, y: t.y + oy * 6000, a: t.a };
  }
  // 対象なし（ルール違反のデータ）: 下側の空きに置く
  const maxY = placed.reduce((m, p) => Math.max(m, p.y), RING.centerH / 2);
  for (let y = RING.R; y < 6000; y += 24) {
    for (let x = -RING.R; x <= RING.R; x += RING.nodeW / 2) {
      const c = { x, y };
      if (free(c)) return { ...c, a: Math.PI / 2 };
    }
  }
  return { x: 0, y: maxY + 6000, a: Math.PI / 2 };
}

function bbox(ps: Pos[]) {
  let x0 = -RING.centerW / 2, x1 = RING.centerW / 2, y0 = -RING.centerH / 2, y1 = RING.centerH / 2;
  for (const p of ps) {
    x0 = Math.min(x0, p.x - RING.nodeW / 2);
    x1 = Math.max(x1, p.x + RING.nodeW / 2);
    y0 = Math.min(y0, p.y - RING.nodeH / 2);
    y1 = Math.max(y1, p.y + RING.nodeH / 2);
  }
  return { x0, x1, y0, y1 };
}

// 設計稿のキャンバスに収まるか（下 56px は以前の凡例の場所。8 要因までの配置を設計稿と同じにするため）
const inBase = (p: Pos) =>
  p.x - RING.nodeW / 2 + RING.cx >= 8 &&
  p.x + RING.nodeW / 2 + RING.cx <= RING.W - 8 &&
  p.y - RING.nodeH / 2 + RING.cy >= 8 &&
  p.y + RING.nodeH / 2 + RING.cy <= RING.H - 56;

function build(items: readonly LayoutItem[], rx: number, ry: number, stagger: number, base: boolean) {
  const directs = items.filter((f) => f.kind === 'direct');
  const rel: Record<string, P> = {};
  placeDirects(directs.length, rx, ry, stagger).forEach((p, k) => (rel[directs[k]!.id] = p));
  for (const f of items) {
    if (f.kind !== 'indirect') continue;
    rel[f.id] = placeIndirect(f.targetFactorId ? rel[f.targetFactorId] : undefined, Object.values(rel), base ? inBase : undefined);
  }
  return rel;
}

/** 配置を計算する。同じ入力なら同じ結果（決定的）。 */
export function layoutRelations(items: readonly LayoutItem[]): RingLayout {
  const n = items.filter((f) => f.kind === 'direct').length;
  // 1) 設計稿の円（半径 220）で重ならなければそれを使う
  const baseDirects = placeDirects(n, RING.R, RING.R, 0);
  if (directsValid(baseDirects, 0)) {
    const rel = build(items, RING.R, RING.R, 0, true);
    const b = bbox(Object.values(rel));
    if (b.x0 + RING.cx >= MARGIN && b.x1 + RING.cx <= RING.W - MARGIN && b.y0 + RING.cy >= MARGIN && b.y1 + RING.cy <= RING.H - MARGIN) {
      return finish(rel, RING.W, RING.H, RING.cx, RING.cy, RING.R, RING.R);
    }
  }
  // 2) 重ならない最小の楕円を探す（縦横比と 2 段の互い違いを試し、キャンバスの面積が最小のもの）
  let best: { rel: Record<string, P>; rx: number; ry: number; area: number } | null = null;
  for (const aspect of [1, 1.25, 1.5, 1.75]) {
    for (const stagger of [0, RING.nodeH + NODE_GAP]) {
      for (let ry = RING.R; ry < 4000; ry += 6) {
        const rx = ry * aspect;
        if (!directsValid(placeDirects(n, rx, ry, stagger), stagger)) continue;
        const rel = build(items, rx, ry, stagger, false);
        const b = bbox(Object.values(rel));
        const area = Math.max(RING.W, b.x1 - b.x0 + 2 * MARGIN) * Math.max(RING.H, b.y1 - b.y0 + 2 * MARGIN);
        if (!best || area < best.area - 1) best = { rel, rx, ry, area };
        break;
      }
    }
  }
  const { rel, rx, ry } = best!;
  const b = bbox(Object.values(rel));
  const W = Math.max(RING.W, Math.ceil(b.x1 - b.x0 + 2 * MARGIN));
  const H = Math.max(RING.H, Math.ceil(b.y1 - b.y0 + 2 * MARGIN));
  // 余白を左右・上下に均等に分ける
  const cx = (W - (b.x1 - b.x0)) / 2 - b.x0;
  const cy = (H - (b.y1 - b.y0)) / 2 - b.y0;
  return finish(rel, W, H, cx, cy, rx, ry);
}

function finish(rel: Record<string, P>, W: number, H: number, cx: number, cy: number, rx: number, ry: number): RingLayout {
  const pos: Record<string, P> = {};
  for (const [id, p] of Object.entries(rel)) pos[id] = { x: p.x + cx, y: p.y + cy, a: p.a };
  return { W, H, cx, cy, rx, ry, pos };
}

/** 互換用: 以前の API（位置だけ） */
export function layoutRing(items: LayoutItem[]): Record<string, Pos & { a: number }> {
  return layoutRelations(items).pos;
}

/** 間接 → 直接 の曲線（向かい合う辺を結ぶ）と「強める」ラベルの位置 */
export function relationPath(from: Pos, to: Pos) {
  const { nodeW: W, nodeH: H } = RING;
  const dx = to.x - from.x, dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy) * 1.2) {
    const s = Math.sign(dx) || 1;
    const x1 = from.x + (s * W) / 2, x2 = to.x - (s * (W / 2 + 4));
    return { d: `M ${x1} ${from.y} C ${x1 + s * 40} ${from.y}, ${x2 - s * 40} ${to.y}, ${x2} ${to.y}`, lx: (x1 + x2) / 2, ly: Math.min(from.y, to.y) - 10 };
  }
  const s = Math.sign(dy) || 1;
  const y1 = from.y + (s * H) / 2, y2 = to.y - (s * (H / 2 + 4));
  return { d: `M ${from.x} ${y1} C ${from.x} ${y1 + s * 30}, ${to.x} ${y2 - s * 30}, ${to.x} ${y2}`, lx: (from.x + to.x) / 2 + 28, ly: (y1 + y2) / 2 };
}
