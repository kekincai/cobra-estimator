export interface HistogramBin {
  /** 0〜1（最大ビンに対する相対高さ） */
  height: number;
  /** CSS 色 */
  color: string;
}

export interface HistogramMarker {
  /** 0〜1（横軸上の位置） */
  at: number;
  color: string;
  label?: string;
}

interface HistogramProps {
  bins: HistogramBin[];
  markers?: HistogramMarker[];
  label: string;
  show?: boolean;
  /** 棒エリアの高さ px */
  height?: number;
}

/** 縦棒ヒストグラム。棒は height を CSS transition で伸ばし、左から 18ms ずつ遅らせる。 */
export function Histogram({ bins, markers = [], label, show = true, height = 150 }: HistogramProps) {
  return (
    <div className="relative" style={{ height: height + 10 }}>
      <div role="img" aria-label={label} className="absolute inset-x-0 bottom-0 flex items-end gap-1" style={{ height }}>
        {bins.map((b, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-[3px] transition-[height,background-color] duration-900 ease-out-rise"
            style={{ height: `${show ? Math.max(2, Math.round(b.height * 100)) : 0}%`, background: b.color, transitionDelay: `${i * 18}ms` }}
          />
        ))}
      </div>
      {markers.map((m, i) => {
        const left = `${Math.min(100, Math.max(0, m.at * 100))}%`;
        return (
          <div key={i} aria-hidden="true">
            <div className="absolute inset-y-0 w-0.5 transition-[left,opacity] duration-350 ease-out-rise" style={{ left, background: m.color, opacity: show ? 0.9 : 0 }} />
            {m.label && (
              <span
                className="n absolute -top-0.5 text-[10px] whitespace-nowrap transition-[left,opacity] duration-350 ease-out-rise"
                style={{ left: `calc(${left} + 6px)`, color: m.color, opacity: show ? 1 : 0, letterSpacing: 0 }}
              >
                {m.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
