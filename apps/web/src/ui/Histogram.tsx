import { clamp } from './stats';
import { useMounted } from './useMounted';

export interface HistogramMarker {
  x: number;
  label: string;
  tone: 'accent' | 'sub';
}

/**
 * 暗色テーマのヒストグラム（div の棒）。highlight の区間に中心がある棒を強調色にする。
 * 棒は CSS トランジションで伸びる（reduced-motion では即時）。
 */
export function Histogram({
  counts,
  lo,
  hi,
  highlight,
  markers = [],
  ariaLabel,
  unit = '人月',
}: {
  counts: number[];
  lo: number;
  hi: number;
  highlight?: [number, number];
  markers?: HistogramMarker[];
  ariaLabel: string;
  unit?: string;
}) {
  const mounted = useMounted();
  const max = Math.max(1, ...counts);
  const n = counts.length;
  const hx = (x: number) => clamp(((x - lo) / (hi - lo)) * 100, 0, 100);
  const axis = (k: number) => Math.round(lo + (hi - lo) * k);
  return (
    <div className="flex flex-col gap-[18px]">
      <div className="relative h-[150px]">
        <div role="img" aria-label={ariaLabel} className="absolute inset-x-0 bottom-0 flex h-[140px] items-end gap-1">
          {counts.map((c, i) => {
            const mid = lo + ((hi - lo) * (i + 0.5)) / n;
            const on = highlight && mid >= highlight[0] && mid <= highlight[1];
            return (
              <div
                key={i}
                className={`bar-v flex-1 rounded-t-[3px] ${on ? 'bg-accent' : 'bg-muted'}`}
                style={{ height: `${mounted ? Math.max(2, Math.round((c / max) * 100)) : 0}%`, transitionDelay: `${i * 15}ms` }}
              />
            );
          })}
        </div>
        {markers.map((m) => (
          <div key={m.label} aria-hidden="true">
            <div className={`mk absolute inset-y-0 w-[2px] ${m.tone === 'accent' ? 'bg-accent' : 'bg-sub'}`} style={{ left: `${hx(m.x)}%`, opacity: mounted ? 0.8 : 0 }} />
            <span
              className={`mk n absolute top-[-2px] text-[10px] ${m.tone === 'accent' ? 'text-accent' : 'text-sub'}`}
              style={{ left: `calc(${hx(m.x)}% + 5px)`, opacity: mounted ? 1 : 0 }}
            >
              {m.label}
            </span>
          </div>
        ))}
      </div>
      <div className="flex justify-between font-num text-[11px] text-weak" aria-hidden="true">
        <span>{axis(0)}</span>
        <span>{axis(1 / 3)}</span>
        <span>{axis(2 / 3)}</span>
        <span>
          {axis(1)} {unit}
        </span>
      </div>
    </div>
  );
}
