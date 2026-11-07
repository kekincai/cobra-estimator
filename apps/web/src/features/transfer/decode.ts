// ファイルのバイト列 → 文字列。UTF-8（BOM 可）を優先し、読めなければ Shift-JIS。
// XML は宣言の encoding="…" を見る。

export type TextEncodingName = 'UTF-8' | 'Shift-JIS';

export interface DecodedText {
  text: string;
  encoding: TextEncodingName;
}

const isSjisLabel = (label: string) => /^(shift[_-]?jis|sjis|windows-31j|cp932|ms_kanji|x-sjis)$/i.test(label);

function decodeSjis(bytes: Uint8Array): DecodedText {
  return { text: new TextDecoder('shift_jis').decode(bytes), encoding: 'Shift-JIS' };
}

/** CSV / JSON 用: UTF-8 として厳密に読めなければ Shift-JIS とみなす */
export function decodeAuto(buf: ArrayBuffer | Uint8Array): DecodedText {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { text: text.replace(/^﻿/, ''), encoding: 'UTF-8' };
  } catch {
    return decodeSjis(bytes);
  }
}

/** XML 用: 宣言の encoding を優先（旧 Excel 版は Shift_JIS）。宣言が無ければ自動判定。 */
export function decodeXml(buf: ArrayBuffer | Uint8Array): DecodedText {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  // 宣言部分は ASCII なので latin1 で読んで探す
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 200));
  const declared = /<\?xml[^>]*encoding\s*=\s*["']([A-Za-z0-9_.-]+)["']/.exec(head)?.[1];
  if (declared && isSjisLabel(declared)) return decodeSjis(bytes);
  return decodeAuto(bytes);
}
