// リスク節の超過確率曲線。見本の見積り（レポート対象の世代）に保存された P 値表（P5〜P95）をそのまま結ぶ。
// 予算の超過確率は補間せず「40〜50%」のように表から確実に言える幅で示す（正確な値はリスク画面）。
import { Link } from 'react-router';
import { fmt1 } from '../../ui/format';
import { exceedLabel, exceedWithP } from '../../ui/percentile';
import { axisTicks, exceedBracket } from './facts';
import type { SampleEstimate } from './useGuideFacts';
import { useWidth } from './useWidth';

const H = 200;
const TOP = 16;
const BOTTOM = 172;
const LEFT = 44;

export function RiskExample({ sample }: { sample: SampleEstimate }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const { pct, p50 } = sample.result;
  const budget = sample.budget;
  const p80 = pct.find((x) => x.p === 80)?.v ?? null;
  const vals = [...pct.map((x) => x.v), ...(budget !== null ? [budget] : [])];
  const lo = Math.floor(Math.min(...vals) / 5) * 5;
  const hi = Math.ceil(Math.max(...vals) / 5) * 5;
  const right = W - 16;
  const X = (v: number) => LEFT + ((v - lo) / Math.max(hi - lo, 1e-9)) * (right - LEFT);
  const Y = (exceed: number) => BOTTOM - exceed * (BOTTOM - TOP);
  const pts = pct.map((x) => `${X(x.v).toFixed(1)},${Y(1 - x.p / 100).toFixed(1)}`).join(' ');
  const bracket = budget !== null ? exceedBracket(pct, budget) : null;
  const short = sample.name.split(' — ')[0];

  return (
    <figure className="m-0 flex min-w-0 flex-col gap-2.5">
      <div ref={ref} className="min-w-0">
        <svg width="100%" height={H + 8} viewBox={`0 0 ${W} ${H + 8}`} role="img" aria-label={`見本「${short}」${sample.genLabel} の工数超過確率の曲線。工数が増えるほど超える確率が下がる。推定値 ${fmt1(p50)} 人月で超過確率 50%。`}>
          <line x1={LEFT} y1={BOTTOM} x2={right} y2={BOTTOM} stroke="var(--color-line-strong)" />
          <line x1={LEFT} y1={TOP} x2={LEFT} y2={BOTTOM} stroke="var(--color-line-strong)" />
          <g style={{ fontFamily: 'var(--font-num)' }} fontSize="11" fill="var(--color-sub)">
            {[1, 0.5, 0].map((e) => (
              <text key={e} x={LEFT - 6} y={Y(e) + 4} textAnchor="end">
                {e * 100}%
              </text>
            ))}
            {axisTicks(lo, hi).map((t) => (
              <text key={t} x={X(t)} y={BOTTOM + 18} textAnchor="middle">
                {t}
              </text>
            ))}
          </g>
          <line x1={LEFT} y1={Y(0.5)} x2={right} y2={Y(0.5)} stroke="var(--color-line)" strokeDasharray="2 4" />
          <polyline points={pts} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {budget !== null && <line x1={X(budget)} y1={TOP} x2={X(budget)} y2={BOTTOM} stroke="var(--color-coral)" strokeDasharray="4 4" />}
          <circle cx={X(p50)} cy={Y(0.5)} r="5" fill="var(--color-accent)" stroke="var(--color-bg)" strokeWidth="2" />
          {p80 !== null && <circle cx={X(p80)} cy={Y(0.2)} r="4.5" fill="var(--color-bg)" stroke="var(--color-accent)" strokeWidth="2" />}
        </svg>
      </div>
      <figcaption className="flex flex-col gap-1.5 text-[12px] leading-[1.6] text-sub">
        <span>
          見本: <Link to={`/estimate/${sample.id}/risk?gen=${encodeURIComponent(sample.genLabel)}`} className="text-text underline decoration-line-strong underline-offset-2 hover:decoration-accent">{short} {sample.genLabel}</Link>（規模 {sample.sizeFP.toLocaleString('en-US')} FP）。横軸は工数 (人月)、縦軸は超過確率。
        </span>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          <li className="flex items-baseline gap-2">
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-accent" />
            <span>
              推定値 <span className="n text-text">{fmt1(p50)}</span> 人月 — 中央値（{exceedLabel(50)}）
            </span>
          </li>
          {p80 !== null && (
            <li className="flex items-baseline gap-2">
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full border-2 border-accent" />
              <span>
                <span className="n text-text">{fmt1(p80)}</span> 人月 — {exceedWithP(80)}
              </span>
            </li>
          )}
          {budget !== null && bracket && (
            <li className="flex items-baseline gap-2">
              <span aria-hidden="true" className="h-2 w-0 shrink-0 border-l-2 border-dashed border-coral" />
              <span>
                予算 <span className="n text-text">{fmt1(budget).replace(/\.0$/, '')}</span> 人月 — 超過確率 {bracket.lo}〜{bracket.hi}%（正確な値はリスク画面で）
              </span>
            </li>
          )}
        </ul>
      </figcaption>
    </figure>
  );
}
