// 「新しい見積り」フォームの入力チェック（純関数）。数値は ui/numberInput で全角・各種マイナスを正規化して読む。
import { parseNumberInput } from '../../ui/numberInput';

export const NAME_MAX = 120;
/** 予算の上限（人月）。これを超える入力は桁の打ち間違いとみなす */
export const BUDGET_MAX = 100_000;

export type NewEstimateCheck =
  | { ok: true; value: { name: string; budget: number | null }; errors: Record<string, never> }
  | { ok: false; errors: { name?: string; budget?: string } };

export function validateNewEstimate(nameRaw: string, budgetRaw: string): NewEstimateCheck {
  const errors: { name?: string; budget?: string } = {};
  const name = nameRaw.replace(/\s+/g, ' ').trim();
  if (!name) errors.name = '見積りの名前を入力してください。';
  else if (name.length > NAME_MAX) errors.name = `名前は ${NAME_MAX} 文字以内にしてください。`;

  let budget: number | null = null;
  if (budgetRaw.trim() !== '') {
    const n = parseNumberInput(budgetRaw, { allowPercent: false });
    if (n == null) errors.budget = '予算は人月の数値で入力してください（例: 45 または 45.5）。';
    else if (n <= 0) errors.budget = '予算は 0 より大きい値にしてください。空欄なら予算なしで作成します。';
    else if (n > BUDGET_MAX) errors.budget = `予算は ${BUDGET_MAX.toLocaleString('en-US')} 人月以下にしてください。`;
    else budget = n;
  }
  if (errors.name || errors.budget) return { ok: false, errors };
  return { ok: true, value: { name, budget }, errors: {} };
}
