// 要因レベル L0〜L3 の小さなチップ列（実績一覧など）。L3 は珊瑚色。
const CLS = [
  'bg-raised text-weak',
  'bg-lv1-bg text-lv1',
  'bg-lv2-bg text-text',
  'bg-coral text-bg',
] as const;

export function LevelChips({ levels, label }: { levels: number[]; label?: string }) {
  return (
    <span className="inline-flex gap-[3px]" role="img" aria-label={label ?? `要因レベル ${levels.join(', ')}`}>
      {levels.map((v, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`inline-flex size-[22px] items-center justify-center rounded-[6px] font-num text-[11px] font-bold ${CLS[Math.max(0, Math.min(3, v))]}`}
        >
          {v}
        </span>
      ))}
    </span>
  );
}
