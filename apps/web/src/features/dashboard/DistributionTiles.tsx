import { fmt1, fmtInt } from '../../ui/format';
import { Histogram, type HistogramBin } from '../../ui/Histogram';
import { Ring } from '../../ui/Ring';
import { axisTicks, binsInRange, type DashResult } from './results';

interface DistProps {
  result: DashResult;
  /** 全世代共通の目盛り（帯・スライダーと同じ） */
  scale: { lo: number; hi: number };
  budget: number;
  pExceed: number;
  mounted: boolean;
}

/** 工数の分布（24 本）。P50〜P80 を強調色、予算超えを珊瑚色で */
export function DistributionTile({ result, scale, budget, pExceed, mounted }: DistProps) {
  const { lo, hi } = scale;
  const bins = binsInRange(result, lo, hi);
  const max = Math.max(1, ...bins.map((b) => b.count));
  const p50 = result.p50;
  const p80 = result.pct[80];
  const view: HistogramBin[] = bins.map((b) => {
    const inBand = b.x >= p50 && b.x <= p80;
    const over = b.x > budget;
    return {
      height: b.count / max,
      color: over && inBand ? 'var(--color-coral)' : over ? 'var(--color-coral-dim)' : inBand ? 'var(--color-accent)' : 'var(--color-muted)',
    };
  });
  const at = (x: number) => (x - lo) / (hi - lo || 1);
  const ticks = axisTicks(lo, hi);
  const budgetVisible = budget >= lo && budget <= hi;

  return (
    <div className="tile col-span-12 flex min-w-0 flex-col gap-3 px-5 py-[22px] sm:px-6 md:col-span-7 xl:col-span-4" style={{ animationDelay: '80ms' }}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <h2 className="m-0 text-[13px] font-medium">工数の分布</h2>
        <span className="text-[12px] text-weak">{fmtInt(result.runs)} 回 ・ モンテカルロ</span>
      </div>
      <Histogram
        bins={view}
        show={mounted}
        label={`見積り工数のヒストグラム（${lo}〜${hi} 人月）。推定値 ${fmt1(p50)} 人月付近が最頻で、右に裾を引く。予算 ${fmt1(budget)} 人月を超える確率は ${Math.round(pExceed * 100)}%`}
        markers={budgetVisible ? [{ at: at(budget), color: 'var(--color-coral)', label: `予算 ${fmt1(budget)}` }] : []}
      />
      <div aria-hidden="true" className="n relative h-4 text-[11px] font-medium tracking-normal text-weak">
        {ticks.map((t, i) => (
          <span
            key={t.value}
            className="absolute top-0 whitespace-nowrap"
            style={
              i === 0 ? { left: 0 } : i === ticks.length - 1 ? { right: 0 } : { left: `${t.at * 100}%`, transform: 'translateX(-50%)' }
            }
          >
            {t.value}
            {i === ticks.length - 1 ? ' 人月' : ''}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3.5 gap-y-1 border-t border-line pt-2.5 text-[11px] text-sub">
        <span>
          <span aria-hidden="true" className="mr-1.5 inline-block size-2.5 rounded-[3px] bg-accent align-[-1px]" />
          超過確率 50〜20%（P50〜P80）
        </span>
        <span>
          <span aria-hidden="true" className="mr-1.5 inline-block size-2.5 rounded-[3px] bg-coral align-[-1px]" />
          予算を超える領域 {Math.round(pExceed * 100)}%
        </span>
      </div>
    </div>
  );
}

interface BudgetProps {
  budget: number;
  scale: { lo: number; hi: number };
  pExceed: number;
  p80: number;
  mounted: boolean;
  onBudget: (v: number) => void;
  /** 保存値と違う（試算中） */
  dirty: boolean;
  savedBudget: number | null;
  saving: boolean;
  justSaved: boolean;
  /** describeApiError 済みの文言 */
  saveError: string | null;
  onSave: () => void;
  onRevert: () => void;
}

/** 予算の超過確率リング + 予算スライダー（保存・元に戻す） */
export function BudgetTile({ budget, scale, pExceed, p80, mounted, onBudget, dirty, savedBudget, saving, justSaved, saveError, onSave, onRevert }: BudgetProps) {
  const pct = Math.round(pExceed * 100);
  return (
    <div className="tile col-span-12 flex min-w-0 flex-col items-center gap-2.5 px-5 py-[22px] sm:px-6 md:col-span-5 xl:col-span-3" style={{ animationDelay: '160ms' }}>
      <h2 className="m-0 self-start text-[13px] font-medium">
        予算 <span className="n text-[16px] text-coral">{fmt1(budget)}</span> 人月 の超過確率
      </h2>
      <Ring value={pExceed} size={140} radius={56} stroke={14} color="var(--color-coral)" show={mounted} label={`予算 ${fmt1(budget)} 人月を超過する確率 ${pct}%`} className="size-[136px]">
        <text x="70" y="66" textAnchor="middle" fontSize="30" fontWeight="700" fill="var(--color-text)" fontFamily="Space Grotesk, sans-serif">
          {pct}%
        </text>
        <text x="70" y="86" textAnchor="middle" fontSize="11" fill="var(--color-sub)" fontFamily="Noto Sans JP, sans-serif">
          超過する確率
        </text>
      </Ring>
      <div className="flex self-stretch justify-between gap-2 text-[11px] text-sub">
        <span aria-hidden="true" className="n">{scale.lo}</span>
        <label htmlFor="dash-budget">予算を動かす</label>
        <span aria-hidden="true" className="n">{scale.hi}</span>
      </div>
      <input
        id="dash-budget"
        type="range"
        min={scale.lo}
        max={scale.hi}
        step={0.5}
        value={budget}
        aria-valuetext={`予算 ${fmt1(budget)} 人月、超過確率 ${pct}%`}
        onChange={(e) => onBudget(Number(e.target.value))}
        className="h-7 w-full cursor-pointer accent-coral"
      />
      {dirty ? (
        <div className="flex flex-col items-center gap-1.5 self-stretch">
          <span className="text-center text-[11px] text-sub">
            試算中（保存値 {savedBudget != null ? `${fmt1(savedBudget)} 人月` : 'なし'}）
          </span>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="btn inline-flex min-h-10 cursor-pointer items-center rounded-[10px] border-0 bg-coral px-3.5 font-sans text-[12px] font-bold text-bg disabled:cursor-progress disabled:opacity-70"
            >
              {saving ? '保存中…' : '予算を保存'}
            </button>
            <button
              type="button"
              onClick={onRevert}
              disabled={saving}
              className="btn inline-flex min-h-10 cursor-pointer items-center rounded-[10px] border border-line bg-transparent px-3.5 font-sans text-[12px] font-medium text-text disabled:opacity-60"
            >
              元に戻す
            </button>
          </div>
        </div>
      ) : null}
      <p role="status" className="m-0 text-center text-[12px] text-sub">
        {saveError ? '' : justSaved ? `予算 ${fmt1(budget)} 人月を保存しました` : ''}
      </p>
      {saveError && (
        <p role="alert" className="m-0 text-center text-[12px] text-coral-soft">
          {saveError}
        </p>
      )}
      <span className="mt-auto text-center text-[12px] leading-[1.6] text-sub">
        80% で収めるなら <span className="n text-[14px] text-text">{fmt1(p80)}</span> 人月
      </span>
    </div>
  );
}
