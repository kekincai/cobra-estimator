export interface SparkPoint {
  label: string;
  value: number;
  /** 塗りつぶしで強調する点（採用中など） */
  current?: boolean;
}

interface SparklineProps {
  points: SparkPoint[];
  label: string;
  width?: number;
  height?: number;
  className?: string;
}

/** 折れ線（線は stroke-dashoffset で描かれる）+ 点 + 下にラベル。値が大きいほど上。 */
export function Sparkline({ points, label, width = 220, height = 60, className }: SparklineProps) {
  const top = 18;
  const bottom = height - 17;
  const padX = 20;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const n = points.length;
  const xy = points.map((p, i) => ({
    ...p,
    x: n === 1 ? width / 2 : padX + ((width - 2 * padX) * i) / (n - 1),
    y: max === min ? (top + bottom) / 2 : bottom - ((p.value - min) / (max - min)) * (bottom - top),
  }));
  const poly = xy.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${width} ${height}`} className={className}>
      {n > 1 && (
        <polyline
          points={poly}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={400}
          className="spark-draw"
        />
      )}
      {xy.map((p) => (
        <g key={p.label}>
          {p.current ? (
            <circle cx={p.x} cy={p.y} r="5" fill="var(--color-accent)" />
          ) : (
            <circle cx={p.x} cy={p.y} r="4" fill="var(--color-muted)" stroke="var(--color-accent)" strokeWidth="2" />
          )}
          <text x={p.x} y={height - 2} fontSize="10" fill={p.current ? 'var(--color-sub)' : 'var(--color-weak)'} fontFamily="Space Grotesk, sans-serif" textAnchor="middle">
            {p.label}
          </text>
        </g>
      ))}
      <style>{`.spark-draw{stroke-dasharray:400;stroke-dashoffset:400;animation:spark-draw 1.4s cubic-bezier(.2,.7,.2,1) .4s forwards}@keyframes spark-draw{to{stroke-dashoffset:0}}@media (prefers-reduced-motion: reduce){.spark-draw{animation:none;stroke-dashoffset:0}}`}</style>
    </svg>
  );
}
