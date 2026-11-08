// シード入力の解釈（全角数字も可）。不正な入力は 0 にせず、エラーとして返す。
import { parseNumberInput } from '../../ui/numberInput';
import { MAX_SEED } from './store';

export const SEED_ERROR = `シードは 0〜${MAX_SEED.toLocaleString('en-US')} の整数で入力してください。`;

export function parseSeed(text: string): { ok: true; value: number } | { ok: false; error: string } {
  const v = parseNumberInput(text, { allowPercent: false });
  if (v === null || !Number.isInteger(v) || v < 0 || v > MAX_SEED) return { ok: false, error: SEED_ERROR };
  return { ok: true, value: v };
}
