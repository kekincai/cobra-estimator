// リスク画面の表示用の純関数（丸め・差・文言）。超過確率そのものは cobra-core の exceedance / effortAtExceedance を使う。
import { parseNumberInput } from '../../ui/numberInput';
import { displayDelta, fmt1, fmtSigned, roundTo } from '../../ui/format';

/** 「超過確率を決める」の選択肢と速見表（超過確率 %） */
export const EXCEED_CHOICES = [5, 10, 20, 30, 50] as const;
export const EXCEED_TABLE = [50, 30, 20, 10, 5] as const;

/** 超過確率 q% に対応する P 値（超過確率 20% → P80） */
export const pOfExceed = (q: number) => Math.round(100 - q);

/** 補助の P 値表記（超過確率 20% → 「P80」） */
export const exceedAux = (q: number) => `P${pOfExceed(q)}`;

/** 0.432 → 43（%、四捨五入） */
export const pctRound = (p: number) => Math.round(p * 100);

/**
 * 「推定値 43.9 に対して +6.0 人月 (+14%) の余裕」の数値部分。
 * 人月の差は表示値どうしの差、% は比率（eff / m − 1）の四捨五入。
 */
export function marginParts(eff: number, median: number) {
  const diff = displayDelta(eff, median);
  const ratio = median > 0 ? Math.round((eff / median - 1) * 100) : 0;
  const pct = ratio === 0 ? '±0%' : `${ratio > 0 ? '+' : '−'}${Math.abs(ratio)}%`;
  return { median: fmt1(median), diff: fmtSigned(diff), pct };
}

/** 予算の判定（既存の文言） */
export const verdictOf = (p: number) => (p > 0.5 ? '推定値を下回る予算' : p > 0.3 ? 'やや楽観的' : p > 0.15 ? '妥当な余裕' : '十分な余裕');

export const BUDGET_ERROR = '予算は 0 より大きい数値（人月）で入力してください。';

/** 予算の入力文字列 → 値。全角数字・カンマ可。0 以下・不正は null */
export function parseBudget(text: string): number | null {
  const v = parseNumberInput(text);
  return v !== null && v > 0 ? v : null;
}

/**
 * 予算が保存済みの値から変わっているか。
 * 未保存（saved = null）のときは、最初に出した提案値から動かしたら「変更あり」。
 */
export function budgetChanged(budget: number, saved: number | null, initial: number): boolean {
  return saved === null ? budget !== initial : budget !== saved;
}

/** 寄与度の行に累積 % を出すか（寄与度順のときだけ意味がある） */
export const showCumulative = (sort: 'share' | 'no') => sort === 'share';

/** 打ち手の「超過確率 43% → 29%」 */
export function leverExceedText(base: number, after: number | null): string | null {
  if (after === null) return null;
  return `超過確率 ${pctRound(base)}% → ${pctRound(after)}%`;
}

/**
 * 打ち手の P50 の差。IMPLEMENTATION_BRIEF §6 の値（01 L3→L2 で −2.6 など）に合わせ、
 * 実際の差（変更後 − 変更前）を 0.1 単位に丸める。表示値どうしの差（41.4 − 43.9 = −2.5）ではない。
 * 例: 43.93 → 41.36 なら −2.6
 */
export const leverDelta = (lever: { p50: number; deltaP50: number }) => roundTo(lever.deltaP50, 1);
