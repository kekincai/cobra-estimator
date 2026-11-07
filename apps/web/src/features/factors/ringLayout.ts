// 関係図の配置計算（768 × 760 の座標系）。直接要因を円周に並べ、間接要因は対象の隣に置く。

export const RING = { W: 768, H: 760, cx: 384, cy: 370, R: 220, nodeW: 164, nodeH: 76 } as const;

export interface Pos {
  x: number;
  y: number;
}

interface Item {
  id: string;
  kind: 'direct' | 'indirect';
  targetFactorId: string | null;
}

const overlaps = (a: Pos, b: Pos, pad = 8) => Math.abs(a.x - b.x) < RING.nodeW + pad && Math.abs(a.y - b.y) < RING.nodeH + pad;
const inBounds = (p: Pos) =>
  p.x - RING.nodeW / 2 >= 8 && p.x + RING.nodeW / 2 <= RING.W - 8 && p.y - RING.nodeH / 2 >= 8 && p.y + RING.nodeH / 2 <= RING.H - 56;
// 中央の式カード（294,320 – 474,420）
const hitsCenter = (p: Pos) => Math.abs(p.x - RING.cx) < 90 + RING.nodeW / 2 && Math.abs(p.y - RING.cy) < 50 + RING.nodeH / 2;

export function layoutRing(items: Item[]): Record<string, Pos & { a: number }> {
  const { cx, cy, R } = RING;
  const directs = items.filter((f) => f.kind === 'direct');
  const pos: Record<string, Pos & { a: number }> = {};
  directs.forEach((f, k) => {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / Math.max(1, directs.length);
    pos[f.id] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), a };
  });
  const placed = () => Object.values(pos);
  for (const f of items) {
    if (f.kind !== 'indirect') continue;
    const t = f.targetFactorId ? pos[f.targetFactorId] : undefined;
    if (!t) {
      // 対象なし（ルール違反のデータ）: 左下の空きに置く
      pos[f.id] = { x: RING.nodeW / 2 + 16, y: RING.H - 100 - placed().length * 4, a: 0 };
      continue;
    }
    // 接線方向（時計回り / 反時計回り）→ 外向き → 内向きの順に、空いている場所を探す
    const tx = -Math.sin(t.a), ty = Math.cos(t.a);
    const ox = Math.cos(t.a), oy = Math.sin(t.a);
    const candidates: Pos[] = [
      { x: t.x + tx * 236, y: t.y + ty * 236 - 6 },
      { x: t.x - tx * 236, y: t.y - ty * 236 - 6 },
      { x: t.x + ox * 110, y: t.y + oy * 110 },
      { x: t.x + tx * 180 + ox * 90, y: t.y + ty * 180 + oy * 90 },
      { x: t.x - tx * 180 + ox * 90, y: t.y - ty * 180 + oy * 90 },
      { x: t.x - ox * 120, y: t.y - oy * 120 },
    ];
    const ok = candidates.find((c) => inBounds(c) && !hitsCenter(c) && placed().every((p) => !overlaps(c, p)));
    pos[f.id] = { ...(ok ?? candidates[0]!), a: t.a };
  }
  return pos;
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
