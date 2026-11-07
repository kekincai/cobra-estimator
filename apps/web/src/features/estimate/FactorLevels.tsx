import type { Levels, ModelSpec } from 'cobra-core';
import { useMemo } from 'react';
import type { FactorRow } from '../../../shared/types';
import { factorNo } from '../../ui/format';

const MAX_CO = 0.6;

/** 要因のレベル入力（カテゴリごと）。CO の棒と数値は確定計算（期待値）で即時に動く。 */
export function FactorLevels({
  factors,
  spec,
  levels,
  byFactor,
  onChange,
}: {
  factors: FactorRow[];
  spec: ModelSpec;
  levels: Levels;
  byFactor: Record<string, number>;
  onChange: (factorId: string, level: number) => void;
}) {
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
          <span className="px-1.5 pt-2 pb-0.5 text-[10px] tracking-[0.08em] text-weak">{category}</span>
          {items.map((f) => {
            const lv = levels[f.id] ?? 0;
            const indirect = f.kind === 'indirect';
            const co = indirect ? spec.k * (lv / 3) : (byFactor[f.id] ?? 0);
            const name = `${factorNo(f.no)} ${f.name}${indirect ? ` (間接 → ${factorNo(noOf(f.targetFactorId))})` : ''}`;
            return (
              <div key={f.id} className="row-hover grid grid-cols-[minmax(0,1fr)_150px_56px] items-center gap-2.5 rounded-[10px] px-1.5 py-[5px]">
                <span className="flex min-w-0 flex-col gap-[3px]">
                  <span className="truncate text-[12.5px]" title={f.definition}>
                    {name}
                  </span>
                  <span className="h-[3px] w-full rounded-sm bg-raised">
                    <span
                      className={`fill block h-full rounded-sm ${lv === 3 ? 'bg-coral' : indirect ? 'bg-info' : 'bg-accent'}`}
                      style={{ width: `${Math.min(100, Math.round((co / MAX_CO) * 100))}%` }}
                    />
                  </span>
                </span>
                <span role="group" aria-label={`${f.name} のレベル`} className="inline-flex gap-[2px] justify-self-end rounded-full bg-bg p-[3px]">
                  {[0, 1, 2, 3].map((v) => {
                    const on = lv === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={on}
                        aria-label={`${name} レベル${v}`}
                        title={`L${v}: ${f.levels[v as 0 | 1 | 2 | 3]}`}
                        onClick={() => onChange(f.id, v)}
                        className={`seg n h-7 w-8 cursor-pointer rounded-full border-0 text-[12px] ${
                          on ? (v === 3 ? 'bg-coral text-bg' : 'bg-accent text-bg') : 'bg-transparent text-sub'
                        }`}
                      >
                        {v}
                      </button>
                    );
                  })}
                </span>
                <span className={`n text-right text-[12px] ${lv === 0 ? 'text-weak' : lv === 3 ? 'text-coral' : 'text-text'}`}>
                  {indirect ? `×${(1 + co).toFixed(2)}` : `+${Math.round(co * 100)}%`}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
