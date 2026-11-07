// 交差検証（1 件抜き）の誤差。上 = 過大見積り、下 = 過小見積り。±25% の帯の外は珊瑚色。
import type { LooPoint } from 'cobra-core';
import { INCONSISTENCY_THRESHOLD } from 'cobra-core';

const CENTER = 76; // px: 誤差 0 の位置
const PX_PER_PCT = 1.28; // 25% → 32px
const CLAMP = 55; // 表示上の上限 ±55%

const pct = (e: number) => Math.round(e * 100);
const sign = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v);

export function LooChart({ loo, revealed }: { loo: LooPoint[]; revealed: boolean }) {
  const top = (e: number) => CENTER - Math.max(-CLAMP, Math.min(CLAMP, pct(e))) * PX_PER_PCT;
  return (
    <div
      className="relative grid h-[176px] gap-2.5 pt-2"
      style={{ gridTemplateColumns: `repeat(${Math.max(1, loo.length)}, minmax(0, 1fr))` }}
      role="img"
      aria-label={`交差検証の誤差: ${loo.map((l) => `${l.projectId} ${sign(pct(l.error))}%`).join('、')}`}
    >
      <div className="absolute inset-x-0 top-11 h-16 rounded-[6px] bg-card-2" />
      <div className="absolute inset-x-0 top-[76px] h-px bg-line-strong" />
      <span className="absolute top-[30px] right-1 font-num text-[10px] text-weak">+25%</span>
      <span className="absolute top-[110px] right-1 font-num text-[10px] text-weak">−25%</span>
      {loo.map((l, i) => {
        const out = l.mre > INCONSISTENCY_THRESHOLD;
        const y = top(l.error);
        return (
          <div key={l.projectId} className="relative flex flex-col items-center" aria-hidden="true">
            <span
              className={`absolute font-num text-[10px] font-bold transition-[top,opacity] duration-500 ${out ? 'text-coral-soft' : 'text-sub'}`}
              style={{ top: revealed ? y - 24 : -40, opacity: revealed ? 1 : 0, transitionDelay: `${i * 50 + 300}ms` }}
            >
              {sign(pct(l.error))}%
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
            <span className="mt-[140px] font-num text-[10px] text-weak">{l.projectId.replace(/^PJ-/, '')}</span>
          </div>
        );
      })}
    </div>
  );
}
