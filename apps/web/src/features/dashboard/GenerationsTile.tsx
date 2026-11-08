import { Link } from 'react-router';
import { inconsistencyText } from './inconsistency';
import type { Inconsistency } from 'cobra-core';
import { fmtInt } from '../../ui/format';
import { fmtSco } from './format';
import type { DashResult } from './results';
import type { GenView } from './useDashboard';

interface Props {
  /** 「5世代まで比較」「工数見積りで実行する」のリンク先（?gen= 付き） */
  estimateHref: string;
  gens: GenView[];
  selectedId: string;
  /** 選択中の世代は Worker の再計算結果、それ以外は保存値 */
  resultOf: (g: GenView) => DashResult | null;
  isSample: boolean;
  inconsistencies: Inconsistency[];
  mounted: boolean;
  onPick: (id: string) => void;
}

/** 世代の一覧（新しい順）とモデルの確認事項 */
export function GenerationsTile({ estimateHref, gens, selectedId, resultOf, isSample, inconsistencies, mounted, onPick }: Props) {
  const rows = gens.map((g) => ({ g, r: resultOf(g) }));
  const maxMed = Math.max(1, ...rows.map((x) => x.r?.p50 ?? 0));
  return (
    <div className="tile @container col-span-12 flex min-w-0 flex-col gap-2 px-5 py-[22px] sm:px-6 xl:col-span-7" style={{ animationDelay: '480ms' }}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="m-0 text-[13px] font-medium">見積りの世代 — クリックで切替</h2>
        <Link to={estimateHref} className="inline-flex min-h-6 items-center text-[12px] font-medium">
          5世代まで比較 →
        </Link>
      </div>
      {[...rows].reverse().map(({ g, r }) => {
        const on = g.id === selectedId;
        return (
          <button
            key={g.id}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(g.id)}
            className={`dash-row grid min-h-11 w-full cursor-pointer grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] text-text @min-[520px]:grid-cols-[40px_minmax(0,1fr)_120px_90px_60px] ${on ? 'border border-line-active bg-raised' : 'border border-transparent bg-transparent'}`}
          >
            <span className={`n ${on ? 'text-accent' : 'text-weak'}`}>{g.label.length > 3 ? '例' : g.label}</span>
            <span className="truncate font-medium">{g.name || '（名称なし）'}</span>
            <span className="hidden text-[11px] text-sub @min-[520px]:inline">
              {fmtInt(g.sizeFP)} FP{r ? ` ・ ${fmtSco(r.sco)}` : ''}
            </span>
            <span aria-hidden="true" className="hidden items-center @min-[520px]:flex">
              <span className="h-1.5 w-[90px] rounded-[3px] bg-raised">
                <span
                  className={`block h-full rounded-[3px] transition-[width] duration-800 ease-out-rise ${on ? 'bg-accent' : 'bg-line-strong'}`}
                  style={{ width: `${mounted && r ? Math.round((r.p50 / maxMed) * 100) : 0}%` }}
                />
              </span>
            </span>
            <span className={`n text-right text-[18px] ${on ? 'text-text' : 'text-sub'}`}>{r ? r.p50.toFixed(1) : '…'}</span>
          </button>
        );
      })}
      {isSample && (
        <p className="m-0 rounded-xl border border-dashed border-line-strong px-3.5 py-3 text-[12px] leading-[1.6] text-sub">
          この見積りにはまだ世代がありません。表示中の値は既定の条件（規模 1,200 FP・要因レベル 3/2/1/2/2/3/1/1）を、この場で 10,000 回シミュレーションしたものです。
          <Link to={estimateHref} className="ml-1 font-medium">
            工数見積りで実行する →
          </Link>
        </p>
      )}
      {inconsistencies.length > 0 && (
        <div className="mt-auto flex items-start gap-2.5 rounded-xl bg-coral-bg px-3.5 py-3 text-coral-ink">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-coral)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
            <path d="M12 3l9 17H3z" />
            <path d="M12 10v4M12 17.5h.01" />
          </svg>
          <span className="text-[12px] leading-[1.6]">
            <span className="font-bold text-coral-strong">モデルの確認事項 {inconsistencies.length} 件</span> — {inconsistencyText(inconsistencies)}
            <Link to="/model/build" className="font-medium text-coral-soft">
              モデル構築で確認
            </Link>
          </span>
        </div>
      )}
    </div>
  );
}
