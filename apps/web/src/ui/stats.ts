import { quantile } from 'cobra-core';

// 図表用の小さな統計ヘルパ（ヒストグラム・軸目盛り）。

/** 昇順サンプルを [lo, hi) の n 区間に数える。範囲外は端の区間に含めない。 */
export function binSamples(sorted: ArrayLike<number>, lo: number, hi: number, n: number): number[] {
  const counts = new Array<number>(Math.max(0, Math.floor(n) || 0)).fill(0);
  const w = (hi - lo) / counts.length;
  if (!(w > 0) || !Number.isFinite(w)) return counts;
  for (let i = 0; i < sorted.length; i++) {
    const v = sorted[i]!;
    if (!(v >= lo && v < hi)) continue; // 範囲外・NaN は数えない
    counts[Math.min(counts.length - 1, Math.floor((v - lo) / w))]!++;
  }
  return counts;
}

/** 1, 2, 5 × 10^k の刻み */
export function niceStep(span: number, approxCount: number): number {
  const raw = span / Math.max(1, approxCount);
  if (!(raw > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}

/** [lo, hi] に収まるきりのよい目盛り */
export function niceTicks(lo: number, hi: number, approxCount = 4): number[] {
  const out: number[] = [];
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return out;
  const step = niceStep(hi - lo, approxCount);
  const start = Math.ceil(lo / step) * step;
  // 累積加算ではなく start + i × step（誤差をためない・桁落ちで止まらない）。目盛りは多くても 1,000 本
  for (let i = 0; i < 1000; i++) {
    const v = start + i * step;
    if (v > hi + step * 1e-9) break;
    out.push(Math.round(v * 1e6) / 1e6);
  }
  return out;
}

/** 分布の表示範囲: 0.5〜99.5 パーセンタイルの両側に幅の 15% の余白。サンプルが無ければ 0〜1 */
export function histRange(sorted: ArrayLike<number>): { lo: number; hi: number } {
  if (sorted.length === 0) return { lo: 0, hi: 1 };
  const a = quantile(sorted, 0.005);
  const b = quantile(sorted, 0.995);
  const pad = Math.max((b - a) * 0.15, Math.abs(b) * 0.01, 1e-9);
  return { lo: Math.max(0, a - pad), hi: b + pad };
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
