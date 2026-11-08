// セグメントボタン（設計稿の「L0 L1 L2 L3」「FP / KLOC / 画面数」「S.T. / Y.T. / 平均」など）。
// 既定は各項目が <button aria-pressed>（Tab で 1 つずつ）。radio を付けると role="radiogroup" + role="radio" になり、
// Tab 停止は選択中の 1 つだけ、←→↑↓ / Home / End で選択を移す（WAI-ARIA APG Radio Group）。
// 選択中は強調色、L3 などは tone で珊瑚色にできる。
import { useRef, type KeyboardEvent, type ReactNode } from 'react';

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
  /** 単一選択のラジオグループとして振る舞う（方向キー + roving tabindex）。既定 false = aria-pressed のボタン列 */
  radio?: boolean;
}

/** 方向キーで移る先の添字（端で循環）。対象外のキーは null */
export function nextSegIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  const i = current < 0 ? 0 : current;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (i + 1) % count;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (i - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

const FRAME = {
  field: 'inline-flex gap-0.5 rounded-[10px] border border-line bg-bg p-[3px]',
  pill: 'inline-flex gap-0.5 rounded-full bg-bg p-[3px]',
  'pill-card': 'inline-flex gap-0.5 rounded-full bg-card p-[3px]',
  bare: 'inline-flex gap-0.5',
} as const;

export function Segmented<T extends string | number>({
  options, value, onChange, label, frame = 'field', height = 32, itemShape = 'pill', numeric, size = 'xs', className = '', disabled, radio = false,
}: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = options.findIndex((o) => o.value === value);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!radio || disabled) return;
    const next = nextSegIndex(e.key, selected, options.length);
    if (next === null) return;
    e.preventDefault();
    refs.current[next]?.focus();
    if (next !== selected) onChange(options[next]!.value);
  };
  return (
    <div role={radio ? 'radiogroup' : 'group'} aria-label={label} aria-disabled={radio && disabled ? true : undefined} onKeyDown={onKeyDown} className={`${FRAME[frame]} ${className}`}>
      {options.map((o, i) => {
        const on = o.value === value;
        const bg = on ? (o.tone === 'coral' ? 'bg-coral text-bg' : 'bg-accent text-bg') : 'bg-transparent text-sub hover:text-text';
        return (
          <button
            key={String(o.value)}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role={radio ? 'radio' : undefined}
            aria-pressed={radio ? undefined : on}
            aria-checked={radio ? on : undefined}
            tabIndex={radio ? (on || (selected < 0 && i === 0) ? 0 : -1) : undefined}
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
