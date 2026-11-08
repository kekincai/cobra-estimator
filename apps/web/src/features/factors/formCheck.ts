// 要因フォームの検査（新規追加・詳細の編集で共用）。欄ごとのエラー文と、画面上の並び順を返す。
import { checkTri, TRI_KEYS, type TriKey } from './triangle';
import type { FieldIssue } from './api';

export interface ExpertDraft {
  name: string;
  best: string;
  likely: string;
  worst: string;
}

export interface NewFactorDraft {
  name: string;
  cat: string;
  def: string;
  levels: [string, string, string, string];
  kind: 'direct' | 'indirect';
  targetFactorId: string;
  experts: ExpertDraft[];
}

/** 欄の ID（DOM の id にも使う。`n-` を前に付ける） */
export const fid = {
  name: 'name',
  def: 'def',
  target: 'target',
  level: (i: number) => `level-${i}`,
  expertName: (i: number) => `exp-${i}-name`,
  tri: (i: number, k: TriKey) => `exp-${i}-${k}`,
  /** 行全体（並び順）のエラー */
  row: (i: number) => `exp-${i}-row`,
} as const;

export interface NewFactorCheck {
  /** 欄 ID → エラー文 */
  errors: Record<string, string>;
  /** 画面上の並び順で最初のエラー欄 */
  first: string | null;
  /** 名称が既存と重複している */
  duplicateOf: string | null;
  ok: boolean;
  /** 追加前チェックの項目（右側の一覧用） */
  checks: { key: string; label: string; state: 'ok' | 'error' | 'todo'; field: string }[];
}

/**
 * 新規要因フォームの検査。
 * existing は既存要因の名称、targetCount は「強める直接要因」の選択肢の数。
 */
export function checkNewFactor(f: NewFactorDraft, existing: readonly { id: string; name: string; no?: number }[], targetCount = 1): NewFactorCheck {
  const errors: Record<string, string> = {};
  const order: string[] = [];
  const put = (id: string, msg: string | null | undefined) => {
    order.push(id);
    if (msg) errors[id] = msg;
  };

  const name = f.name.trim();
  const dup = name ? existing.find((x) => x.name === name) : undefined;
  put(fid.name, !name ? '名称を入力してください' : dup ? `同じ名称の要因がすでにあります${dup.no ? ` (${String(dup.no).padStart(2, '0')})` : ''}。別の名称にしてください` : null);
  put(fid.def, f.def.trim() ? null : '定義を入力してください');
  f.levels.forEach((l, i) => put(fid.level(i), l.trim() ? null : `L${i} の内容を入力してください`));
  const indirect = f.kind === 'indirect';
  if (indirect) put(fid.target, targetCount === 0 ? '間接要因を付けられる直接要因がありません' : f.targetFactorId ? null : '強める直接要因を選んでください');

  const names = f.experts.map((x) => x.name.trim());
  f.experts.forEach((x, i) => {
    const nm = names[i]!;
    put(fid.expertName(i), !nm ? '担当者名を入力してください' : names.indexOf(nm) !== i ? '同じ担当者名がほかの行にあります' : null);
    const c = checkTri({ b: x.best, l: x.likely, w: x.worst }, nm || `${i + 1} 行目`);
    for (const k of TRI_KEYS) put(fid.tri(i, k), c.field[k]);
    put(fid.row(i), c.order);
  });
  if (f.experts.length === 0) put('experts', '担当者を 1 人以上入れてください');

  const first = order.find((id) => errors[id]) ?? null;
  const has = (pred: (id: string) => boolean) => Object.keys(errors).some(pred);
  const triIds = (id: string) => id.startsWith('exp-') || id === 'experts';
  const checks: NewFactorCheck['checks'] = [
    { key: 'name', label: dup ? '同じ名称の要因がすでにある' : '名称が入っている', state: dup ? 'error' : name ? 'ok' : 'todo', field: fid.name },
    { key: 'def', label: '定義が書かれている', state: errors[fid.def] ? 'todo' : 'ok', field: fid.def },
    { key: 'levels', label: 'レベル 0〜3 がすべて埋まっている', state: has((id) => id.startsWith('level-')) ? 'todo' : 'ok', field: order.find((id) => id.startsWith('level-') && errors[id]) ?? fid.level(0) },
    {
      key: 'tri',
      label: '三角分布が 最良 ≤ 最頻 ≤ 最悪',
      state: has(triIds) ? 'error' : 'ok',
      field: order.find((id) => triIds(id) && errors[id]) ?? fid.tri(0, 'b'),
    },
  ];
  if (indirect) checks.push({ key: 'target', label: '強める直接要因を選んでいる', state: errors[fid.target] ? (targetCount === 0 ? 'error' : 'todo') : 'ok', field: fid.target });

  return { errors, first, duplicateOf: dup ? dup.name : null, ok: first === null, checks };
}

/**
 * サーバーの 400 の issues（path）を新規フォームの欄 ID に対応させる。
 * name → name、definition → def、levels.2 → level-2、triangles.1.best → exp-1-b、triangles.1.expert → exp-1-name、targetFactorId → target。
 * 対応する欄がないものは null。
 */
export function fieldOfIssuePath(path: string): string | null {
  if (path === 'name') return fid.name;
  if (path === 'definition') return fid.def;
  if (path === 'targetFactorId') return fid.target;
  let m = /^levels\.(\d)$/.exec(path);
  if (m) return fid.level(Number(m[1]));
  m = /^triangles\.(\d+)\.(best|likely|worst|expert)$/.exec(path);
  if (m) {
    const i = Number(m[1]);
    const k = m[2]!;
    return k === 'expert' ? fid.expertName(i) : fid.tri(i, k === 'best' ? 'b' : k === 'likely' ? 'l' : 'w');
  }
  if (path === 'triangles' || /^triangles\.\d+$/.exec(path)) return fid.row(Number(path.split('.')[1] ?? 0));
  return null;
}

/** issues を欄 ID → 文へ。サーバーの文が英語（Zod の既定文）のときは日本語の一般文にする。 */
export function errorsFromIssues(issues: readonly FieldIssue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const id = fieldOfIssuePath(i.path);
    if (!id || out[id]) continue;
    out[id] = /[぀-ヿ㐀-鿿]/.test(i.message) ? i.message : 'この項目の値を確認してください';
  }
  return out;
}
