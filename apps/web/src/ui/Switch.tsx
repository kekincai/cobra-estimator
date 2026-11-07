// オン/オフのスイッチ（40×22）。role="switch" の <button>。
interface Props {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** 読み上げ用。例「除外する: PJ-001」 */
  label: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, disabled }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[22px] w-10 shrink-0 cursor-pointer rounded-full border-0 p-0 transition-[background] duration-250 disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? 'bg-accent' : 'bg-muted'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-[3px] left-[3px] size-4 rounded-full transition-transform duration-250 ease-out-rise ${
          checked ? 'translate-x-[18px] bg-bg' : 'translate-x-0 bg-sub'
        }`}
      />
    </button>
  );
}
