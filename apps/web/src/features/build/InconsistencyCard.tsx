// ΣCO と生産性の不整合（|α_j / α − 1| > 25%、cobra-core `projectGap` / `isInconsistent`）。
// 採用中・除外中の両方を対象に、表示中の版の α で判定する（構築時の `BuildOptions.excluded` と同じ範囲）。
// 文言は gap の符号で変える: gap > 0 = レベルの割に工数が多い、gap < 0 = レベルの割に工数が少ない。
// 自動では除外しない（IMPLEMENTATION_BRIEF §2.4）。ボタンで除外 / 除外のまま確認済みにする。
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { apiSend, qk } from '../../data/api';
import { describeApiError } from '../../ui/apiError';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { bandPct } from '../projects/bandFormat';
import type { ProjectStat } from '../projects/calc';

export interface InconsistentItem {
  stat: ProjectStat;
  gap: number;
}

const REASON = 'ΣCO と生産性の不整合';

/** 交差検証（LOO）の「帯の外」との違いを一行で */
const DEFINITION = 'レベル値から予想される生産性と、実績の生産性が ±25% を超えて食い違う実績です（交差検証の「帯の外」は、1 件抜きで推定したときの誤差で、別の指標です）。';

interface Props {
  items: InconsistentItem[];
  canEdit: boolean;
  /** 判定に使った版（表示中の版）。null = 今回の未保存の結果 */
  basis: { version: number | null; alpha: number; isActive: boolean; activeVersion: number | null };
}

export function InconsistencyCard({ items, canEdit, basis }: Props) {
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const adoptedOnes = items.filter((i) => i.stat.row.adopted);
  const exclude = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(ids.map((id) => apiSend('PUT', `/projects/${encodeURIComponent(id)}`, { adopted: false, excludedReason: REASON }))),
    onSuccess: () => setConfirming(false),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.projects }),
  });
  const basisLabel = basis.version === null ? '今回の結果' : `v${basis.version}`;

  if (items.length === 0) {
    return (
      <div className="tile flex flex-col gap-2 px-[22px] py-5" style={{ animationDelay: '300ms' }}>
        <h2 className="m-0 text-[13px] font-bold">ΣCO と生産性の不整合 0 件</h2>
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
      <h2 className={`m-0 text-[13px] font-bold ${calm ? 'text-text' : 'text-coral-title'}`}>
        ΣCO と生産性の不整合 {items.length} 件{calm ? ' (確認済み)' : ''}
      </h2>
      <p className={`m-0 text-[11.5px] leading-[1.6] ${calm ? 'text-sub' : 'text-coral-ink'}`}>
        {DEFINITION}
        {basis.version !== null && !basis.isActive ? ` 判定は表示中の v${basis.version} の α (${basis.alpha.toFixed(4)}) によります。` : ''}
      </p>
      {items.map(({ stat, gap }) => (
        <div key={stat.row.id} className={`flex flex-wrap items-baseline justify-between gap-x-2.5 gap-y-0.5 text-[13px] ${calm ? 'text-sub' : 'text-coral-ink'}`}>
          <span className="min-w-0 [overflow-wrap:anywhere]">
            <span className="n">{stat.row.id}</span> {stat.row.name}
            {mixed && <span className="ml-1.5 text-[11px]">{gap > 0 ? '工数が多い' : '工数が少ない'}</span>}
            {!stat.row.adopted && <span className="ml-1.5 text-[11px]">(除外中)</span>}
          </span>
          <span className="n shrink-0 text-[12px]">
            予想比 {bandPct(gap).text} ・ ΣCO {stat.sco < 0 ? '−' : '+'}{Math.abs(Math.round(stat.sco * 100))}% ・ 生産性 {stat.prod.toFixed(4)} 人月/FP
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
              onClick={() => {
                exclude.reset();
                setConfirming(true);
              }}
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
      <ConfirmDialog
        open={confirming}
        title={`採用中の ${adoptedOnes.length} 件を除外しますか？`}
        confirmLabel="除外する"
        danger
        busy={exclude.isPending}
        error={exclude.isError ? `除外できませんでした。${describeApiError(exclude.error)}` : null}
        onConfirm={() => exclude.mutate(adoptedOnes.map((i) => i.stat.row.id))}
        onCancel={() => setConfirming(false)}
      >
        <p className="m-0">
          {adoptedOnes.map((i) => `${i.stat.row.id} ${i.stat.row.name}`).join('、')} を実績データで「除外」にします。
          次のモデル構築から α の計算に使われなくなります。実績データの画面でいつでも採用に戻せます。
        </p>
        {basis.version !== null && !basis.isActive && (
          <p className="m-0 mt-2 text-warn-ink">
            この判定は表示中の {basisLabel}（α {basis.alpha.toFixed(4)}）によるものです。見積りに使用中の版{basis.activeVersion !== null ? ` (v${basis.activeVersion})` : ''}では結果が異なる場合があります。
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
