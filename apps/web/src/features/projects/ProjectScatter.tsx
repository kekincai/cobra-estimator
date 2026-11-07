// 実績データ一覧の「規模 × 工数」散布図。採用 = 塗り、除外 = 珊瑚の輪。名目線 = α × 規模。
import { useEffect, useState } from 'react';
import { ceilTo, linear } from '../../ui/scale';
import type { ProjectStat } from './calc';

const X0 = 40, X1 = 620, Y0 = 176, Y1 = 20;

export function ProjectScatter({ stats, alpha, warnIds }: { stats: ProjectStat[]; alpha: number | null; warnIds: Set<string> }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  const xMax = ceilTo(Math.max(0, ...stats.map((s) => s.row.sizeFP)), 500) || 2000;
  const yMax = ceilTo(Math.max(0, ...stats.map((s) => s.row.effortMM)), 10) || 60;
  const X = linear(0, xMax, X0, X1);
  const Y = linear(0, yMax, Y0, Y1);
  const lineY = alpha === null ? Y0 : Math.max(Y1 - 20, Y(alpha * xMax));
  const labels = stats.filter((s) => !s.row.adopted || warnIds.has(s.row.id)).slice(0, 3);

  return (
    <svg role="img" aria-label="規模と工数の散布図" viewBox="0 0 640 220" className="h-auto w-full">
      <line x1={X0} y1={Y0} x2={X1} y2={Y0} className="stroke-line" />
      <line x1={X0} y1={Y1} x2={X0} y2={Y0} className="stroke-line" />
      <line x1={X0} y1={(Y0 + Y1) / 2} x2={X1} y2={(Y0 + Y1) / 2} className="stroke-line" strokeDasharray="3 5" />
      <line
        className="pt stroke-accent"
        x1={X0}
        y1={Y0}
        x2={X1}
        y2={lineY}
        strokeWidth={2}
        strokeDasharray="6 5"
        opacity={alpha === null ? 0 : 0.7}
        style={{ transition: 'all .5s var(--ease-out-rise)' }}
      />
      {stats.map((s, i) => {
        const on = s.row.adopted;
        return (
          <circle
            key={s.row.id}
            className={`pt ${on ? 'fill-accent' : 'fill-bg stroke-coral'}`}
            cx={X(s.row.sizeFP)}
            cy={Y(s.row.effortMM)}
            r={mounted ? (on ? 6 : 5) : 0}
            strokeWidth={on ? 0 : 2}
            opacity={on ? 1 : 0.9}
            style={{ transitionDelay: `${i * 40}ms` }}
          >
            <title>{`${s.row.id} ${s.row.name}: ${Math.round(s.row.sizeFP).toLocaleString('en-US')} FP / ${s.row.effortMM.toFixed(1)} 人月${on ? '' : '（除外）'}`}</title>
          </circle>
        );
      })}
      {labels.map((s) => (
        <text
          key={s.row.id}
          x={X(s.row.sizeFP) + 10}
          y={Y(s.row.effortMM) - 8}
          fontSize={10}
          fontWeight={700}
          className={`font-num ${s.row.adopted ? 'fill-sub' : 'fill-coral'}`}
        >
          {s.row.id}
        </text>
      ))}
      <g className="fill-weak font-num" fontSize={11}>
        <text x={X0} y={196}>0 FP</text>
        <text x={(X0 + X1) / 2} y={196} textAnchor="middle">{(xMax / 2).toLocaleString('en-US')}</text>
        <text x={X1} y={196} textAnchor="end">{xMax.toLocaleString('en-US')} FP</text>
        <text x={34} y={24} textAnchor="end">{yMax}</text>
        <text x={34} y={101} textAnchor="end">{yMax / 2}</text>
        <text x={34} y={178} textAnchor="end">0</text>
      </g>
    </svg>
  );
}
