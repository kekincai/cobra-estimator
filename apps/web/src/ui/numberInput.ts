// 数値入力の正規化。日本語 IME の全角数字・全角記号・各種マイナス記号を半角に揃えてから解釈する。
// 解釈できない入力は null を返す（0 に丸めない）。

const MINUS = /[−‒–—―ー－﹣]/g; // − ‒ – — ― ー － ﹣

/** 全角英数字・記号を半角へ。マイナス類は '-'、全角スペースは半角スペース、桁区切り（,，、）は除去。 */
export function toHalfWidth(s: string): string {
  return String(s)
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ')
    .replace(MINUS, '-')
    .replace(/[,，、]/g, '')
    .trim();
}

export interface ParseNumberOptions {
  /** 負数を許すか（既定 false：負数は null） */
  allowNegative?: boolean;
  /** 末尾の % を許すか（既定 true。% は取り除くだけで値は変えない） */
  allowPercent?: boolean;
}

/** 文字列を数値へ。空・不正・（許可しない）負数は null。 */
export function parseNumberInput(raw: string, opts: ParseNumberOptions = {}): number | null {
  const { allowNegative = false, allowPercent = true } = opts;
  let s = toHalfWidth(raw);
  if (allowPercent) s = s.replace(/%$/, '').trim();
  if (s === '' || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const x = Number(s);
  if (!Number.isFinite(x)) return null;
  if (!allowNegative && x < 0) return null;
  return x;
}
