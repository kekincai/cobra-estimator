import { useLayoutEffect, useRef, useState } from 'react';
import { fmt1 } from './format';
import { exceedLabel, exceedWithP } from './percentile';
import { bandRange, placeLabels, placeRefLabel, rangePct, stableRange, type AxisRange, type LabelLayout } from './pbandLayout';
import { useMounted } from './useMounted';

const GAP = 8;

interface Measured {
  /** 帯の幅 px */
  width: number;
  /** P20 / P50 / P80 / P95 ラベルの自然な幅 */
  labelW: number[];
  refW: number;
  loW: number;
  hiW: number;
}

const sameMeasure = (a: Measured | null, b: Measured) =>
  !!a && a.width === b.width && a.refW === b.refW && a.loW === b.loW && a.hiW === b.hiW && a.labelW.every((w, i) => w === b.labelW[i]);

/**
 * P20〜P95 の見込み幅の帯（ラベルは超過確率が主、P 値は title / aria の補助）。P20〜P80 を強調色、P80〜P95 を薄色、P50 に縦マーカー。
 * reference があれば帯の下に ▲（例: 保存済みの世代）を置く。
 *
 * - ラベルは幅に余裕があれば各値の真上に置き、近い値どうしは重ならないようにずらす（ui/pbandLayout.ts の placeLabels）。
 *   1 段に置けないとき（狭い画面・値がほぼ同じ）は 4 列に並べる。
 * - ▲ のラベルは ▲ の右隣（入らなければ左隣）に置き、目盛りの両端（lo / hi）と重ならないようにする。どちらにも入らなければ次の行に回す。
 * - 目盛りの範囲は表示中は広げる方向にだけ動く（stableRange）。レベルを動かすたびに目盛りが揺れない。
 *   basis を渡すと最初からその範囲（例: 保存済み世代の P20〜P95）も含める。
 */
