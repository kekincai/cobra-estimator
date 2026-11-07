import type { GenerationRow } from '../../../shared/types';
import { fmt1, fmtInt } from '../../ui/format';
import { useMounted } from '../../ui/useMounted';
import { genNo, resultsOf } from './context';

const MAX = 5;

export const shortDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

/** 世代の比較（最大 5）。カードを押すとレポートにする世代を選ぶ。 */
export function GenerationStrip({
  gens,
  reportGenId,
  onSelect,
  current,
  busyId,
}: {
  gens: GenerationRow[];
  reportGenId: string | null;
  onSelect: (id: string) => void;
  /** いま画面に出ている推定値（棒の最大値に含める） */
  current: number;
  busyId: string | null;
}) {
  const mounted = useMounted();
  const maxMed = Math.max(current, ...gens.map((g) => resultsOf(g)?.p50 ?? 0)) || 1;
  const last = gens.at(-1);
  const nextNo = gens.reduce((m, g) => Math.max(m, genNo(g.label)), 0) + 1;
  const empties = Array.from({ length: Math.max(0, MAX - gens.length) }, (_, i) => (i === 0 ? `G${nextNo} — 次の実行で保存` : `G${nextNo + i}`));

  return (
    <div className="grid grid-cols-5 gap-2.5">
      {gens.map((g, i) => {
        const r = resultsOf(g);
        const isLast = g === last;
        const isReport = g.id === reportGenId;
        return (
          <button
            key={g.id}
            type="button"
            aria-pressed={isReport}
            aria-label={`${g.label} 推定 ${r ? fmt1(r.p50) : '—'} 人月。${isReport ? 'レポートに使用中' : 'レポートに使う'}`}
            disabled={busyId !== null}
            onClick={() => onSelect(g.id)}
            className={`pop flex min-h-[112px] cursor-pointer flex-col gap-1 rounded-[14px] border bg-bg px-3.5 py-3 text-left font-[inherit] text-text transition-colors hover:border-line-strong disabled:cursor-progress ${
              isReport ? 'border-accent hover:border-accent' : 'border-line'
            }`}
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <span className="flex w-full items-center justify-between">
              <span className={`n text-[13px] ${isLast ? 'text-accent' : 'text-weak'}`}>{g.label}</span>
              <span className="text-[10px] whitespace-nowrap text-weak">{shortDate(g.createdAt)}</span>
            </span>
            <span className="n text-[24px]">{r ? fmt1(r.p50) : '—'}</span>
            <span className="w-full truncate text-[11px] text-sub">
              {fmtInt(g.sizeFP)} FP ・ {r ? `+${Math.round(r.scoExpected * 100)}%` : '—'}
            </span>
            {isReport && <span className="text-[10px] text-accent">レポートに使用</span>}
            <span className="mt-auto h-[5px] w-full rounded-[3px] bg-raised">
              <span
                className={`fill block h-full rounded-[3px] ${isLast ? 'bg-accent' : 'bg-line-strong'}`}
                style={{ width: `${mounted && r ? Math.round((r.p50 / maxMed) * 100) : 0}%` }}
              />
            </span>
          </button>
        );
      })}
      {empties.map((label) => (
        <div
          key={label}
          className="box-border flex min-h-[112px] items-center justify-center rounded-[14px] border border-dashed border-muted p-3.5 text-center text-[11px] text-weak"
        >
          {label}
        </div>
      ))}
    </div>
  );
}
