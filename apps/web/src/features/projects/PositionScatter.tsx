// 実績の追加・編集: 既存の実績の中で入力中のプロジェクトがどこに落ちるか。
import { ceilTo, linear } from '../../ui/scale';
import type { ProjectRow } from '../../../shared/types';

const X0 = 36, X1 = 340, Y0 = 196, Y1 = 12;

interface Props {
  existing: ProjectRow[];
  alpha: number | null;
  sizeFP: number;
  effortMM: number;
  label: string;
}

export function PositionScatter({ existing, alpha, sizeFP, effortMM, label }: Props) {
  const xMax = ceilTo(Math.max(0, ...existing.map((p) => p.sizeFP)) * 1.1, 600) || 2400;
  const yMax = ceilTo(Math.max(0, ...existing.map((p) => p.effortMM)) * 1.1, 10) || 70;
  const X = linear(0, xMax, X0, X1, true);
  const Y = linear(0, yMax, Y0, Y1, true);
  const has = sizeFP > 0 && effortMM > 0;
  const meX = X(Math.max(0, sizeFP));
  const meY = Y(Math.max(0, effortMM));
  const nomX2 = alpha ? Math.min(X1, X(yMax / alpha)) : X1;
  const nomY2 = alpha ? Y(alpha * xMax) : Y0;
  const fmt = (v: number) => v.toLocaleString('en-US');

  return (
    <svg width="356" height="232" viewBox="0 0 356 232" className="max-w-full" role="img" aria-label="規模と工数の散布図。入力中のプロジェクトの位置と名目線 α を示す">
      <line x1={X0} y1={Y0} x2={X1} y2={Y0} className="stroke-line" />
      <line x1={X0} y1={Y1} x2={X0} y2={Y0} className="stroke-line" />
      <g className="fill-weak font-num" fontSize={9}>
        <text x={X0} y={212}>0</text>
        <text x={(X0 + X1) / 2} y={212} textAnchor="middle">{fmt(xMax / 2)}</text>
        <text x={X1} y={212} textAnchor="end">{fmt(xMax)} FP</text>
        <text x={30} y={200} textAnchor="end">0</text>
        <text x={30} y={106} textAnchor="end">{yMax / 2}</text>
        <text x={30} y={16} textAnchor="end">{yMax}</text>
      </g>
      {alpha !== null && (
        <>
          <line x1={X0} y1={Y0} x2={nomX2} y2={Math.max(Y1, nomY2)} className="stroke-line-strong" strokeWidth={1.5} strokeDasharray="4 4" />
          <text x={nomX2 - 52} y={Math.max(Y1, nomY2) + (nomY2 <= Y1 + 8 ? 14 : -6)} className="fill-sub font-num" fontSize={9}>
            α {alpha.toFixed(4)}
          </text>
        </>
      )}
      {existing.map((p) => (
        <circle key={p.id} cx={X(p.sizeFP)} cy={Y(p.effortMM)} r={4} className={p.adopted ? 'fill-line-strong' : 'fill-coral'}>
          <title>{`${p.id} ${p.name}${p.adopted ? '' : '（除外）'}`}</title>
        </circle>
      ))}
      <g opacity={has ? 1 : 0.35}>
        <circle className="pt fill-accent" cx={meX} cy={meY} r={12} opacity={0.18} />
        <circle className="pt fill-accent stroke-bg" cx={meX} cy={meY} r={6} strokeWidth={2} />
        <text
          className="pt fill-accent"
          x={meX > X1 - 70 ? meX - 10 : meX + 10}
          y={meY < Y1 + 14 ? meY + 20 : meY - 10}
          textAnchor={meX > X1 - 70 ? 'end' : 'start'}
          fontSize={10}
          fontWeight={700}
          style={{ transition: 'x .5s var(--ease-out-rise), y .5s var(--ease-out-rise)' }}
        >
          {label}
        </text>
      </g>
    </svg>
  );
}
