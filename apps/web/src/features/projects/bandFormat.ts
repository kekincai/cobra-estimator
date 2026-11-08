// ±25% の帯（cobra-core `INCONSISTENCY_THRESHOLD`）に対する判定と表示をそろえる。
// 判定は常に「元の値」で行う（cobra-core の isInconsistent: |gap| > 0.25、PRED(25): MRE ≤ 0.25 が帯の内）。
// 表示は既定で整数 % だが、四捨五入で「帯の外なのに +25%」と読めてしまうときだけ桁を増やす。
//   0.25 → 「+25%」（帯の内）、0.2526 → 「+25.3%」（帯の外）、0.2549 → 「+25.5%」（帯の外）
import { INCONSISTENCY_THRESHOLD } from 'cobra-core';

export interface BandPct {
  /** 帯の外か（|x| > threshold。元の値で判定） */
  out: boolean;
  /** 符号付きの表示（例「+25.3%」「−4%」「±0%」） */
  text: string;
}

const MAX_DIGITS = 2;

const roundAbs = (abs: number, digits: number) => {
  const k = 10 ** digits;
  return Math.round(abs * k) / k;
};

/** 符号付き % 表記（x = 0.1 → 「+10%」）。digits は小数点以下の桁数 */
export function signedPct(x: number, digits = 0): string {
  if (!Number.isFinite(x)) return '—';
  const abs = roundAbs(Math.abs(x) * 100, digits);
  const sign = abs === 0 ? '±' : x > 0 ? '+' : '−';
  return `${sign}${abs.toFixed(digits)}%`;
}

/**
 * 帯の判定と、それに矛盾しない表示。
 * x は比率（0.2526 = 25.26%）。threshold も比率（既定 0.25）。
 */
export function bandPct(x: number, threshold: number = INCONSISTENCY_THRESHOLD): BandPct {
  if (!Number.isFinite(x)) return { out: false, text: '—' };
  const out = Math.abs(x) > threshold;
  const limit = threshold * 100;
  if (!out) return { out, text: signedPct(x, 0) };
  for (let d = 0; d <= MAX_DIGITS; d++) {
    if (roundAbs(Math.abs(x) * 100, d) > limit) return { out, text: signedPct(x, d) };
  }
  // 小数 2 桁でも境界と同じに見える（例 0.250001）ときは「超」を付ける
  return { out, text: `${x > 0 ? '+' : '−'}${limit}%超` };
}
