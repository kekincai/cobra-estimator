// 実績データ画面の軽い確定計算（期待値ベース）。数件×8 要因なので UI スレッドで十分。
// モンテカルロ・ブートストラップを伴う構築は cobra-client（Web Worker）側で行う。
import { expectedCO, INCONSISTENCY_THRESHOLD, type ModelSpec } from 'cobra-core';
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

/** α_j / α − 1 */
export const gapOf = (s: ProjectStat, alpha: number) => s.alphaJ / alpha - 1;
export const isInconsistent = (gap: number) => Math.abs(gap) > INCONSISTENCY_THRESHOLD;

/** 表示用: 要因の並び（no 順）にレベルを並べる */
export function levelArray(model: ModelSpec, levels: Record<string, number>): number[] {
  return [...model.factors].sort((a, b) => a.no - b.no).map((f) => levels[f.id] ?? 0);
}
