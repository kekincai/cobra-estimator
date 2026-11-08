// 構築にかかる時間の目安（実行前に表示する）。
// 計算量は cobra-core buildModel のブートストラップ（runs × 件数の再標本）と runs 件のソートが支配的。
// 係数は seed（11 件）で 10,000 回 ≈ 6 ms、100,000 回 ≈ 50 ms の実測（audit-theming-perf）に合わせた控えめな値。
// 画面上は進捗を MIN_VISIBLE_MS かけて見せるので、待ち時間は「計算時間」と「表示の最短時間」の大きい方。

/** 0→100% を表示するのに最低限かける時間（useBuildRunner と共有） */
export const MIN_VISIBLE_MS = 1800;
/** Worker の起動・メッセージ往復 */
const OVERHEAD_MS = 150;
/** 再標本 1 件あたり */
const PER_SAMPLE_MS = 0.00006;
/** ソート・集計（1 回あたり） */
const PER_RUN_MS = 0.0003;

/** 計算そのものの見込み（ms） */
export function estimateComputeMs(nProjects: number, runs: number): number {
  const n = Math.max(0, Math.floor(nProjects) || 0);
  const r = Math.max(0, Math.floor(runs) || 0);
  return OVERHEAD_MS + r * n * PER_SAMPLE_MS + r * PER_RUN_MS;
}

/** 画面で待つ時間の見込み（ms）。reduced-motion では最短表示時間を使わない */
export function estimateWaitMs(nProjects: number, runs: number, reducedMotion = false): number {
  const c = estimateComputeMs(nProjects, runs);
  return reducedMotion ? c : Math.max(c, MIN_VISIBLE_MS);
}

/** 「1 秒未満」「約 2 秒」「約 1 分」 */
export function formatWait(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return '1 秒未満';
  if (ms < 60_000) return `約 ${Math.ceil(ms / 1000)} 秒`;
  return `約 ${Math.ceil(ms / 60_000)} 分`;
}

/** 実測の表示（「0.18 s」「2.4 s」） */
export function formatElapsed(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return '—';
  return `${(ms / 1000).toFixed(ms < 1000 ? 2 : 1)} s`;
}
