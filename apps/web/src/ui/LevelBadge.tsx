// L0〜L3 の丸バッジ。L3 は珊瑚色。
export function LevelBadge({ level, size = 30 }: { level: number; size?: number }) {
  const l3 = level === 3;
  return (
    <span
      className={`n inline-flex shrink-0 items-center justify-center rounded-full ${l3 ? 'bg-coral text-bg' : 'bg-raised text-sub'}`}
      style={{ width: size, height: size, fontSize: size >= 30 ? 11 : 10 }}
    >
      L{level}
    </span>
  );
}
