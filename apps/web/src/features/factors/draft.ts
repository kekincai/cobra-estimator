// 変動要因画面の編集中の下書き（要因ごと）。保存値 ⇄ 入力文字列、未保存の判定、検査、送信内容の組み立て。
import type { FactorRow } from '../../../shared/types';
import { fid } from './formCheck';
import { averageTri, checkTri, ratioOf, toPct, TRI_KEYS, triValues } from './triangle';

export interface TriDraft {
  expert: string;
  b: string;
  l: string;
  w: string;
}
export interface FactorDraft {
  definition: string;
  levels: [string, string, string, string];
  tris: TriDraft[];
  targetFactorId: string | null;
}

export const AVERAGE = '平均';

type Row = Pick<FactorRow, 'definition' | 'levels' | 'triangles' | 'targetFactorId'>;

export const draftFromRow = (f: Row): FactorDraft => ({
  definition: f.definition,
  levels: [...f.levels],
  tris: f.triangles.map((t) => ({ expert: t.expert, b: String(toPct(t.best)), l: String(toPct(t.likely)), w: String(toPct(t.worst)) })),
  targetFactorId: f.targetFactorId,
});

/** 下書きが保存値から変わっているか（入力して元に戻した場合は変わっていない扱い） */
export function isDraftDirty(d: FactorDraft | undefined, f: Row): boolean {
  if (!d) return false;
  const o = draftFromRow(f);
  return (
    d.definition !== o.definition ||
    d.levels.some((l, i) => l !== o.levels[i]) ||
    (d.targetFactorId ?? null) !== (o.targetFactorId ?? null) ||
    d.tris.length !== o.tris.length ||
    d.tris.some((t, i) => TRI_KEYS.some((k) => t[k] !== o.tris[i]![k]) || t.expert !== o.tris[i]!.expert)
  );
}

/** 担当者 1 人分の三角分布（%）。不正な入力なら null */
export const triNums = (t: TriDraft): [number, number, number] | null => triValues(checkTri(t));

/** 担当者 e の三角分布（%）。'平均' または該当者がいなければ全員の平均。不正な入力があれば null */
export function triOf(d: FactorDraft, expert: string): [number, number, number] | null {
  const own = d.tris.find((t) => t.expert === expert);
  if (own && expert !== AVERAGE) return triNums(own);
  const ns = d.tris.map(triNums);
  if (ns.some((t) => t === null)) return null;
  return averageTri(ns as [number, number, number][]) ?? [0, 0, 0];
}

/** 詳細の編集欄の ID（DOM の id は `d-` を前に付ける） */
export const dfid = { def: fid.def, level: fid.level, target: fid.target, tri: fid.tri, row: fid.row } as const;

export interface DraftCheck {
  errors: Record<string, string>;
  first: string | null;
  ok: boolean;
}

/** 詳細の下書きを検査する（新規追加と同じ規則） */
export function checkDraft(d: FactorDraft, indirect: boolean): DraftCheck {
  const errors: Record<string, string> = {};
  const order: string[] = [];
  const put = (id: string, msg: string | null | undefined) => {
    order.push(id);
    if (msg) errors[id] = msg;
  };
  put(dfid.def, d.definition.trim() ? null : '定義を入力してください');
  d.levels.forEach((l, i) => put(dfid.level(i), l.trim() ? null : `L${i} の内容を入力してください`));
  if (indirect) put(dfid.target, d.targetFactorId ? null : '強める直接要因を選んでください');
  d.tris.forEach((t, i) => {
    const c = checkTri(t, t.expert);
    for (const k of TRI_KEYS) put(dfid.tri(i, k), c.field[k]);
    put(dfid.row(i), c.order);
  });
  const first = order.find((id) => errors[id]) ?? null;
  return { errors, first, ok: first === null };
}

/**
 * 下書き → PUT の本文。三角分布は「入力を変えていない値は元の値のまま」送る（0.1% 未満の桁を丸めない）。
 * 検査に通らない下書きは null。
 */
export function patchFromDraft(d: FactorDraft, f: Row, indirect: boolean) {
  if (!checkDraft(d, indirect).ok) return null;
  const triangles = d.tris.map((t, i) => {
    const o = f.triangles[i]?.expert === t.expert ? f.triangles[i] : undefined;
    return {
      expert: t.expert,
      best: ratioOf(t.b, o?.best)!,
      likely: ratioOf(t.l, o?.likely)!,
      worst: ratioOf(t.w, o?.worst)!,
    };
  });
  return {
    definition: d.definition,
    levels: d.levels,
    triangles,
    ...(indirect ? { targetFactorId: d.targetFactorId } : {}),
  };
}
