// レポート「05 前提と注意事項」の行数見積りと、2 ページに収めるための前提メモの切り詰め。
// 印刷（A4、本文幅 186mm − 箇条書きの字下げ 18px ≈ 181mm、9pt）で 1 行に全角 57 字ほど入る。安全側に 56 とする。
// 2 ページ目に入る箇条書きは実測で 12 行（$S/a2 の PDF 検証）。打ち手や結論の文の長さの揺れに 1 行の余裕を見て 11 行にする。

/** 1 行に入る全角文字数（印刷 9pt） */
export const MEMO_UNITS_PER_LINE = 56;
/** 「05 前提と注意事項」の箇条書きに使える行数（固定の注意事項を含む） */
export const NOTES_MAX_LINES = 11;

const HALF = 0.55;
/** 半角（ASCII・半角カナ）は 0.55 字、それ以外（漢字・かな・全角記号）は 1 字として数える */
const isHalf = (cp: number) => cp <= 0x7e || (cp >= 0xff61 && cp <= 0xff9f);

/** 文字列の幅（全角 1 字 = 1） */
export function textUnits(s: string): number {
  let u = 0;
  for (const ch of s) u += isHalf(ch.codePointAt(0)!) ? HALF : 1;
  return u;
}

/** 1 項目が何行になるか（空でも 1 行） */
export function estimateLines(s: string, unitsPerLine = MEMO_UNITS_PER_LINE): number {
  if (!(unitsPerLine > 0)) return 1;
  return Math.max(1, Math.ceil(textUnits(s) / unitsPerLine - 1e-9));
}

/** 幅 maxUnits に収まるよう末尾を切って「…」を付ける */
export function truncateUnits(s: string, maxUnits: number): string {
  if (textUnits(s) <= maxUnits) return s;
  const room = maxUnits - 1; // 「…」の分
  let u = 0;
  let out = '';
  for (const ch of s) {
    const w = isHalf(ch.codePointAt(0)!) ? HALF : 1;
    if (u + w > room) break;
    u += w;
    out += ch;
  }
  return `${out.trimEnd()}…`;
}

export interface MemoFit {
  /** 表示する項目（最後の 1 つは「…」で切られていることがある） */
  items: string[];
  /** 丸ごと載せなかった項目の数 */
  omitted: number;
  /** 途中で切った項目があるか */
  truncated: boolean;
}

/**
 * 前提メモの項目を maxLines 行に収める。全部入ればそのまま返す。
 * 入らないときは省略の注記に 1 行使うので、項目には maxLines − 1 行を使い、はみ出す項目は残りの行に入るだけ載せて「…」で切る。
 * 残りが 0 行なら、その項目から後ろは載せない。
 */
export function fitMemo(items: readonly string[], maxLines: number, unitsPerLine = MEMO_UNITS_PER_LINE): MemoFit {
  const total = items.reduce((s, it) => s + estimateLines(it, unitsPerLine), 0);
  if (total <= maxLines) return { items: [...items], omitted: 0, truncated: false };
  let left = Math.max(0, maxLines - 1);
  const out: string[] = [];
  let truncated = false;
  let i = 0;
  for (; i < items.length && left > 0; i++) {
    const it = items[i]!;
    const n = estimateLines(it, unitsPerLine);
    if (n <= left) {
      out.push(it);
      left -= n;
    } else {
      out.push(truncateUnits(it, left * unitsPerLine));
      truncated = true;
      left = 0;
      i++;
      break;
    }
  }
  return { items: out, omitted: items.length - i, truncated };
}

/** 注記の結び。画面では「見積り画面」をリンクにする */
export const MEMO_SEE_FULL = { before: '全文は', link: '見積り画面', after: 'を参照してください。' } as const;

/** 省略したときの注記の前半（何も省略していなければ null）。後ろに MEMO_SEE_FULL を続けて表示する */
export function memoOmittedNote(fit: MemoFit): string | null {
  if (fit.omitted > 0) return `前提メモの残り ${fit.omitted} 件は省略しました。`;
  if (fit.truncated) return '前提メモの一部を省略しました。';
  return null;
}

/** 注記の全文（行数の見積り・読み上げ用） */
export const memoNoteText = (lead: string) => `${lead}${MEMO_SEE_FULL.before}${MEMO_SEE_FULL.link}${MEMO_SEE_FULL.after}`;
