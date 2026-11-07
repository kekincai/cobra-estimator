// ダッシュボードの「モデルの確認事項」の文言。gap = α_j / α − 1 の符号で向きが変わる。
//   gap > 0: ΣCO（要因レベル）が低いのに工数が多い
//   gap < 0: ΣCO が高いのに工数が少ない
import type { Inconsistency } from 'cobra-core';

const pct = (gap: number) => `${gap < 0 ? '−' : '+'}${Math.abs(Math.round(gap * 100))}%`;
const ids = (xs: Inconsistency[]) => xs.map((x) => `${x.projectId}（${pct(x.gap)}）`).join('、');

export function inconsistencyText(items: Inconsistency[]): string {
  const high = items.filter((x) => x.gap > 0);
  const low = items.filter((x) => x.gap < 0);
  const parts: string[] = [];
  if (high.length) parts.push(`${ids(high)}は ΣCO が低いのに工数が多く、実績生産性が食い違っています。`);
  if (low.length) parts.push(`${ids(low)}は ΣCO が高いのに工数が少なく、実績生産性が食い違っています。`);
  return parts.join('');
}
