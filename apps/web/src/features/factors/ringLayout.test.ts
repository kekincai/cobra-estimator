import { describe, expect, it } from 'vitest';
import { SEED_FACTORS } from 'cobra-core/seed';
import { layoutRelations, RING, type LayoutItem, type RingLayout } from './ringLayout';

function items(nDirect: number, nIndirect: number, orphan = 0): LayoutItem[] {
  const out: LayoutItem[] = [];
  for (let i = 0; i < nDirect; i++) out.push({ id: `D${i}`, kind: 'direct', targetFactorId: null });
  // 間接要因は直接要因 1 つにつき 1 つまで。対象はばらけさせる（i * 7 mod n）
  const used = new Set<number>();
  for (let i = 0; i < nIndirect; i++) {
    let t = (i * 7) % nDirect;
    while (used.has(t)) t = (t + 1) % nDirect;
    used.add(t);
    out.push({ id: `I${i}`, kind: 'indirect', targetFactorId: `D${t}` });
  }
  for (let i = 0; i < orphan; i++) out.push({ id: `O${i}`, kind: 'indirect', targetFactorId: null });
  return out;
}

/** すべてのノードの箱が互いに重ならず、中央カードとも重ならず、キャンバスに収まる */
function assertNoOverlap(l: RingLayout, ids: string[]) {
  const ps = ids.map((id) => l.pos[id]!);
  expect(ps.every(Boolean)).toBe(true);
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i]!;
    expect(a.x - RING.nodeW / 2).toBeGreaterThanOrEqual(0);
    expect(a.y - RING.nodeH / 2).toBeGreaterThanOrEqual(0);
    expect(a.x + RING.nodeW / 2).toBeLessThanOrEqual(l.W);
    expect(a.y + RING.nodeH / 2).toBeLessThanOrEqual(l.H);
    const center = Math.abs(a.x - l.cx) < (RING.nodeW + RING.centerW) / 2 && Math.abs(a.y - l.cy) < (RING.nodeH + RING.centerH) / 2;
    expect(center, `${ids[i]} が中央カードに重なる`).toBe(false);
    for (let j = i + 1; j < ps.length; j++) {
      const b = ps[j]!;
      const hit = Math.abs(a.x - b.x) < RING.nodeW && Math.abs(a.y - b.y) < RING.nodeH;
      expect(hit, `${ids[i]} と ${ids[j]} が重なる (${a.x.toFixed(0)},${a.y.toFixed(0)}) (${b.x.toFixed(0)},${b.y.toFixed(0)})`).toBe(false);
    }
  }
}

describe('layoutRelations', () => {
  it('seed（直接 7 + 間接 1）は設計稿と同じ 768 × 760・半径 220 の円', () => {
    const l = layoutRelations(SEED_FACTORS.map((f) => ({ id: f.id, kind: f.kind, targetFactorId: f.targetFactorId ?? null })));
    expect([l.W, l.H, l.cx, l.cy, l.rx, l.ry]).toEqual([768, 760, 384, 370, 220, 220]);
    // 以前の配置計算（固定 R = 220）の出力と同じ位置
    const before: Record<string, [number, number]> = {
      F01: [384, 150], F03: [556.003, 232.832], F04: [598.484, 418.955], F05: [479.454, 568.213],
      F06: [288.546, 568.213], F07: [169.516, 418.955], F08: [211.997, 232.832], F02: [620, 144],
    };
    for (const [id, [x, y]] of Object.entries(before)) {
      expect(l.pos[id]!.x).toBeCloseTo(x, 2);
      expect(l.pos[id]!.y).toBeCloseTo(y, 2);
    }
    assertNoOverlap(l, SEED_FACTORS.map((f) => f.id));
  });

  it('標準要因を全部入れた状態（直接 14 + 間接 2）でも重ならない', () => {
    const its = items(14, 2);
    const l = layoutRelations(its);
    assertNoOverlap(l, its.map((i) => i.id));
    expect(l.W).toBeGreaterThan(RING.W - 1);
  });

  it('要因が合計 30 以下のすべての組み合わせで、ノードの箱が重ならない', () => {
    for (let d = 0; d <= 30; d++) {
      for (let i = 0; i <= Math.min(d, 30 - d); i++) {
        const its = items(d, i);
        assertNoOverlap(layoutRelations(its), its.map((x) => x.id));
      }
    }
  });

  it('対象のない間接要因（ルール違反のデータ）も重ならない場所に置く', () => {
    for (const [d, i, o] of [[0, 0, 1], [3, 1, 2], [8, 1, 1], [14, 2, 3], [20, 5, 5]] as const) {
      const its = items(d, i, o);
      assertNoOverlap(layoutRelations(its), its.map((x) => x.id));
    }
  });

  it('8 要因まではキャンバスを広げない', () => {
    for (let d = 1; d <= 8; d++) {
      const l = layoutRelations(items(d, 0));
      expect([l.W, l.H]).toEqual([768, 760]);
    }
  });

  it('決定的（同じ入力なら同じ結果）', () => {
    const its = items(16, 4);
    expect(layoutRelations(its)).toEqual(layoutRelations(its));
  });
});
