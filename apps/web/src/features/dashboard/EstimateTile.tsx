import { Link } from 'react-router';
import { displayDelta, fmt1, fmtInt, fmtSigned } from '../../ui/format';
import { HelpLink } from '../../ui/HelpLink';
import { exceedLabel } from '../../ui/percentile';
import { PercentileBand } from '../../ui/PercentileBand';
import { useCountUp } from '../../ui/useCountUp';
import { fmtMDHM, fmtSco } from './format';
import type { DashResult } from './results';
import type { GenView } from './useDashboard';

interface Props {
  /** 下流画面へのリンク（?gen= 付き） */
  links: { risk: string; report: string };
  gen: GenView;
  prev: GenView | null;
  prevP50: number | null;
  result: DashResult;
  scale: { lo: number; hi: number };
  budget: number;
  mounted: boolean;
  running: boolean;
  progress: number;
  /** 直前の再実行の結果 */
  rerunNote: { runs: number; same: boolean } | null;
  onRun: () => void;
}

const PCTS = [20, 50, 80, 95] as const;

/** 推定工数（カウントアップ）・P20〜P95 帯・再実行 */
export function EstimateTile({ links, gen, prev, prevP50, result, scale, budget, mounted, running, progress, rerunNote, onRun }: Props) {
  const p50 = result.p50;
  // 数字は実際に計算された値だけを表示する（再実行中も今の値のまま。進捗はバーとボタンで示す）
  const shown = useCountUp(p50, 1100);
  // 差は「表示している丸めた値」どうしで引く（43.9 − 33.5 → +10.4）
  const delta = prevP50 != null ? displayDelta(p50, prevP50) : null;
  const up = delta != null && delta > 0;
  // 上乗せ = 表示値どうしの差（見積り画面の「名目 + 上乗せ = 推定」と同じ値にする）
  const overhead = displayDelta(p50, result.nominal);
  const runsDone = Math.round(progress * gen.runs);

  return (
    <div className="tile @container col-span-12 flex min-w-0 flex-col gap-4 px-5 py-6 sm:px-[26px] xl:col-span-5" style={{ animationDelay: '0ms' }}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="inline-flex min-w-0 items-center gap-2 text-[12px] text-sub">
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-accent" />
          <span className="min-w-0 break-words">
            {gen.label} ・ {gen.name}
          </span>
        </span>
        <span className="text-[12px] text-weak">{fmtMDHM(gen.createdAt)}</span>
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="m-0 inline-flex items-center gap-2 text-[12px] font-normal text-sub">
          推定工数 (超過確率 50%)
          <HelpLink section="risk" />
        </h2>
        <div className="flex flex-wrap items-end gap-x-3.5 gap-y-1">
          <span className="n text-[clamp(48px,20cqw,84px)] leading-[0.95] text-accent" aria-hidden="true">
            {fmt1(shown)}
            <span className="ml-2 text-[22px] font-medium tracking-normal text-sub">人月</span>
          </span>
          {/* 読み上げは確定値だけ（カウントアップの途中経過は読ませない） */}
          <span className="sr-only">
            {fmt1(p50)} 人月
          </span>
          <span
            className={`n mb-2.5 inline-flex min-h-[26px] items-center rounded-full px-2.5 text-[12px] ${up ? 'bg-coral-bg text-coral-soft' : 'bg-ok-bg text-ok'}`}
          >
            {delta == null || !prev ? '初回' : `${fmtSigned(delta)} vs ${prev.label}`}
          </span>
        </div>
        <span className="text-[12px] text-sub">
          規模 {fmtInt(gen.sizeFP)} FP ・ ΣCO {fmtSco(result.sco)} ・ 名目 {fmt1(result.nominal)} + 上乗せ {fmt1(overhead)}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <dl className="m-0 grid grid-cols-4 gap-1 text-[11px]">
          {PCTS.map((p) => (
            <div key={p} className={`flex min-w-0 flex-col ${p === 20 ? 'items-start' : p === 95 ? 'items-end text-right' : 'items-center text-center'}`}>
              <dt className="text-weak" title={`P${p}`}>
                {exceedLabel(p)}
              </dt>
              <dd className="n m-0 text-[12px] text-sub">{fmt1(p === 50 ? p50 : result.pct[p])}</dd>
            </div>
          ))}
        </dl>
        <PercentileBand lo={scale.lo} hi={scale.hi} p20={result.pct[20]} p50={p50} p80={result.pct[80]} p95={result.pct[95]} budget={budget} show={mounted} />
        <div className="n flex justify-between gap-2 text-[11px] font-medium tracking-normal text-weak">
          <span>{scale.lo}</span>
          <span className="text-coral">予算 {fmt1(budget)}</span>
          <span>{scale.hi} 人月</span>
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-2.5">
        <div
          className="h-1 overflow-hidden rounded-sm bg-raised"
          role={running ? 'progressbar' : undefined}
          aria-label={running ? 'シミュレーションの進捗' : undefined}
          aria-valuenow={running ? Math.round(progress * 100) : undefined}
          aria-valuemin={running ? 0 : undefined}
          aria-valuemax={running ? 100 : undefined}
        >
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
            className="btn inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-[10px] border-0 bg-raised px-3.5 font-sans text-[12px] font-medium text-text disabled:cursor-progress"
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
          <Link to={links.risk} className="btn inline-flex min-h-10 items-center rounded-[10px] bg-raised px-3.5 text-[12px] font-medium text-text no-underline">
            リスクを見る
          </Link>
          <Link to={links.report} className="btn inline-flex min-h-10 items-center rounded-[10px] border border-line px-3.5 text-[12px] font-medium text-sub no-underline">
            レポート
          </Link>
        </div>
        <p className="m-0 min-h-[18px] text-[11px] text-sub" aria-live="polite">
          {!running && rerunNote
            ? `${fmtInt(rerunNote.runs)} 回 再計算しました${rerunNote.same ? '（乱数シードが同じため、結果は前回と同じです）' : ''}`
            : ''}
        </p>
      </div>
    </div>
  );
}
