// 構築の 3 段の区間と、全体進捗から「いまの段」を求める（読み上げを段の切り替えだけにするため）。
import type { BuildStage } from 'cobra-core';

/** 全体の進捗に占める各段の区間（設計稿: α 推定 0–35%、モンテカルロ 35–80%、交差検証 80–100%） */
export const STAGE_SPANS: Record<BuildStage, [number, number]> = { alpha: [0, 0.35], montecarlo: [0.35, 0.8], loo: [0.8, 1] };

const ORDER: BuildStage[] = ['alpha', 'montecarlo', 'loo'];

/** 全体進捗 p（0〜1）がどの段か。1 以上は最後の段 */
export function stageAt(p: number): BuildStage {
  const x = Number.isFinite(p) ? p : 0;
  for (const s of ORDER) if (x < STAGE_SPANS[s][1]) return s;
  return 'loo';
}
