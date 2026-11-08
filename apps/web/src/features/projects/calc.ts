// 実績データ画面の軽い確定計算（期待値ベース）。数件×8 要因なので UI スレッドで十分。
// モンテカルロ・ブートストラップを伴う構築は cobra-client（Web Worker）側で行う。
import { expectedCO, isInconsistent, type ModelSpec } from 'cobra-core';
import type { ProjectRow } from '../../../shared/types';

export interface ProjectStat {
  row: ProjectRow;
  sco: number;
  /** 実績の生産性 = 工数 / 規模（人月/FP） */
  prod: number;
  /** α_j = 工数 / (規模 × (1 + ΣCO)) */
  alphaJ: number;
}

export function projectStats(model: ModelSpec, rows: ProjectRow[]): ProjectStat[] {
  return rows.map((row) => {
    const sco = expectedCO(model, row.levels).sco;
    return { row, sco, prod: row.effortMM / row.sizeFP, alphaJ: row.effortMM / (row.sizeFP * (1 + sco)) };
  });
}

/** 採用分の α = mean(α_j)。0 件なら null */
export function alphaOf(stats: ProjectStat[]): number | null {
  const used = stats.filter((s) => s.row.adopted);
  return used.length ? used.reduce((a, s) => a + s.alphaJ, 0) / used.length : null;
}

/** α_j / α − 1（cobra-core `projectGap` と同じ式。ΣCO を計算済みの stat から求める） */
export const gapOf = (s: ProjectStat, alpha: number) => s.alphaJ / alpha - 1;
/** 判定は cobra-core に一本化（|gap| > 25%） */
export { isInconsistent };

/** 表示用: 要因の並び（no 順）にレベルを並べる */
export function levelArray(model: ModelSpec, levels: Record<string, number>): number[] {
  return [...model.factors].sort((a, b) => a.no - b.no).map((f) => levels[f.id] ?? 0);
}

/** 表示用: 要因の並び（no 順）に、番号・名前・レベル・定義文をそろえる（一覧のチップのツールチップ・読み上げ用） */
export function factorLevels(model: ModelSpec, levels: Record<string, number>) {
  return [...model.factors]
    .sort((a, b) => a.no - b.no)
    .map((f) => {
      const level = levels[f.id] ?? 0;
      return { no: f.no, name: f.name, level, def: f.levels[Math.max(0, Math.min(3, level))] };
    });
}
