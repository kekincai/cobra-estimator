// 画面内で使うチップ・セグメントボタン（設計稿のスタイルそのまま）。
import type { ReactNode } from 'react';

/** カテゴリ絞り込みのチップ（選択中は raised 背景） */
export function FilterChip({ on, onClick, children, small }: { on: boolean; onClick: () => void; children: ReactNode; small?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`fx-chip cursor-pointer rounded-full border-0 px-3 text-[12px] font-medium ${small ? 'min-h-[30px]' : 'min-h-8'} ${on ? 'bg-raised text-text' : 'bg-transparent text-sub hover:text-text'}`}
    >
      {children}
    </button>
  );
}

/** 黒地のトラックに並ぶセグメント（選択中は強調色） */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  size = 'sm',
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: 'xs' | 'sm';
  disabled?: boolean;
}) {
  return (
    <span role="group" aria-label={label} className="inline-flex gap-0.5 rounded-full bg-bg p-[3px]">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`fx-chip cursor-pointer rounded-full border-0 font-bold disabled:cursor-default ${size === 'xs' ? 'min-h-7 px-2.5 text-[11px]' : 'min-h-7 px-3 text-[11px]'} ${on ? 'bg-accent text-bg' : 'bg-transparent text-sub'}`}
          >
            {o.label}
          </button>
        );
      })}
    </span>
  );
}
