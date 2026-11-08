// 三角分布（L3 の工数増加率）の入力の解釈と検査。画面の文字列（%）⇄ 保存値（割合）の変換もここで行う。
// ルール（IMPLEMENTATION_BRIEF.md §2.2、worker/routes/factors.ts と同じ）: 0 ≤ 最良 ≤ 最頻 ≤ 最悪。負の値は不可。
import { parseNumberInput } from '../../ui/numberInput';

export type TriKey = 'b' | 'l' | 'w';
export const TRI_KEYS: readonly TriKey[] = ['b', 'l', 'w'];
export const TRI_LABEL: Record<TriKey, string> = { b: '最良', l: '最頻', w: '最悪' };

/** 保存値（割合 0.26）→ 表示用の %（26）。0.1% 単位に丸める。 */
export const toPct = (v: number) => Math.round(v * 1000) / 10;

/**
 * 入力文字列（%）→ 数値（%）。全角数字・全角マイナスは半角に揃える。
 * 空・数値でない・負の値は null（0 には置き換えない）。
 */
export const fromPct = (s: string): number | null => parseNumberInput(s, { allowNegative: false });

export type PctProblem = 'empty' | 'nan' | 'negative';

/** 1 つの入力欄の問題（なければ null） */
export function pctProblem(s: string): PctProblem | null {
  if (String(s).trim() === '') return 'empty';
  if (fromPct(s) !== null) return null;
  return parseNumberInput(s, { allowNegative: true }) !== null ? 'negative' : 'nan';
}

export const PCT_MESSAGE: Record<PctProblem, string> = {
  empty: '値を入力してください',
  nan: '数値で入力してください (例: 25)',
  negative: '0 以上の値を入力してください',
};

export interface TriText {
  b: string;
  l: string;
  w: string;
}

export interface TriCheck {
  /** 解釈できた値（%）。解釈できない欄は null */
  nums: [number | null, number | null, number | null];
  /** 欄ごとのエラー文 */
  field: Partial<Record<TriKey, string>>;
  /** 並び順のエラー文（各欄が数値として正しいときだけ） */
  order: string | null;
  /** 保存してよいか */
  ok: boolean;
}

/** 担当者 1 人分の三角分布を検査する。who はエラー文に入れる担当者名。 */
export function checkTri(t: TriText, who?: string): TriCheck {
  const nums = TRI_KEYS.map((k) => fromPct(t[k])) as TriCheck['nums'];
  const field: TriCheck['field'] = {};
  TRI_KEYS.forEach((k) => {
    const p = pctProblem(t[k]);
    if (p) field[k] = PCT_MESSAGE[p];
  });
  let order: string | null = null;
  const [b, l, w] = nums;
  if (b !== null && l !== null && w !== null) {
    const head = who ? `${who}: ` : '';
    if (b > l) order = `${head}最良 (${b}) が 最頻 (${l}) より大きくなっています。最良 ≤ 最頻 ≤ 最悪 の順にしてください。`;
    else if (l > w) order = `${head}最頻 (${l}) が 最悪 (${w}) より大きくなっています。最良 ≤ 最頻 ≤ 最悪 の順にしてください。`;
  }
  return { nums, field, order, ok: Object.keys(field).length === 0 && order === null };
}

/** 検査済みの三角分布の数値（%）。ok でなければ null */
export function triValues(c: TriCheck): [number, number, number] | null {
  return c.ok ? (c.nums as [number, number, number]) : null;
}

/**
 * 入力文字列（%）→ 保存値（割合）。
 * 入力が元の値の表示（toPct）のまま変わっていなければ、元の値をそのまま返す（0.1% 未満の桁を丸めて書き換えないため）。
 */
export function ratioOf(s: string, original?: number): number | null {
  if (original !== undefined && Number.isFinite(original) && s === String(toPct(original))) return original;
  const v = fromPct(s);
  return v === null ? null : v / 100;
}

/**
 * 担当者ごとの三角分布（%）の平均。表示用に 0.1% 単位へ丸める。
 * 1 人でも解釈できない値があれば null。
 */
export function averageTri(ts: readonly (readonly [number, number, number])[]): [number, number, number] | null {
  if (!ts.length) return null;
  const avg = (i: number) => Math.round((ts.reduce((s, t) => s + t[i]!, 0) / ts.length) * 10) / 10;
  return [avg(0), avg(1), avg(2)];
}

/** 倍率の表示（×1.15、×1.225）。小数 2〜3 桁、末尾の 0 は 2 桁まで落とす。 */
export function fmtMultiplier(m: number): string {
  if (!Number.isFinite(m)) return '—';
  // 1.225 のような 2 進で表せない値を toFixed(3) で正しく丸めるため、1e-9 を足してから丸める
  const s = (Math.round(m * 1000 + 1e-9) / 1000).toFixed(3);
  return `×${s.endsWith('0') ? s.slice(0, -1) : s}`;
}
