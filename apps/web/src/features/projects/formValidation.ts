// 実績の追加・編集フォームの入力検証（純粋関数）。
// 数値は parseNumberInput で解釈する（全角数字・全角マイナスを受け付け、解釈できなければ null。0 にはしない）。
// 単位換算は cobra-core の toFP / toMM。保存値は小数 2 桁に丸める（以前の ProjectEdit と同じ）。
import { isInconsistent, projectGap, toFP, toMM, type ModelSpec, type UnitFactors } from 'cobra-core';
import { parseNumberInput } from '../../ui/numberInput';

export type SizeUnit = 'FP' | 'KLOC' | 'screen';
export type EffUnit = 'MM' | 'hours';
export type FieldKey = 'name' | 'size' | 'effort' | 'group' | 'levels' | 'note';
export type FieldErrors = Partial<Record<FieldKey, string>>;

/** プロジェクト名の上限（一覧の表示崩れ防止。サーバー側も同じ値で検証） */
export const NAME_MAX = 100;

export interface FormInput {
  name: string;
  size: string;
  sizeUnit: SizeUnit;
  effort: string;
  effUnit: EffUnit;
  units: UnitFactors;
}

export interface FormResult {
  /** 換算後の値（FP / 人月）。解釈できなければ null */
  sizeFP: number | null;
  effMM: number | null;
  /** 保存する値（小数 2 桁）。null なら保存できない */
  storedSizeFP: number | null;
  storedEffMM: number | null;
  errors: FieldErrors;
}

export const round2 = (v: number) => Math.round(v * 100) / 100;

function numberField(raw: string, label: string, convert: (v: number) => number) {
  if (raw.trim() === '') return { value: null, stored: null, error: `${label}を入力してください` };
  const v = parseNumberInput(raw, { allowNegative: true, allowPercent: false });
  if (v === null) return { value: null, stored: null, error: `${label}は数値で入力してください` };
  if (v <= 0) return { value: convert(v), stored: null, error: `${label}は 0 より大きい値を入力してください` };
  const converted = convert(v);
  const stored = round2(converted);
  if (!(stored > 0)) return { value: converted, stored: null, error: `${label}が小さすぎます（換算後 0.01 未満）` };
  return { value: converted, stored, error: undefined };
}

export function validateProjectForm(f: FormInput): FormResult {
  const errors: FieldErrors = {};
  const name = f.name.trim();
  if (!name) errors.name = 'プロジェクト名を入力してください';
  else if (name.length > NAME_MAX) errors.name = `プロジェクト名は ${NAME_MAX} 文字以内にしてください（いま ${name.length} 文字）`;

  const size = numberField(f.size, '規模', (v) => toFP(v, f.sizeUnit, f.units));
  if (size.error) errors.size = size.error;
  const eff = numberField(f.effort, '工数', (v) => toMM(v, f.effUnit, f.units));
  if (eff.error) errors.effort = eff.error;

  return { sizeFP: size.value, effMM: eff.value, storedSizeFP: size.stored, storedEffMM: eff.stored, errors };
}

/** サーバーの Zod issues（path は "sizeFP" や "levels.f01"）をフォームの項目に割り当てる */
export function mapServerIssues(issues: { path: string; message: string }[] | undefined): FieldErrors {
  const out: FieldErrors = {};
  const map: Record<string, FieldKey> = { name: 'name', sizeFP: 'size', effortMM: 'effort', groupId: 'group', levels: 'levels', note: 'note' };
  const text: Record<FieldKey, string> = {
    name: `プロジェクト名を確認してください（1〜${NAME_MAX} 文字）`,
    size: '規模は 0 より大きい数値にしてください',
    effort: '工数は 0 より大きい数値にしてください',
    group: 'グループを選び直してください',
    levels: 'レベル値は L0〜L3 から選んでください',
    note: '備考を確認してください',
  };
  for (const i of issues ?? []) {
    const key = map[i.path.split('.')[0] ?? ''];
    if (key && !out[key]) out[key] = text[key];
  }
  return out;
}

export type GapStatus = 'pending' | 'ok' | 'out';

/**
 * 入力中の実績の gap = α_j / α − 1（cobra-core projectGap と同じ式）。
 * 規模・工数が未入力／不正、または α が無いときは null（「判定前」。0 = 整合 とはみなさない）。
 */
export function formGap(spec: ModelSpec, alpha: number | null, sizeFP: number | null, effMM: number | null, levels: Record<string, number>, id = 'new'): number | null {
  if (alpha === null || !(alpha > 0) || sizeFP === null || effMM === null || !(sizeFP > 0) || !(effMM > 0)) return null;
  const g = projectGap(spec, alpha, { id, sizeFP, effortMM: effMM, levels });
  return Number.isFinite(g) ? g : null;
}

/** 判定前 / 整合 / 不整合（cobra-core isInconsistent: |gap| > 25%） */
export const gapStatus = (gap: number | null): GapStatus => (gap === null ? 'pending' : isInconsistent(gap) ? 'out' : 'ok');
