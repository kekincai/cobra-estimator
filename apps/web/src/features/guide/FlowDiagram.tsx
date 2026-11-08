// 6 段階のノード + 流れる辺 + 戻りループ。辺はノードの実寸を測って SVG で描く（幅に追従）。
import { useLayoutEffect, useRef, useState } from 'react';
import { FLOW_LOOPS, FLOW_STAGES } from './flowStages';

interface Box {
  l: number;
  r: number;
  t: number;
  b: number;
  cx: number;
}

const RISK_STEP = 4;
const LOOP_DROP = 44;

export function FlowDiagram({ active, onPick }: { active: number; onPick: (i: number) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const nodes = useRef<(HTMLButtonElement | null)[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const o = el.getBoundingClientRect();
      setSize({ w: o.width, h: o.height });
      setBoxes(
        nodes.current.map((n) => {
          // transform（浮き上がり）の影響を受けないよう offset 系で測る
          const l = n?.offsetLeft ?? 0;
          const t = n?.offsetTop ?? 0;
          const w = n?.offsetWidth ?? 0;
          const h = n?.offsetHeight ?? 0;
          return { l, r: l + w, t, b: t + h, cx: l + w / 2 };
        }),
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 1 行に 6 つ並んでいるときだけ辺を描く（狭い画面では折り返すので省略）
  const oneRow = boxes.length === 6 && boxes.every((b) => Math.abs(b.t - boxes[0]!.t) < 2);
  const midY = (b: Box) => b.t + Math.min(59, (b.b - b.t) / 2);
  const rowBottom = oneRow ? Math.max(...boxes.map((b) => b.b)) : 0;
  const loopY = rowBottom + LOOP_DROP;

  return (
    <div ref={wrap} className="relative" style={{ paddingBottom: oneRow ? LOOP_DROP + 20 : 0 }}>
      {oneRow && (
        <svg className="pointer-events-none absolute inset-0" width={size.w} height={size.h} aria-hidden="true">
          {boxes.slice(0, -1).map((b, i) => {
            const n = boxes[i + 1]!;
            const d = `M ${b.r} ${midY(b)} H ${n.l}`;
            const on = i < active;
            return (
              <g key={i}>
                <path d={d} fill="none" stroke="var(--color-line)" strokeWidth="2" />
                <path d={d} fill="none" strokeWidth="2" strokeLinecap="round" strokeDasharray="6 10" stroke={on ? 'var(--color-accent)' : 'transparent'} className={on ? 'flow-dash' : undefined} />
              </g>
            );
          })}
          {FLOW_LOOPS.map((lp) => {
            const a = boxes[lp.from]!;
            const z = boxes[lp.to]!;
            const d = `M ${a.cx} ${a.b} V ${loopY} H ${z.cx} V ${z.b + 12}`;
            const on = active === lp.from;
            return (
              <g key={lp.from}>
                <path d={d} fill="none" stroke="var(--color-line-strong)" strokeWidth="1.5" strokeDasharray="4 6" />
                <path d={d} fill="none" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="4 6" stroke={on ? 'var(--color-accent)' : 'transparent'} opacity={0.8} className={on ? 'flow-dash-slow' : undefined} />
                <path d={`M ${z.cx - 6} ${z.b + 14} L ${z.cx} ${z.b + 4} L ${z.cx + 6} ${z.b + 14} Z`} fill="var(--color-line-strong)" />
              </g>
            );
          })}
        </svg>
      )}

      <ol className="relative m-0 grid list-none grid-cols-2 gap-4 p-0 md:grid-cols-3 lg:grid-cols-6 lg:gap-11">
        {FLOW_STAGES.map((s, i) => {
          const act = i === active;
          const done = i < active;
          const col = i === RISK_STEP ? 'var(--color-coral)' : 'var(--color-accent)';
          return (
            <li key={s.no} className="flex">
              <button
                ref={(el) => {
                  nodes.current[i] = el;
                }}
                type="button"
                aria-current={act ? 'step' : undefined}
                onClick={() => onPick(i)}
                className="flow-node flex min-h-[118px] w-full cursor-pointer flex-col items-start gap-1.5 rounded-[14px] px-4 py-3.5 text-left text-text"
                style={{
                  animationDelay: `${i * 90}ms`,
                  background: act ? 'var(--color-card-2)' : 'var(--color-card)',
                  border: `1px solid ${act ? col : done ? 'var(--color-line-strong)' : 'var(--color-line)'}`,
                  boxShadow: act ? `0 0 0 4px color-mix(in srgb, ${col} 13%, transparent), 0 12px 32px rgba(0,0,0,.35)` : 'none',
                  // 未到達の段も文字のコントラストを落とさない（透明度で薄めない）
                  transform: act ? 'translateY(-4px)' : 'none',
                }}
              >
                <span className="flex w-full items-center justify-between">
                  <span className="n text-[12px]" style={{ color: act || done ? col : 'var(--color-sub)' }}>
                    {s.no}
                  </span>
                  {/* 「現在」「✓」だと利用者自身の進捗に見えるので、選んでいる段だけ「表示中」と出す */}
                  {act && (
                    <span className="rounded-full px-[7px] py-px text-[11px] font-bold" style={{ color: 'var(--color-bg)', background: col }}>
                      表示中
                    </span>
                  )}
                </span>
                <span className="text-[14px] font-bold">{s.t}</span>
                <span className="text-[11px] leading-[1.5] text-sub">{s.sub}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {oneRow &&
        FLOW_LOOPS.map((lp) => {
          const a = boxes[lp.from]!;
          const z = boxes[lp.to]!;
          return (
            <div
              key={lp.from}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-line-strong bg-bg px-3 py-[5px] text-[11px] whitespace-nowrap text-sub"
              style={{ left: (a.cx + z.cx) / 2, top: loopY }}
            >
              {lp.label}
            </div>
          );
        })}
    </div>
  );
}
