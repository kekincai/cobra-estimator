import { Link } from 'react-router';
import { fmt1, fmtInt } from '../../ui/format';
import { PercentileBand } from '../../ui/PercentileBand';
import { useCountUp } from '../../ui/useCountUp';
import { fmtMDHM, fmtSco } from './format';
import type { DashResult } from './results';
import type { GenView } from './useDashboard';

interface Props {
  estimateId: string;
  gen: GenView;
  prev: GenView | null;
  prevP50: number | null;
  result: DashResult;
  scale: { lo: number; hi: number };
  budget: number;
  mounted: boolean;
  running: boolean;
  progress: number;
  onRun: () => void;
}

/** 推定工数（カウントアップ）・P20〜P95 帯・再実行 */
export function EstimateTile({ estimateId, gen, prev, prevP50, result, scale, budget, mounted, running, progress, onRun }: Props) {
  const p50 = result.p50;
  // 再実行中は 3% 下げて、終わったら戻す（設計稿の「再計算した」感）
  const shown = useCountUp(running ? p50 * 0.97 : p50, 1100);
  const delta = prevP50 != null ? p50 - prevP50 : null;
  const up = delta != null && delta > 0;
  const overhead = p50 - result.nominal;
  const runsDone = Math.round(progress * gen.runs);

  return (
    <div className="tile col-span-12 flex min-w-0 flex-col gap-4 px-[26px] py-6 xl:col-span-5" style={{ animationDelay: '0ms' }}>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-[12px] text-sub">
          <span className="dash-pulse size-2 rounded-full bg-accent" />
          {gen.label} ・ {gen.name}
        </span>
        <span className="text-[12px] text-weak">{fmtMDHM(gen.createdAt)}</span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[12px] text-sub">推定工数 (超過確率 50%)</span>
        <div className="flex flex-wrap items-end gap-3.5">
          <span className="n text-[84px] leading-[0.95] text-accent" aria-live="polite">
            {fmt1(shown)}
            <span className="ml-2 text-[22px] font-medium tracking-normal text-sub">人月</span>
          </span>
          <span
            className={`n mb-2.5 inline-flex min-h-[26px] items-center rounded-full px-2.5 text-[12px] ${up ? 'bg-coral-bg text-coral-soft' : 'bg-ok-bg text-ok'}`}
          >
            {delta == null || !prev ? '初回' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} vs ${prev.label}`}
          </span>
        </div>
        <span className="text-[12px] text-sub">
          規模 {fmtInt(gen.sizeFP)} FP ・ ΣCO {fmtSco(result.sco)} ・ 名目 {fmt1(result.nominal)} + 上乗せ {fmt1(overhead)}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex justify-between text-[11px] text-weak">
          <span>P20 {fmt1(result.pct[20])}</span>
          <span>P50 {fmt1(p50)}</span>
          <span>P80 {fmt1(result.pct[80])}</span>
          <span>P95 {fmt1(result.pct[95])}</span>
        </div>
        <PercentileBand lo={scale.lo} hi={scale.hi} p20={result.pct[20]} p50={p50} p80={result.pct[80]} p95={result.pct[95]} budget={budget} show={mounted} />
        <div className="n flex justify-between text-[11px] font-medium tracking-normal text-weak">
          <span>{scale.lo}</span>
          <span className="text-coral">予算 {fmt1(budget)}</span>
          <span>{scale.hi} 人月</span>
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-2.5">
        <div className="h-1 overflow-hidden rounded-sm bg-raised">
          <div
            className="h-full rounded-sm bg-accent transition-[width,opacity] duration-200"
            style={{ width: `${running ? Math.round(progress * 100) : 0}%`, opacity: running ? 1 : 0 }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRun}
            disabled={running}
            className="btn inline-flex min-h-[38px] cursor-pointer items-center gap-2 rounded-[10px] border-0 bg-raised px-3.5 text-[12px] font-medium text-text disabled:cursor-progress"
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={running ? 'dash-spin' : undefined}>
              <path d="M21 12a9 9 0 1 1-3-6.7" />
              <path d="M21 3v6h-6" />
            </svg>
            {running ? (
              <span>
                実行中 {Math.round(progress * 100)}% ・ {fmtInt(runsDone)} / {fmtInt(gen.runs)}
              </span>
            ) : (
              <span>シミュレーションを再実行</span>
            )}
          </button>
          <Link to={`/estimate/${estimateId}/risk`} className="btn inline-flex min-h-[38px] items-center rounded-[10px] bg-raised px-3.5 text-[12px] font-medium text-text no-underline">
            リスクを見る
          </Link>
          <Link to={`/estimate/${estimateId}/report`} className="btn inline-flex min-h-[38px] items-center rounded-[10px] border border-line px-3.5 text-[12px] font-medium text-sub no-underline">
            レポート
          </Link>
        </div>
      </div>
    </div>
  );
}
