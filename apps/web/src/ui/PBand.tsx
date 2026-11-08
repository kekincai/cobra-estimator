import { fmt1 } from './format';
import { exceedLabel, exceedWithP } from './percentile';
import { clamp } from './stats';
import { useMounted } from './useMounted';

/**
 * P20〜P95 の見込み幅の帯（ラベルは超過確率が主、P 値は title / aria の補助）。P20〜P80 を強調色、P80〜P95 を薄色、P50 に縦マーカー。
 * reference があれば帯の下に ▲（例: 保存済みの世代）を置く。
 */
export function PBand({
  p20,
  p50,
  p80,
  p95,
  reference,
}: {
  p20: number;
  p50: number;
  p80: number;
  p95: number;
  reference?: { value: number; label: string } | null;
}) {
  const mounted = useMounted();
  const refV = reference?.value ?? p50;
  const lo = Math.max(5, Math.floor((Math.min(p20, refV) * 0.8) / 5) * 5);
  const hi = Math.ceil((Math.max(p95, refV) * 1.1) / 5) * 5;
  const pct = (x: number) => clamp(((x - lo) / (hi - lo)) * 100, 0, 100);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between gap-2 text-[11px] text-weak">
        {([[20, p20], [50, p50], [80, p80], [95, p95]] as const).map(([p, v]) => (
          <span key={p} className="flex flex-col items-start leading-tight last:items-end" title={exceedWithP(p)}>
            <span>{exceedLabel(p)}</span>
            <span className="font-num text-sub">{fmt1(v)}</span>
          </span>
        ))}
      </div>
      <div
        role="img"
        aria-label={`見込み幅 ${([[20, p20], [50, p50], [80, p80], [95, p95]] as const).map(([p, v]) => `${exceedWithP(p)} ${fmt1(v)}`).join('、')} 人月`}
        className="relative h-3 rounded-md bg-raised"
      >
        <div className="mk absolute inset-y-0 rounded-md bg-accent" style={{ left: `${pct(p20)}%`, width: `${pct(p80) - pct(p20)}%`, opacity: mounted ? 0.9 : 0 }} />
        <div className="mk absolute inset-y-0 rounded-r-md bg-slate" style={{ left: `${pct(p80)}%`, width: `${pct(p95) - pct(p80)}%`, opacity: mounted ? 1 : 0 }} />
        <div
          className="mk absolute -inset-y-[3px] w-1 rounded-sm border border-accent bg-bg"
          style={{ left: `calc(${pct(p50)}% - 2px)`, opacity: mounted ? 1 : 0 }}
        />
        {reference && (
          <div
            className="mk absolute top-[14px] size-0 border-x-[5px] border-b-[6px] border-x-transparent border-b-sub"
            style={{ left: `calc(${pct(reference.value)}% - 5px)`, opacity: mounted ? 1 : 0 }}
          />
        )}
      </div>
      <div className="flex justify-between font-num text-[11px] text-weak">
        <span>{lo}</span>
        {reference ? <span className="text-sub">▲ {reference.label}</span> : <span />}
        <span>{hi} 人月</span>
      </div>
    </div>
  );
}
