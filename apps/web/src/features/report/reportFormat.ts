// レポート画面の表示用の純関数（世代の選択・タイトル・差分の書式・P 値表記）。
import type { GenerationRow } from '../../../shared/types';
import { roundTo } from '../../ui/format';
import { resolveGen } from '../estimate/genParam';
import { exceedPct } from '../../ui/percentile';

/**
 * レポート対象の世代を決める。`?gen=<label>`（estimate/genParam.ts の resolveGen で照合）があればその世代、
 * 無ければ estimate.reportGenerationId の世代、それも無ければ最新。
 * `missing` は指定された label が見つからず既定に戻したとき true。
 */
export function resolveReportGen(
  gens: readonly GenerationRow[],
  genLabel: string | null | undefined,
  reportGenerationId: string | null | undefined,
): { gen: GenerationRow | null; missing: boolean } {
  const fallback = gens.find((g) => g.id === reportGenerationId) ?? gens.at(-1) ?? null;
  if (!genLabel) return { gen: fallback, missing: false };
  const hit = resolveGen(gens, genLabel);
  return hit ? { gen: hit, missing: false } : { gen: fallback, missing: true };
}

/**
 * レポートの見出し。見積り名の前半（「顧客ポータル刷新 — 案B …」の「顧客ポータル刷新」）と世代の名前を組み合わせる。
 * 世代の名前が空なら見積り名をそのまま使う。
 */
export function reportTitle(estimateName: string, genName: string | null | undefined): { base: string; variant: string | null } {
  const name = estimateName.trim();
  const dash = estimateName.indexOf(' — ');
  const base = dash >= 0 ? estimateName.slice(0, dash).trim() : name;
  const variant = genName?.trim() || null;
  if (!variant) return { base: name, variant: null };
  return { base: base || variant, variant: base ? variant : null };
}

/** 予算の表示（45 → 「45」、45.5 → 「45.5」） */
export const fmtBudget = (v: number) => roundTo(v, 1).toFixed(1).replace(/\.0$/, '');

/** 超過確率（%）→ P 値。超過確率 20% → 80 */
export const pOfExceed = (exceedPercent: number) => Math.round(100 - exceedPercent);

/** 超過確率の表の行ラベル。20 → 「20%」, P 値の補助「P80」 */
export function exceedRow(exceedPercent: number): { main: string; p: string } {
  return { main: `${exceedPct(pOfExceed(exceedPercent))}%`, p: `P${pOfExceed(exceedPercent)}` };
}

/** 確率（0〜1）→ 整数 %。NaN は null */
export function pct0(p: number): number | null {
  return Number.isFinite(p) ? Math.round(p * 100) : null;
}
