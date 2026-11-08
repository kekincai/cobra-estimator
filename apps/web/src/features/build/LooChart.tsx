// 交差検証（1 件抜き）の誤差。上 = 過大見積り、下 = 過小見積り。±25% の帯の外は珊瑚色。
// 帯の判定は cobra-core と同じく元の値（MRE > 0.25 が帯の外。PRED(25) は MRE ≤ 0.25 を数える）。
// 表示は bandPct で、四捨五入しても判定と食い違わない桁数にする（0.2526 → 「+25.3%」）。
import type { LooPoint } from 'cobra-core';
import { bandPct } from '../projects/bandFormat';

const CENTER = 76; // px: 誤差 0 の位置
const PX_PER_PCT = 1.28; // 25% → 32px
const CLAMP = 55; // 表示上の上限 ±55%

export function LooChart({ loo, revealed }: { loo: LooPoint[]; revealed: boolean }) {
  const top = (e: number) => CENTER - Math.max(-CLAMP, Math.min(CLAMP, e * 100)) * PX_PER_PCT;
  const views = loo.map((l) => ({ l, ...bandPct(l.error) }));
  return (
    <div
      className="relative grid h-[176px] gap-1 pt-2 sm:gap-2.5"
      style={{ gridTemplateColumns: `repeat(${Math.max(1, loo.length)}, minmax(0, 1fr))` }}
      role="img"
      aria-label={`交差検証の誤差（±25% の帯の外は${views.filter((v) => v.out).length} 件）: ${views.map((v) => `${v.l.projectId} ${v.text}${v.out ? ' 帯の外' : ''}`).join('、')}`}
    >
      <div className="absolute inset-x-0 top-11 h-16 rounded-[6px] bg-card-2" />
      <div className="absolute inset-x-0 top-[76px] h-px bg-line-strong" />
      <span className="absolute top-[30px] right-1 font-num text-[11px] text-sub">+25%</span>
      <span className="absolute top-[110px] right-1 font-num text-[11px] text-sub">−25%</span>
      {views.map(({ l, out, text }, i) => {
        const y = top(l.error);
        return (
          <div key={l.projectId} className="relative flex min-w-0 flex-col items-center" aria-hidden="true">
            <span
              className={`absolute font-num text-[11px] font-bold whitespace-nowrap transition-[top,opacity] duration-500 ${out ? 'text-coral-soft' : 'text-sub'}`}
              style={{ top: revealed ? y - 24 : -40, opacity: revealed ? 1 : 0, transitionDelay: `${i * 50 + 300}ms` }}
            >
              {text}
            </span>
            <span
              className={`absolute size-3.5 rounded-full ${out ? 'bg-coral' : 'bg-accent'}`}
              style={{
                top: revealed ? y - 7 : -20,
                opacity: revealed ? 1 : 0,
                transition: 'top .7s var(--ease-out-rise), opacity .5s, background .3s',
                transitionDelay: `${i * 50}ms`,
              }}
            />
            <span className="mt-[140px] font-num text-[11px] text-sub" title={l.projectId}>{l.projectId.replace(/^PJ-/, '')}</span>
          </div>
        );
      })}
    </div>
  );
}

/** 帯の外（MRE > 0.25）の実績 ID。PRED(25) と同じ判定 */
export const looOutIds = (loo: LooPoint[]) => loo.filter((l) => bandPct(l.error).out).map((l) => l.projectId);
