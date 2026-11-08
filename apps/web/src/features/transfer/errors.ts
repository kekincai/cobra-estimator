// 取り込みエラーを「どこが・なぜ・どう直すか」の日本語にする。
// - 放り込まれたファイルの種類を中身から推定し、タブ違いなら行き先を案内する
// - JSON.parse の英語メッセージは出さず、行・列だけを伝える
// - zod の内部パス（factors.0.levels）は「要因 1 件目（No.1「要件の安定性」）のレベル定義」に直す
import type { z } from 'zod';

export type FileKind = 'json' | 'xml' | 'csv' | 'unknown';
export type TabKey = 'json' | 'csv';

/** 失敗時の結果。hint は「直し方」の 1 行、suggestTab は開き直すべきタブ。 */
export interface ImportFailure {
  ok: false;
  errors: string[];
  hint?: string;
  suggestTab?: TabKey;
}

const stripBom = (s: string) => s.replace(/^﻿/, '');

/** 中身（先頭）と拡張子からファイルの種類を推定する。中身を優先する。 */
export function sniffFileKind(fileName: string, text: string): FileKind {
  const head = stripBom(text).trimStart();
  if (head.startsWith('{') || head.startsWith('[')) return 'json';
  if (head.startsWith('<')) return 'xml';
  const lines = head.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length >= 1 && /[,\t]/.test(lines[0]!)) return 'csv';
  const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase();
  if (ext === 'json') return 'json';
  if (ext === 'xml') return 'xml';
  if (ext === 'csv' || ext === 'tsv') return 'csv';
  return 'unknown';
}

const firstLine = (text: string, max = 24) => {
  const l = stripBom(text).trimStart().split(/\r?\n/)[0] ?? '';
  return l.length > max ? `${l.slice(0, max)}…` : l;
};

/** JSON タブに CSV / 不明なファイルが来たとき */
export function wrongFileForJson(fileName: string, text: string): ImportFailure | null {
  const kind = sniffFileKind(fileName, text);
  if (kind === 'csv')
    return {
      ok: false,
      errors: [`CSV ファイルのようです（1 行目が「${firstLine(text)}」）。このタブではモデルパラメータの JSON / 旧 XML だけを取り込めます。`],
      hint: '実績データの CSV は「CSV で実績を取り込む」タブで取り込んでください。',
      suggestTab: 'csv',
    };
  if (kind === 'unknown')
    return {
      ok: false,
      errors: ['JSON でも XML でもないファイルです。'],
      hint: 'Estima の「JSON を書き出す」で作ったファイルか、旧 Excel 版の XML (<CoBRAModel>) を選んでください。',
    };
  return null;
}

/** CSV タブに JSON / XML が来たとき */
export function wrongFileForCsv(fileName: string, text: string): ImportFailure | null {
  const kind = sniffFileKind(fileName, text);
  if (kind === 'json' || kind === 'xml')
    return {
      ok: false,
      errors: [`${kind === 'json' ? 'JSON' : 'XML'} ファイルのようです。このタブでは実績データの CSV だけを取り込めます。`],
      hint: 'モデルパラメータの JSON / 旧 XML は「JSON を取り込む」タブで取り込んでください。',
      suggestTab: 'json',
    };
  return null;
}

/** 0 起点の文字位置 → 1 起点の行・列 */
export function lineColAt(text: string, pos: number): { line: number; col: number } {
  const before = text.slice(0, Math.max(0, Math.min(pos, text.length)));
  const lines = before.split('\n');
  return { line: lines.length, col: (lines.at(-1)?.length ?? 0) + 1 };
}

/** JSON.parse の例外 → 日本語（英語の原文は出さない） */
export function describeJsonSyntaxError(e: unknown, text: string): string {
  const msg = e instanceof Error ? e.message : String(e);
  const lc = /line (\d+) column (\d+)/i.exec(msg);
  let where = '';
  if (lc) where = `${lc[1]} 行目 ${lc[2]} 文字目付近`;
  else {
    const pos = /position (\d+)/i.exec(msg);
    if (pos) {
      const { line, col } = lineColAt(text, Number(pos[1]));
      where = `${line} 行目 ${col} 文字目付近`;
    } else if (/end of (json )?(input|data)/i.test(msg)) where = 'ファイルの最後（途中で終わっています）';
  }
  return `JSON として読めません — 形式が壊れています${where ? `（${where}）` : ''}。`;
}