export function PBand({
  p20,
  p50,
  p80,
  p95,
  reference,
  basis,
}: {
  p20: number;
  p50: number;
  p80: number;
  p95: number;
  reference?: { value: number; label: string } | null;
  /** 目盛りに必ず含める値（保存済み世代の P20 / P95 など）。省略可 */
  basis?: readonly number[];
}) {
  const mounted = useMounted();
  const refV = reference?.value ?? p50;
  const need = bandRange([p20, p95, refV, ...(basis ?? [])]);
  // 前回の範囲を state に持ち、広げる方向にだけ更新する（レンダー中の state 更新は React の「前回の値から導く」パターン）
  const [held, setHeld] = useState<AxisRange>(need);
  const range = stableRange(held, need);
  if (range !== held) setHeld(range);
  const { lo, hi } = range;
  const pct = (x: number) => rangePct(x, range);

  const values = [
    [20, p20],
    [50, p50],
    [80, p80],
    [95, p95],
  ] as const;

  // 実際の幅を測ってからラベルを置く（文字サイズの変更・200% 拡大にも追従する）
  const bandRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [m, setM] = useState<Measured | null>(null);
  useLayoutEffect(() => {
    const read = () => {
      const band = bandRef.current;
      const box = measureRef.current;
      if (!band || !box) return;
      const ws = [...box.children].map((el) => (el as HTMLElement).getBoundingClientRect().width);
      const next: Measured = { width: band.clientWidth, labelW: ws.slice(0, 4), refW: ws[4] ?? 0, loW: ws[5] ?? 0, hiW: ws[6] ?? 0 };
      setM((prev) => (sameMeasure(prev, next) ? prev : next));
    };
    read();
    const ro = new ResizeObserver(read);
    if (bandRef.current) ro.observe(bandRef.current);
    if (measureRef.current) for (const el of measureRef.current.children) ro.observe(el);
    return () => ro.disconnect();
  });

  const layout: LabelLayout = m
    ? placeLabels(
        values.map(([, v], i) => ({ x: (pct(v) / 100) * m.width, w: m.labelW[i] ?? 0 })),
        m.width,
        GAP,
      )
    : { mode: 'columns' };
  const refPlace =
    reference && m ? placeRefLabel({ x: (pct(reference.value) / 100) * m.width, w: m.refW }, { loW: m.loW, hiW: m.hiW }, m.width, GAP) : null;

  const label = (p: 20 | 50 | 80 | 95, v: number) => (
    <>
      <span>{exceedLabel(p)}</span>
      <span className="font-num text-sub">{fmt1(v)}</span>
    </>
  );
  const loText = String(lo);
  const hiText = `${hi} 人月`;

  return (
    <div className="relative flex min-w-0 flex-col gap-1.5">
      {/* 幅の計測用（見えない・読み上げない）。大きさ 0 の枠で切り、横スクロールを生まない */}
      <div aria-hidden="true" className="pointer-events-none invisible absolute top-0 left-0 size-0 overflow-hidden">
        <div ref={measureRef} className="flex w-max text-[11px] leading-tight whitespace-nowrap *:shrink-0">
          {values.map(([p, v]) => (
            <span key={p} className="flex flex-col">
              {label(p, v)}
            </span>
          ))}
          <span className="font-num">{reference?.label ?? ''}</span>
          <span className="font-num">{loText}</span>
          <span className="font-num">{hiText}</span>
        </div>
      </div>

      {layout.mode === 'positioned' ? (
        <div className="relative text-[11px] leading-tight text-weak" aria-hidden="true">
          {/* 高さを取るための見えない 1 つ */}
          <span className="invisible flex flex-col">{label(20, p20)}</span>
          {values.map(([p, v], i) => (
            <span
              key={p}
              className="mk absolute top-0 flex flex-col items-center whitespace-nowrap"
              style={{ left: layout.left[i] }}
              title={exceedWithP(p)}
            >
              {label(p, v)}
            </span>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2 text-[11px] leading-tight text-weak" aria-hidden="true">
          {values.map(([p, v]) => (
            <span key={p} className="flex min-w-0 flex-col items-start last:items-end last:text-right" title={exceedWithP(p)}>
              {label(p, v)}
            </span>
          ))}
        </div>
      )}

      <div
        ref={bandRef}
        role="img"
        aria-label={`見込み幅 ${values.map(([p, v]) => `${exceedWithP(p)} ${fmt1(v)}`).join('、')} 人月${
          reference ? `。${reference.label}` : ''
        }。目盛り ${lo}〜${hi} 人月`}
        className="relative h-3 rounded-md bg-raised"
      >
        <div className="mk absolute inset-y-0 rounded-md bg-accent" style={{ left: `${pct(p20)}%`, width: `${pct(p80) - pct(p20)}%`, opacity: mounted ? 0.9 : 0 }} />
        <div className="mk absolute inset-y-0 rounded-r-md bg-slate" style={{ left: `${pct(p80)}%`, width: `${pct(p95) - pct(p80)}%`, opacity: mounted ? 1 : 0 }} />
        <div
          className="mk absolute -inset-y-[3px] w-1 rounded-sm border border-accent bg-bg"
          style={{ left: `calc(${pct(p50)}% - 2px)`, opacity: mounted ? 1 : 0 }}
        />
        {reference && (
          <div
            className="mk absolute top-[14px] size-0 border-x-[5px] border-b-[6px] border-x-transparent border-b-sub"
            style={{ left: `calc(${pct(reference.value)}% - 5px)`, opacity: mounted ? 1 : 0 }}
          />
        )}
      </div>

      <div className="relative flex justify-between font-num text-[11px] text-weak" aria-hidden="true">
        <span>{loText}</span>
        <span>{hiText}</span>
        {/* ▲ の印の右隣（入らなければ左隣）に文字だけを置く */}
        {reference && refPlace?.row === 0 && (
          <span className="mk absolute top-0 whitespace-nowrap text-sub" style={{ left: refPlace.left }}>
            {reference.label}
          </span>
        )}
      </div>
      {reference && refPlace?.row !== 0 && (
        <div className="-mt-1 font-num text-[11px] text-sub" aria-hidden="true" style={{ paddingLeft: refPlace?.left ?? 0 }}>
          ▲ {reference.label}
        </div>
      )}
    </div>
  );
}
