import type { Levels, ModelSpec } from 'cobra-core';
import { useId, useMemo, useRef, type KeyboardEvent } from 'react';
import type { FactorRow } from '../../../shared/types';
import { factorNo } from '../../ui/format';
import { nextSegIndex } from '../../ui/Segmented';

const MAX_CO = 0.6;
const LEVELS = [0, 1, 2, 3] as const;

/**
 * 要因のレベル入力（カテゴリごと）。CO の棒と数値は確定計算（期待値）で即時に動く。
 * 選んでいるレベルの意味（L0〜L3 の定義文）は行の下に常に出す（tooltip だけにしない）。
 * 0〜3 のボタンは要因ごとのラジオグループ（Tab で止まるのは選択中の 1 つ、←→↑↓ / Home / End で選択を移す）。
 * 押せる大きさは 32×32、タッチ操作（pointer: coarse）では 44×44。
 */
export function FactorLevels({
  factors,
  spec,
  levels,
  byFactor,
  onChange,
  disabled = false,
}: {
  factors: FactorRow[];
  spec: ModelSpec;
  levels: Levels;
  byFactor: Record<string, number>;
  onChange: (factorId: string, level: number) => void;
  disabled?: boolean;
}) {
  const uid = useId();
  const groups = useMemo(() => {
    const m = new Map<string, FactorRow[]>();
    for (const f of factors) {
      const list = m.get(f.category) ?? [];
      list.push(f);
      m.set(f.category, list);
    }
    return [...m];
  }, [factors]);
  const noOf = (id: string | null) => factors.find((f) => f.id === id)?.no ?? 0;

  return (
    <>
      {groups.map(([category, items]) => (
        <div key={category} role="group" aria-label={category} className="flex flex-col gap-0.5">
          <span className="px-1.5 pt-2 pb-0.5 text-[11px] tracking-[0.08em] text-sub">{category}</span>
          {items.map((f) => {
            const lv = levels[f.id] ?? 0;
            const indirect = f.kind === 'indirect';
            const co = indirect ? spec.k * (lv / 3) : (byFactor[f.id] ?? 0);
            const name = `${factorNo(f.no)} ${f.name}${indirect ? ` (間接 → ${factorNo(noOf(f.targetFactorId))})` : ''}`;
            const descId = `${uid}-${f.id}`;
            const levelText = f.levels[lv as 0 | 1 | 2 | 3];
            return (
              <div key={f.id} className="row-hover flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-[10px] px-1.5 py-[5px]">
                <span className="flex min-w-[9rem] flex-1 basis-[9rem] flex-col gap-[3px]">
                  <span className="truncate text-[12.5px]" title={f.definition}>
                    {name}
                  </span>
                  <span className="h-[3px] w-full rounded-sm bg-raised">
                    <span
                      className={`fill block h-full rounded-sm ${lv === 3 ? 'bg-coral' : indirect ? 'bg-info' : 'bg-accent'}`}
                      style={{ width: `${Math.min(100, Math.round((co / MAX_CO) * 100))}%` }}
                    />
                  </span>
                  {levelText && (
                    <span id={descId} className="truncate text-[11px] text-sub" title={levelText}>
                      L{lv}: {levelText}
                    </span>
                  )}
                </span>
                <span className="ml-auto flex items-center gap-2.5">
                  <LevelRadios
                    label={`${factorNo(f.no)} ${f.name} のレベル`}
                    itemLabel={(v) => `${factorNo(f.no)} ${f.name} レベル ${v}`}
                    title={(v) => `L${v}: ${f.levels[v]}`}
                    value={lv}
                    describedBy={levelText ? descId : undefined}
                    disabled={disabled}
                    onChange={(v) => onChange(f.id, v)}
                  />
                  <span className={`n w-14 text-right text-[12px] ${lv === 0 ? 'text-sub' : lv === 3 ? 'text-coral' : 'text-text'}`}>
                    {indirect ? `×${(1 + co).toFixed(2)}` : `+${Math.round(co * 100)}%`}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}

/** 1 要因の 0〜3 のラジオグループ（WAI-ARIA APG Radio Group。方向キーで選択も移る） */
function LevelRadios({
  label,
  itemLabel,
  title,
  value,
  describedBy,
  disabled,
  onChange,
}: {
  label: string;
  itemLabel: (v: 0 | 1 | 2 | 3) => string;
  title: (v: 0 | 1 | 2 | 3) => string;
  value: number;
  describedBy?: string;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = LEVELS.findIndex((v) => v === value);
  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (disabled) return;
    const next = nextSegIndex(e.key, selected, LEVELS.length);
    if (next === null) return;
    e.preventDefault();
    refs.current[next]?.focus();
    if (next !== selected) onChange(LEVELS[next]!);
  };
  return (
    <span
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      className="inline-flex gap-[2px] rounded-full bg-bg p-[3px]"
    >
      {LEVELS.map((v, i) => {
        const on = value === v;
        return (
          <button
            key={v}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={itemLabel(v)}
            aria-describedby={on ? describedBy : undefined}
            tabIndex={on || (selected < 0 && i === 0) ? 0 : -1}
            title={title(v)}
            disabled={disabled}
            onClick={() => onChange(v)}
            className={`seg n size-[32px] cursor-pointer rounded-full border-0 text-[12px] pointer-coarse:size-[44px] pointer-coarse:text-[14px] disabled:cursor-not-allowed disabled:opacity-50 ${
              on ? (v === 3 ? 'bg-coral text-bg' : 'bg-accent text-bg') : 'bg-transparent text-sub'
            }`}
          >
            {v}
          </button>
        );
      })}
    </span>
  );
}
