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
