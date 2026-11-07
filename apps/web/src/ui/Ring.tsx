import type { ReactNode } from 'react';

interface RingProps {
  /** 0〜1 */
  value: number;
  /** viewBox の一辺 */
  size: number;
  radius: number;
  stroke: number;
  /** 塗り色（CSS 値。例 'var(--color-coral)'） */
  color: string;
  /** false のあいだは 0 として描く（マウント時に伸ばす用） */
  show?: boolean;
  label: string;
  className?: string;
  children?: ReactNode;
}

/** 進捗リング。stroke-dasharray を CSS transition で動かす。children は SVG 内（<text> など）。 */
export function Ring({ value, size, radius, stroke, color, show = true, label, className, children }: RingProps) {
  const c = 2 * Math.PI * radius;
  const v = show ? Math.max(0, Math.min(1, value)) : 0;
  const mid = size / 2;
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${size} ${size}`} className={className}>
      <circle cx={mid} cy={mid} r={radius} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
      <circle
        cx={mid}
        cy={mid}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${(v * c).toFixed(1)} ${c.toFixed(1)}`}
        transform={`rotate(-90 ${mid} ${mid})`}
        className="transition-[stroke-dasharray] duration-1000 ease-out-rise"
      />
      {children}
    </svg>
  );
}