export const SYNTAX_HINT = 'かっこ { } [ ] の閉じ忘れ、項目の間のカンマ、文字列の " を確かめてください。書き出し直したファイルを選ぶのが確実です。';
export const NOT_ESTIMA_HINT = 'Estima の「JSON を書き出す」で作ったファイルか、旧 Excel 版の XML (<CoBRAModel>) を選んでください。';
export const VALUE_HINT = 'ファイルをテキストエディタで開き、上の箇所を直してから選び直してください（件目は 1 から数えます）。書き出し元で直して書き出し直すのが確実です。';

// ---- zod の issue → 日本語 ----

const FIELD: Record<string, string> = {
  no: '要因番号',
  name: '名前',
  category: 'カテゴリ',
  kind: '種類',
  origin: '由来',
  targetNo: '強める要因の番号',
  definition: '定義文',
  levels: 'レベル定義',
  factorNo: '要因番号',
  expert: '専門家名',
  l3: '三角分布の値',
  indirectNo: '間接要因の番号',
  directNo: '直接要因の番号',
  k: '係数 k',
  id: 'ID',
  sizeFP: '規模',
  effortMM: '工数',
  groupId: 'グループ',
  note: '備考',
  version: '版',
  alpha: 'α',
  ci95: '95% 信頼区間',
  projectId: 'プロジェクト ID',
  reason: '理由',
  mmre: 'MMRE',
  pred25: 'PRED(25)',
  loo: '交差検証の誤差',
  mre: '誤差',
  exportedAt: '書き出し日時',
  exportedBy: '作成者',
};

const SECTION: Record<string, string> = {
  model: 'モデル情報',
  groups: 'グループ',
  excluded: 'PJ 除外の情報',
  factors: '要因',
  triangles: '三角分布',
  relations: '要因間の関係',
  accuracy: '見積り精度情報',
  projects: '実績',
};

const TRI_POINT = ['最良', '最頻', '最悪'];

type Raw = Record<string, unknown> | null | undefined;
const at = (raw: unknown, key: string | number): unknown => (raw && typeof raw === 'object' ? (raw as Record<string | number, unknown>)[key] : undefined);
const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : '');
/** 名前など文字列であるべきもの（数値が入っていれば出さない） */
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** issue の path → 「要因 1 件目（No.1「要件の安定性」）のレベル定義 L2」のような場所の説明 */
export function describePath(path: PropertyKey[], raw: Raw): string {
  if (!path.length) return '';
  const [sec, idx, ...rest] = path;
  const secName = typeof sec === 'string' ? (SECTION[sec] ?? FIELD[sec] ?? String(sec)) : String(sec);
  if (typeof idx !== 'number') {
    // model.alpha / accuracy.mmre / format など
    if (idx === undefined) return secName;
    return `${secName}の${fieldPath([idx, ...rest], sec as string)}`;
  }
  const item = at(at(raw, sec as string), idx);
  let who = `${secName} ${idx + 1} 件目`;
  if (sec === 'factors') {
    const no = s(at(item, 'no'));
    const name = str(at(item, 'name'));
    const label = [no && `No.${no}`, name && `「${name}」`].filter(Boolean).join(' ');
    if (label) who += `（${label}）`;
  } else if (sec === 'triangles') {
    const no = s(at(item, 'factorNo'));
    const ex = str(at(item, 'expert'));
    const label = [no && `要因 No.${no}`, ex].filter(Boolean).join('・');
    if (label) who += `（${label}）`;
  } else if (sec === 'projects') {
    const id = s(at(item, 'id'));
    if (id) who += `（${id}）`;
  } else if (sec === 'relations') {
    const a = s(at(item, 'indirectNo'));
    const b = s(at(item, 'directNo'));
    if (a && b) who += `（${a} → ${b}）`;
  }
  return rest.length ? `${who}の${fieldPath(rest, sec as string)}` : who;
}

