// 見積り・リスク画面の表示用の純関数（数値そのものは cobra-core の結果を使い、ここでは丸めと文言だけ扱う）。
// 丸め・差・符号付き表示は ui/format.ts の roundTo / displayDelta / fmtSigned を使う（全画面で共通）。
import { exceedPct, exceedWithP } from '../../ui/percentile';
import { displayDelta, fmt1, roundTo } from '../../ui/format';

/** 見積り画面の補助の 3 値（P 値 → 主表記は超過確率） */
export interface QuantileLabel {
  /** P 値（20 / 80 / 95） */
  p: 20 | 80 | 95;
  /** 業務の言葉 */
  tag: string;
  /** 「超過確率 80%・P20」 */
  label: string;
  /** 超過確率（%） */
  exceed: number;
}

export const ESTIMATE_QUANTILES: readonly QuantileLabel[] = (
  [
    [20, '楽観'],
    [80, '安全側'],
    [95, 'ほぼ上限'],
  ] as const
).map(([p, tag]) => ({ p, tag, label: exceedWithP(p), exceed: exceedPct(p) }));

/** 中央値の見出し */
export const MEDIAN_LABEL = '中央値（超過確率 50%）';

/** 「名目 25.2 + 上乗せ 18.7 = 43.9 人月」— 上乗せは表示値どうしの差なので式が必ず合う */
export function stackFormula(nominal: number, p50: number) {
  return { nominal: fmt1(nominal), overhead: fmt1(displayDelta(p50, nominal)), total: fmt1(p50) };
}

/** 各行を表示精度に丸めた値の合計（凡例に並ぶ数字を足した値） */
export const sumShown = (vs: readonly number[]) => roundTo(vs.reduce((s, v) => s + roundTo(v, 1), 0), 1);

/** ΣCO（0.743 → 「+74%」） */
export const fmtSco = (sco: number) => `+${Math.round(sco * 100)}%`;
