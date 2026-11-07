import { Histogram } from '../../ui/Histogram';
import { clamp } from '../../ui/stats';
import { useMounted } from '../../ui/useMounted';

export interface DistributionMarker {
  x: number;
  label: string;
  tone: 'accent' | 'sub';
}

const TONE = { accent: 'var(--color-accent)', sub: 'var(--color-sub)' } as const;

/**
 * 見積り画面のヒストグラム。共有の ui/Histogram に、P50〜P80 区間の強調と横軸の目盛りを足す。
 * counts は lo〜hi を等幅に区切った度数。
 */
export function DistributionHistogram({
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
  markers?: DistributionMarker[];
  ariaLabel: string;
  unit?: string;
}) {
  const mounted = useMounted();
  const max = Math.max(1, ...counts);
  const n = counts.length;
  const at = (x: number) => clamp((x - lo) / (hi - lo), 0, 1);
  const bins = counts.map((c, i) => {
    const mid = lo + ((hi - lo) * (i + 0.5)) / n;
    const on = highlight && mid >= highlight[0] && mid <= highlight[1];
    return { height: c / max, color: on ? 'var(--color-accent)' : 'var(--color-muted)' };
  });
  const axis = (k: number) => Math.round(lo + (hi - lo) * k);
  return (
    <div className="flex flex-col gap-[18px]">
      <Histogram
        bins={bins}
        markers={markers.map((m) => ({ at: at(m.x), color: TONE[m.tone], label: m.label }))}
        label={ariaLabel}
        show={mounted}
        height={140}
      />
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
