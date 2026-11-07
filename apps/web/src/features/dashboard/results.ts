// ダッシュボードで使う見積り結果のビュー計算（純関数）。
import { exceedance, type Contribution, type Histogram, type Percentile, type SimulationResult } from 'cobra-core';

/** 保存済み Generation.results（samples なし）またはワーカーの SimulationResult を正規化したもの */
export interface DashResult {
  runs: number;
  nominal: number;
  sco: number;
  p50: number;
  pct: Record<Percentile, number>;
  histogram: Histogram;
  contributions: Contribution[];
  /** 昇順サンプル。ワーカーで計算したときだけある */
  samples?: Float64Array;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** API の results（unknown）を検証して取り出す。形が合わなければ null */
export function fromStored(results: unknown): DashResult | null {
  if (!results || typeof results !== 'object') return null;
  const r = results as Partial<SimulationResult>;
  const h = r.histogram;
  if (!isNum(r.p50) || !isNum(r.nominal) || !r.pct || !isNum(r.pct[50]) || !h || !Array.isArray(h.counts)) return null;
  return {
    runs: isNum(r.runs) ? r.runs : h.counts.reduce((s, c) => s + c, 0),
    nominal: r.nominal,
    sco: isNum(r.scoExpected) ? r.scoExpected : r.p50 / r.nominal - 1,
    p50: r.p50,
    pct: r.pct,
    histogram: h,
    contributions: Array.isArray(r.contributions) ? r.contributions : [],
  };
}

export function fromSim(r: SimulationResult): DashResult {
  return { runs: r.runs, nominal: r.nominal, sco: r.scoExpected, p50: r.p50, pct: r.pct, histogram: r.histogram, contributions: r.contributions, samples: r.samples };
}

/** P(工数 > x)。サンプルがあれば厳密、なければヒストグラムを線形補間 */
export function exceedAt(r: DashResult, x: number): number {
  if (r.samples && r.samples.length) return exceedance(r.samples, x);
  const { lo, width, counts } = r.histogram;
  const total = counts.reduce((s, c) => s + c, 0);
  if (!total) return 0;
  let above = 0;
  for (let i = 0; i < counts.length; i++) {
    const a = lo + i * width;
    const b = a + width;
    if (x <= a) above += counts[i]!;
    else if (x < b) above += (counts[i]! * (b - x)) / width;
  }
  return Math.max(0, Math.min(1, above / total));
}

/**
 * 帯・予算スライダーの目盛り（5 人月刻み）。例: P5 31.4 / P95 56.9 / 予算 45 → 30〜65。
 * anchor（保存済みの予算）があれば、それも目盛りに入るよう広げる。
 */
export function bandScale(r: DashResult, anchor?: number | null): { lo: number; hi: number } {
  const a = anchor != null && Number.isFinite(anchor) && anchor > 0 ? anchor : null;
  const lo = Math.floor(Math.min(r.pct[5], a ?? Infinity) / 5) * 5;
  const hi = Math.ceil(Math.max(r.pct[95] * 1.1, a != null ? a * 1.05 : 0) / 5) * 5;
  return { lo, hi: hi > lo ? hi : lo + 5 };
}

export interface ViewBin {
  /** ビン中央の工数 */
  x: number;
  count: number;
}

/**
 * 表示用ビン。サンプルがあれば中央付近 [P5 − 0.35×(P50−P5), P95 + 0.5×(P95−P50)] を n 等分して数え直す
 * （裾を切って形を読みやすくする）。なければ保存済みヒストグラムをそのまま使う。
 */
export function viewBins(r: DashResult, n = 24): { bins: ViewBin[]; lo: number; hi: number } {
  const s = r.samples;
  if (s && s.length) {
    const lo = Math.max(s[0]!, r.pct[5] - (r.p50 - r.pct[5]) * 0.35);
    const hi = Math.min(s[s.length - 1]!, r.pct[95] + (r.pct[95] - r.p50) * 0.5);
    const w = (hi - lo) / n || 1;
    const counts = new Array<number>(n).fill(0);
    for (let i = 0; i < s.length; i++) {
      const v = s[i]!;
      if (v < lo || v > hi) continue;
      counts[Math.min(n - 1, Math.floor((v - lo) / w))]!++;
    }
    return { lo, hi, bins: counts.map((count, i) => ({ x: lo + w * (i + 0.5), count })) };
  }
  const { lo, width, counts } = r.histogram;
  return { lo, hi: lo + width * counts.length, bins: counts.map((count, i) => ({ x: lo + width * (i + 0.5), count })) };
}
