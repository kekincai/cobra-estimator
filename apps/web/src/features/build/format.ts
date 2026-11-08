import type { ExpertMode } from 'cobra-core';

export const expertLabel = (m: ExpertMode) => (m.kind === 'average' ? '平均' : m.expert);

/** "11/5 10:42"（ローカル時刻） */
export function shortDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "11/5" */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 符号付き。0.0012 → "+0.0012"、−1.4 → "−1.4" */
export const signed = (v: number, digits: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(digits)}`;

/** 小数 digits 桁に丸める（表示と同じ精度） */
export function roundTo(v: number, digits: number): number {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
}

/**
 * 表示用の差分。表示精度に丸めた値どうしを引く（「0.0228 − 0.0210」が表示と食い違わないように）。
 * どちらかが null / 非有限なら null。
 */
export function displayDelta(cur: number | null | undefined, prev: number | null | undefined, digits: number): number | null {
  if (cur == null || prev == null || !Number.isFinite(cur) || !Number.isFinite(prev)) return null;
  const d = roundTo(roundTo(cur, digits) - roundTo(prev, digits), digits);
  return d === 0 ? 0 : d; // −0 を 0 に
}

/** 差分の色分け。higherIsWorse = 増えると悪化（MMRE、α）。0 は変化なし */
export function deltaTone(delta: number | null, higherIsWorse = true): 'worse' | 'better' | 'same' | null {
  if (delta === null) return null;
  if (delta === 0) return 'same';
  return delta > 0 === higherIsWorse ? 'worse' : 'better';
}
