// 一覧の右に出す 5 本のミニ棒。中央の棒の高さ = 最頻値（0〜120%）。
export function TriSpark({ likely, on, height = 26, width }: { likely: number; on: boolean; height?: number; width?: number }) {
  const peak = Math.round(40 + (Math.min(120, Math.max(0, likely)) / 120) * 60);
  return (
    <span aria-hidden="true" className="flex items-end gap-0.5" style={{ height, width }}>
      <span className="h-[20%] w-1/5 rounded-[2px] bg-muted" />
      <span className="h-[55%] w-1/5 rounded-[2px] bg-line-strong" />
      <span className={`tri-shape inline-block w-1/5 rounded-[2px] ${on ? 'bg-accent' : 'bg-info'}`} style={{ height: `${peak}%` }} />
      <span className="h-[65%] w-1/5 rounded-[2px] bg-line-strong" />
      <span className="h-[30%] w-1/5 rounded-[2px] bg-muted" />
    </span>
  );
}
