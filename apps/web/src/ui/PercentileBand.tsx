interface PercentileBandProps {
  /** 目盛りの両端（人月） */
  lo: number;
  hi: number;
  p20: number;
  p50: number;
  p80: number;
  p95: number;
  budget?: number | null;
  show?: boolean;
  className?: string;
}

/** P20〜P80（強調色）と P80〜P95（暗色）の帯、P50 と予算のマーカー。 */
export function PercentileBand({ lo, hi, p20, p50, p80, p95, budget, show = true, className }: PercentileBandProps) {
  const pct = (x: number) => Math.min(100, Math.max(0, ((x - lo) / (hi - lo || 1)) * 100));
  const mk = 'absolute transition-[left,width,opacity] duration-350 ease-out-rise';
  return (
    <div className={`relative h-3.5 rounded-[7px] bg-raised ${className ?? ''}`}>
      <div className={`${mk} inset-y-0 rounded-[7px] bg-accent`} style={{ left: `${pct(p20)}%`, width: `${pct(p80) - pct(p20)}%`, opacity: show ? 0.9 : 0 }} />
      <div className={`${mk} inset-y-0 rounded-r-[7px] bg-slate`} style={{ left: `${pct(p80)}%`, width: `${pct(p95) - pct(p80)}%`, opacity: show ? 1 : 0 }} />
      <div className={`${mk} -inset-y-[3px] w-1 rounded-sm border border-accent bg-bg`} style={{ left: `calc(${pct(p50)}% - 2px)`, opacity: show ? 1 : 0 }} />
      {budget != null && (
        <div className={`${mk} -inset-y-[5px] w-1 rounded-sm bg-coral`} style={{ left: `calc(${pct(budget)}% - 2px)`, opacity: show ? 1 : 0 }} />
      )}
    </div>
  );
}
