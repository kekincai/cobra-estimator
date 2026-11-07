// セグメントボタン（設計稿の「L0 L1 L2 L3」「FP / KLOC / 画面数」「S.T. / Y.T. / 平均」など）。
// 各項目は <button aria-pressed>。選択中は強調色、L3 などは tone で珊瑚色にできる。
import type { ReactNode } from 'react';

export interface SegOption<T> {
  value: T;
  label: ReactNode;
  /** 選択時の色。既定は強調色 */
  tone?: 'accent' | 'coral';
  /** スクリーンリーダー向けのラベル（label が記号だけのとき） */
  ariaLabel?: string;
}

interface Props<T> {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  /** グループ全体の名前 */
  label: string;
  /** 外枠: field = 入力欄と同じ枠付き（角丸 10）、pill = 枠なし丸型、bare = 背景なし */
  frame?: 'field' | 'pill' | 'pill-card' | 'bare';
  /** 項目の高さ px */
  height?: number;
  /** 項目の角丸: pill = 999px、box = 8px */
  itemShape?: 'pill' | 'box';
  /** 数字フォント */
  numeric?: boolean;
  size?: 'xs' | 'sm';
  className?: string;
  disabled?: boolean;
}

const FRAME = {
  field: 'inline-flex gap-0.5 rounded-[10px] border border-line bg-bg p-[3px]',
  pill: 'inline-flex gap-0.5 rounded-full bg-bg p-[3px]',
  'pill-card': 'inline-flex gap-0.5 rounded-full bg-card p-[3px]',
  bare: 'inline-flex gap-0.5',
} as const;

export function Segmented<T extends string | number>({
  options, value, onChange, label, frame = 'field', height = 32, itemShape = 'pill', numeric, size = 'xs', className = '', disabled,
}: Props<T>) {
  return (
    <div role="group" aria-label={label} className={`${FRAME[frame]} ${className}`}>
      {options.map((o) => {
        const on = o.value === value;
        const bg = on ? (o.tone === 'coral' ? 'bg-coral text-bg' : 'bg-accent text-bg') : 'bg-transparent text-sub hover:text-text';
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={on}
            aria-label={o.ariaLabel}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            style={{ minHeight: height }}
            className={`btn cursor-pointer border-0 font-bold whitespace-nowrap disabled:cursor-not-allowed ${
              itemShape === 'pill' ? 'rounded-full' : 'rounded-[8px]'
            } ${size === 'xs' ? 'px-2.5 text-[11px]' : 'px-3 text-[12px]'} ${numeric ? 'font-num' : ''} ${bg}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
