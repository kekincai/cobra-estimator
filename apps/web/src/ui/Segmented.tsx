/** セグメントボタン（ピル型）。各項目は <button aria-pressed>。 */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <span role="group" aria-label={label} className="inline-flex gap-[2px] rounded-full bg-bg p-[3px]">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`min-h-7 cursor-pointer rounded-full border-0 px-3 font-[inherit] text-[11px] font-bold transition-colors ${on ? 'bg-raised text-text' : 'bg-transparent text-sub hover:text-text'}`}
          >
            {o.label}
          </button>
        );
      })}
    </span>
  );
}
