import { fmt1, fmtInt } from '../../ui/format';
import { Histogram, type HistogramBin } from '../../ui/Histogram';
import { Ring } from '../../ui/Ring';
import { viewBins, type DashResult } from './results';

interface DistProps {
  result: DashResult;
  budget: number;
  pExceed: number;
  mounted: boolean;
}

/** 工数の分布（24 本）。P50〜P80 を強調色、予算超えを珊瑚色で */
export function DistributionTile({ result, budget, pExceed, mounted }: DistProps) {
  const { bins, lo, hi } = viewBins(result);
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
  const axis = (k: number) => Math.round(lo + (hi - lo) * k);
  const budgetVisible = budget >= lo && budget <= hi;

  return (
    <div className="tile col-span-12 flex min-w-0 flex-col gap-3 px-6 py-[22px] md:col-span-7 xl:col-span-4" style={{ animationDelay: '80ms' }}>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium">工数の分布</span>
        <span className="text-[12px] text-weak">{fmtInt(result.runs)} 回 ・ モンテカルロ</span>
      </div>
      <Histogram
        bins={view}
        show={mounted}
        label={`見積り工数のヒストグラム。推定値 ${fmt1(p50)} 人月付近が最頻で、右に裾を引く`}
        markers={budgetVisible ? [{ at: at(budget), color: 'var(--color-coral)', label: `予算 ${fmt1(budget)}` }] : []}
      />
      <div className="n flex justify-between text-[11px] font-medium tracking-normal text-weak">
        <span>{axis(0)}</span>
        <span>{axis(1 / 3)}</span>
        <span>{axis(2 / 3)}</span>
        <span>{axis(1)} 人月</span>
      </div>
      <div className="flex flex-wrap gap-3.5 border-t border-line pt-2.5 text-[11px] text-sub">
        <span>
          <span className="mr-1.5 inline-block size-2.5 rounded-[3px] bg-accent align-[-1px]" />
          P50〜P80
        </span>
        <span>
          <span className="mr-1.5 inline-block size-2.5 rounded-[3px] bg-coral align-[-1px]" />
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
}

/** 予算の超過確率リング + 予算スライダー */
export function BudgetTile({ budget, scale, pExceed, p80, mounted, onBudget }: BudgetProps) {
  const pct = Math.round(pExceed * 100);
  return (
    <div className="tile col-span-12 flex min-w-0 flex-col items-center gap-2.5 px-6 py-[22px] md:col-span-5 xl:col-span-3" style={{ animationDelay: '160ms' }}>
      <span className="self-start text-[13px] font-medium">
        予算 <span className="n text-[16px] text-coral">{fmt1(budget)}</span> 人月 の超過確率
      </span>
      <Ring value={pExceed} size={140} radius={56} stroke={14} color="var(--color-coral)" show={mounted} label={`予算 ${fmt1(budget)} 人月を超過する確率 ${pct}%`} className="size-[136px]">
        <text x="70" y="66" textAnchor="middle" fontSize="30" fontWeight="700" fill="var(--color-text)" fontFamily="Space Grotesk, sans-serif">
          {pct}%
        </text>
        <text x="70" y="86" textAnchor="middle" fontSize="11" fill="var(--color-sub)" fontFamily="Noto Sans JP, sans-serif">
          超過する確率
        </text>
      </Ring>
      <label htmlFor="dash-budget" className="flex self-stretch justify-between text-[11px] text-sub">
        <span>{scale.lo}</span>
        <span>予算を動かす</span>
        <span>{scale.hi}</span>
      </label>
      <input
        id="dash-budget"
        type="range"
        min={scale.lo}
        max={scale.hi}
        step={0.5}
        value={budget}
        onChange={(e) => onBudget(Number(e.target.value))}
        className="h-7 w-full cursor-pointer accent-coral"
      />
      <span className="mt-auto text-center text-[12px] leading-[1.6] text-sub">
        80% で収めるなら <span className="n text-[14px] text-text">{fmt1(p80)}</span> 人月
      </span>
    </div>
  );
}