function fieldPath(rest: PropertyKey[], sec: string): string {
  const [f, j] = rest;
  const name = typeof f === 'string' ? (FIELD[f] ?? f) : String(f);
  if (typeof j === 'number') {
    if (f === 'levels' && sec === 'factors') return `L${j} の定義文`;
    if (f === 'levels' && sec === 'projects') return `${j + 1} 番目の要因のレベル値`;
    if (f === 'l3') return `${TRI_POINT[j] ?? `${j + 1} 番目`}値`;
    if (f === 'ci95') return `95% 信頼区間の${j === 0 ? '下限' : '上限'}`;
    return `${name} ${j + 1} 番目`;
  }
  if (f === 'levels' && sec === 'projects') return 'レベル値';
  return name;
}

const hasJapanese = (t: string) => /[぀-ヿ㐀-鿿]/.test(t);
const TYPE_JA: Record<string, string> = {
  string: '文字列',
  number: '数値',
  int: '整数',
  boolean: 'true / false',
  array: '配列 [ … ]',
  object: 'オブジェクト { … }',
  tuple: '配列 [ … ]',
};

/** issue のメッセージ部分（日本語のものはそのまま、zod 既定の英語は種類ごとに訳す） */
export function describeIssueMessage(issue: z.core.$ZodIssue): string {
  if (issue.message && hasJapanese(issue.message)) return issue.message;
  const i = issue as z.core.$ZodIssue & { expected?: string; origin?: string; minimum?: number | bigint; maximum?: number | bigint; values?: unknown[]; input?: unknown };
  switch (issue.code) {
    case 'invalid_type': {
      const received = /received (\w+)/.exec(issue.message)?.[1];
      if (received === 'undefined' || (i.input === undefined && !received)) return 'ありません。追加してください';
      const exp = TYPE_JA[i.expected ?? ''] ?? i.expected ?? '正しい形';
      return `${exp}で指定してください`;
    }
    case 'too_small':
      if (i.origin === 'array') return `${String(i.minimum)} 件以上必要です`;
      if (i.origin === 'string') return Number(i.minimum) <= 1 ? '空です。入力してください' : `${String(i.minimum)} 文字以上にしてください`;
      return `${String(i.minimum)} 以上にしてください`;
    case 'too_big':
      if (i.origin === 'array') return `${String(i.maximum)} 件までです`;
      if (i.origin === 'string') return `${String(i.maximum)} 文字までです`;
      return `${String(i.maximum)} 以下にしてください`;
    case 'invalid_value':
      return `${(i.values ?? []).map((v) => JSON.stringify(v)).join(' / ')} のいずれかを指定してください`;
    case 'invalid_format':
      return '書式が正しくありません';
    case 'unrecognized_keys':
      return '不明な項目があります';
    default:
      return '値が正しくありません';
  }
}

/** issue 1 件 → 「場所: 内容」 */
export function describeIssue(issue: z.core.$ZodIssue, raw: unknown): string {
  const where = describePath(issue.path, raw as Raw);
  const msg = describeIssueMessage(issue);
  return where ? `${where}: ${msg}` : msg;
}

/** 検証エラーの一覧（最大 max 件 + 「ほか N 件」） */
export function describeIssues(issues: readonly z.core.$ZodIssue[], raw: unknown, max = 8): string[] {
  const out = issues.slice(0, max).map((i) => describeIssue(i, raw));
  if (issues.length > max) out.push(`ほか ${issues.length - max} 件`);
  return out;
}

/** DOMParser の英語エラー → 日本語（行・列だけ残す） */
export function describeXmlSyntaxError(parserText: string): string {
  const m = /line (\d+)(?: at)? column (\d+)/i.exec(parserText) ?? /(\d+):(\d+)/.exec(parserText);
  return `XML として読めません — 形式が壊れています${m ? `（${m[1]} 行目 ${m[2]} 文字目付近）` : ''}。タグの閉じ忘れや、< & などの記号を確かめてください。`;
}
