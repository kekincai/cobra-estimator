import { exceedance } from 'cobra-core';
import { useMemo } from 'react';
import { fmt1 } from './format';
import { clamp, niceTicks } from './stats';

const L = 50;
const R = 680;
const T = 20;
const B = 260;

/**
 * 工数超過確率曲線 P(effort > x)（モンテカルロ標本の経験分布）。
 * 予算までを「予算内の領域」として塗り、予算位置にマーカーと確率ラベルを置く。
 * 横軸は人月か、中央値を 100% とした比率。
 */
export function ExceedanceCurve({
  samples,
  lo,
  hi,
  median,
  budget,
  axis,
  drawKey,
}: {
  samples: ArrayLike<number>;
  lo: number;
  hi: number;
  median: number;
  budget: number;
  axis: 'mm' | 'ratio';
  /** 変わると曲線の描画アニメーションをやり直す */
  drawKey?: string;
}) {
  const X = (x: number) => L + ((clamp(x, lo, hi) - lo) / (hi - lo)) * (R - L);
  const Y = (p: number) => B - p * (B - T);
  const { curve, area } = useMemo(() => {
    let c = '';
    let a = `M${X(lo).toFixed(1)},${B}`;
    const N = 120;
    for (let i = 0; i <= N; i++) {
      const x = lo + ((hi - lo) * i) / N;
      const pt = `${X(x).toFixed(1)},${Y(exceedance(samples, x)).toFixed(1)}`;
      c += (i ? ' L' : 'M') + pt;
      a += ` L${pt}`;
    }
    a += ` L${X(hi).toFixed(1)},${B} Z`;
    return { curve: c, area: a };
  }, [samples, lo, hi]);
  const p = exceedance(samples, budget);
  const mx = X(budget);
  const my = Y(p);
  const mxM = X(median);
  // 比率表示ではきりのよい % の位置に目盛りを置く
  const ticks =
    axis === 'mm'
      ? niceTicks(lo, hi, 4).filter((v) => v > lo && v < hi).map((v) => ({ x: v, label: String(v) }))
      : niceTicks((lo / median) * 100, (hi / median) * 100, 4)
          .map((r) => ({ x: (r / 100) * median, label: `${r}%` }))
          .filter((t) => t.x > lo && t.x < hi);
  const pText = `${Math.round(p * 100)}%`;
  return (
    <svg role="img" aria-label={`工数に対する超過確率の曲線。${fmt1(budget)} 人月で超過確率 ${pText}`} viewBox="0 0 700 300" className="h-auto w-full">
      <rect className="mk" x={L} y={T} width={Math.max(0, mx - L)} height={B - T} fill="var(--accent)" fillOpacity={0.05} />
      <line x1={L} y1={B} x2={R} y2={B} stroke="var(--color-line)" />
      <line x1={L} y1={T} x2={L} y2={B} stroke="var(--color-line)" />
      {[0.8, 0.5, 0.2].map((g) => (
        <line key={g} x1={L} y1={Y(g)} x2={R} y2={Y(g)} stroke="var(--color-line)" strokeDasharray="3 5" />
      ))}
      <g fontSize={11} fill="var(--color-weak)" fontFamily="var(--font-num)" textAnchor="end">
        {[1, 0.8, 0.5, 0.2, 0].map((g) => (
          <text key={g} x={44} y={Y(g) + (g === 0 ? 2 : 4)}>
            {Math.round(g * 100)}%
          </text>
        ))}
      </g>
      <path d={area} fill="var(--color-coral)" fillOpacity={0.1} />
      <path key={drawKey} className="curve-draw" d={curve} fill="none" stroke="var(--color-coral)" strokeWidth={3} strokeLinecap="round" />
      <line x1={mxM} y1={Y(0.5)} x2={mxM} y2={B} stroke="var(--color-line-strong)" strokeDasharray="3 3" />
      <text x={mxM} y={275} fontSize={10} fill="var(--color-sub)" fontFamily="var(--font-num)" textAnchor="middle">
        推定 {fmt1(median)}
      </text>
      <line className="mk" x1={mx} y1={30} x2={mx} y2={B} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="4 4" />
      <circle className="mk" cx={mx} cy={my} r={7} fill="var(--accent)" stroke="var(--color-bg)" strokeWidth={3} />
      <text className="mk" x={mx} y={Math.max(14, my - 16)} fontSize={13} fontWeight={700} fill="var(--accent)" fontFamily="var(--font-num)" textAnchor="middle">
        {pText}
      </text>
      <g fontSize={11} fill="var(--color-weak)" fontFamily="var(--font-num)" textAnchor="middle">
        {ticks.map((t) => (
          <text key={t.label} x={X(t.x)} y={290}>
            {t.label}
          </text>
        ))}
      </g>
    </svg>
  );
}
