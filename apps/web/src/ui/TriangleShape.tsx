import type React from 'react';
// 三角分布の形（L3 の工数増加率 0〜120%）。値を変えると .tri-shape の transition で形が動く。
export interface TriangleSeries {
  /** [最良, 最頻, 最悪]（%） */
  tri: [number, number, number];
  stroke: string;
  /** 塗り（省略で塗りなし） */
  fill?: string;
  dashed?: boolean;
}

const X = (v: number) => 20 + (Math.min(120, Math.max(0, v)) / 120) * 360;

/** 三角形のパス。CSS の d プロパティにも入れるので、対応ブラウザでは形の変化がなめらかに動く。 */
export function trianglePath(t: [number, number, number], base: number, top: number) {
  return `M ${X(t[0]).toFixed(1)} ${base} L ${X(t[1]).toFixed(1)} ${top} L ${X(t[2]).toFixed(1)} ${base} Z`;
}

export function TriangleShape({
  series,
  height = 120,
  label = '三角分布の形状',
  peakOf,
}: {
  series: TriangleSeries[];
  /** viewBox の高さ（設計稿は 110〜130） */
  height?: number;
  label?: string;
  /** この系列の最頻値に点を打つ */
  peakOf?: number;
}) {
  const base = height - 26;
  const top = height >= 130 ? 18 : height >= 120 ? 18 : 16;
  const peak = peakOf !== undefined ? series[peakOf] : undefined;
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 400 ${height}`} className="block h-auto w-full">
      <line x1="20" y1={base} x2="380" y2={base} style={{ stroke: 'var(--color-line)' }} />
      {series.map((s, i) => (
        <path
          key={i}
          className="tri-shape"
          d={trianglePath(s.tri, base, top)}
          style={{ fill: s.fill ?? 'none', stroke: s.stroke, d: `path("${trianglePath(s.tri, base, top)}")` } as React.CSSProperties}
          fillOpacity={s.fill ? 0.16 : undefined}
          strokeWidth={s.dashed ? 2 : 2.5}
          strokeDasharray={s.dashed ? '5 4' : undefined}
          strokeLinejoin="round"
        />
      ))}
      {peak && <circle className="tri-shape" cx={X(peak.tri[1])} cy={top} r="4" style={{ fill: peak.stroke }} />}
      <text x="20" y={height - 8} fontSize="11" style={{ fill: 'var(--color-weak)' }} fontFamily="Space Grotesk, sans-serif">0%</text>
      <text x="200" y={height - 8} fontSize="11" style={{ fill: 'var(--color-weak)' }} fontFamily="Space Grotesk, sans-serif" textAnchor="middle">60%</text>
      <text x="380" y={height - 8} fontSize="11" style={{ fill: 'var(--color-weak)' }} fontFamily="Space Grotesk, sans-serif" textAnchor="end">120%</text>
    </svg>
  );
}
