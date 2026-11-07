// ΣCO と生産性の不整合（|α_j / α − 1| > 25%、cobra-core `projectGap` / `isInconsistent`）。
// 採用中・除外中の両方を対象に、表示中の版の α で判定する（構築時の `BuildOptions.excluded` と同じ範囲）。
// 文言は gap の符号で変える: gap > 0 = レベルの割に工数が多い、gap < 0 = レベルの割に工数が少ない。
// 自動では除外しない（IMPLEMENTATION_BRIEF §2.4）。ボタンで除外 / 除外のまま確認済みにする。
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { apiSend, qk } from '../../data/api';
import type { ProjectStat } from '../projects/calc';

export interface InconsistentItem {
  stat: ProjectStat;
  gap: number;
}

const REASON = 'ΣCO と生産性の不整合';

export function InconsistencyCard({ items, canEdit }: { items: InconsistentItem[]; canEdit: boolean }) {
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const adoptedOnes = items.filter((i) => i.stat.row.adopted);
  const exclude = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(ids.map((id) => apiSend('PUT', `/projects/${encodeURIComponent(id)}`, { adopted: false, excludedReason: REASON }))),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.projects }),
  });

  if (items.length === 0) {
    return (
      <div className="tile flex flex-col gap-2 px-[22px] py-5" style={{ animationDelay: '300ms' }}>
        <span className="text-[13px] font-bold">ΣCO と生産性の不整合 0 件</span>
        <p className="m-0 text-[12px] leading-[1.6] text-sub">すべての実績が、レベル値から予想される生産性の ±25% 以内に収まっています。</p>
      </div>
    );
  }

  const first = items[0]!;
  const calm = dismissed && adoptedOnes.length === 0;
  const nHigh = items.filter((i) => i.gap > 0).length;
  const mixed = nHigh > 0 && nHigh < items.length;
  const lead = mixed
    ? 'レベル値の割に工数が多い実績と少ない実績があります。'
    : nHigh > 0
      ? '要因レベルが低いのに工数が多い。'
      : '要因レベルが高いのに工数が少ない。';
  const tail = adoptedOnes.length === 0
    ? 'レベル値を付け直すか、除外のままにするか判断してください。'
    : nHigh === items.length
      ? 'レベル値を付け直すか、除外するか判断してください。'
      : '規模の計測漏れやレベル値を確認し、除外するか判断してください。';
  return (
    <div
      className={`tile flex flex-col gap-2 px-[22px] py-5 ${calm ? '' : '!border-coral-line !bg-coral-bg'}`}
      style={{ animationDelay: '300ms' }}
    >
      <span className={`text-[13px] font-bold ${calm ? 'text-text' : 'text-coral-title'}`}>
        ΣCO と生産性の不整合 {items.length} 件{calm ? ' (確認済み)' : ''}
      </span>
      {items.map(({ stat, gap }) => (
        <div key={stat.row.id} className={`flex items-center justify-between gap-2.5 text-[13px] ${calm ? 'text-sub' : 'text-coral-ink'}`}>
          <span className="min-w-0 truncate">
            <span className="n">{stat.row.id}</span> {stat.row.name}
            {mixed && <span className="ml-1.5 text-[11px] opacity-80">{gap > 0 ? '工数が多い' : '工数が少ない'}</span>}
            {!stat.row.adopted && <span className="ml-1.5 text-[11px] opacity-80">(除外中)</span>}
          </span>
          <span className="n shrink-0" title={`α_j / α − 1 = ${gap > 0 ? '+' : '−'}${Math.abs(gap * 100).toFixed(0)}%`}>
            ΣCO {stat.sco < 0 ? '−' : '+'}{Math.abs(Math.round(stat.sco * 100))}% ・ {stat.prod.toFixed(3)}
          </span>
        </div>
      ))}
      {!calm && (
        <p className="m-0 text-[12px] leading-[1.6] text-coral-ink">
          {lead}
          {tail}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Link
          to={`/model/projects?q=${encodeURIComponent(first.stat.row.id)}`}
          className={`btn inline-flex min-h-[34px] items-center rounded-full px-3 text-[12px] font-bold no-underline ${
            calm ? 'bg-raised text-text' : 'bg-coral text-bg'
          }`}
        >
          実績データで確認
        </Link>
        {!calm &&
          (adoptedOnes.length > 0 ? (
            <button
              type="button"
              disabled={!canEdit || exclude.isPending}
              onClick={() => exclude.mutate(adoptedOnes.map((i) => i.stat.row.id))}
              className="btn min-h-[34px] cursor-pointer rounded-full border border-coral-btn-line bg-transparent px-3 text-[12px] text-coral-ink disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exclude.isPending ? '除外中…' : adoptedOnes.length === items.length ? '除外する' : `採用中の ${adoptedOnes.length} 件を除外する`}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="btn min-h-[34px] cursor-pointer rounded-full border border-coral-btn-line bg-transparent px-3 text-[12px] text-coral-ink"
            >
              除外のままにする
            </button>
          ))}
      </div>
      {exclude.isError && <span role="alert" className="text-[11px] text-coral-ink">除外できませんでした: {exclude.error.message}</span>}
    </div>
  );
}
