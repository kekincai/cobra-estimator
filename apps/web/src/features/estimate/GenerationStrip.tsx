import { Link } from 'react-router';
import type { GenerationRow } from '../../../shared/types';
import { fmt1, fmtInt } from '../../ui/format';
import { useMounted } from '../../ui/useMounted';
import { genNo, resultsOf } from './context';
import { fmtSco } from './display';
import { estimatePath } from './genParam';

const MAX = 5;

export const shortDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

/**
 * 世代の比較（最大 5）。カードを押すとレポートにする世代を選ぶ。
 * 各カードの「この条件を開く」で、その世代の条件を編集の元として開く（?gen=）。
 */
export function GenerationStrip({
  estimateId,
  gens,
  reportGenId,
  baseGenId,
  droppedGenId,
  onSelect,
  current,
  busyId,
}: {
  estimateId: string;
  gens: GenerationRow[];
  reportGenId: string | null;
  /** いま編集の元にしている世代 */
  baseGenId: string | null;
  /** 次の実行で削除される世代（5 世代保存済みのとき） */
  droppedGenId: string | null;
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
    <div className="grid grid-cols-[repeat(auto-fit,minmax(112px,1fr))] gap-2.5">
      {gens.map((g, i) => {
        const r = resultsOf(g);
        const isLast = g === last;
        const isReport = g.id === reportGenId;
        const isBase = g.id === baseGenId;
        const willDrop = g.id === droppedGenId;
        return (
          <div
            key={g.id}
            className={`gen-pop flex min-h-[112px] min-w-0 flex-col gap-1.5 rounded-[14px] border bg-bg px-3.5 py-3 transition-colors has-[button:hover]:border-line-strong ${
              isReport ? 'border-accent has-[button:hover]:border-accent' : willDrop ? 'border-coral-line' : 'border-line'
            }`}
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <button
              type="button"
              aria-pressed={isReport}
              aria-label={`${g.label} 推定 ${r ? fmt1(r.p50) : '—'} 人月。${isReport ? 'レポートに使用中' : 'レポートに使う'}`}
              disabled={busyId !== null}
              onClick={() => onSelect(g.id)}
              className="flex w-full cursor-pointer flex-col gap-1 border-0 bg-transparent p-0 text-left font-[inherit] text-text disabled:cursor-progress"
            >
              <span className="flex w-full items-center justify-between gap-1">
                <span className={`n text-[13px] ${isLast ? 'text-accent' : 'text-sub'}`}>{g.label}</span>
                <span className="text-[11px] whitespace-nowrap text-sub">{shortDate(g.createdAt)}</span>
              </span>
              <span className="n text-[24px]">{r ? fmt1(r.p50) : '—'}</span>
              <span className="w-full truncate text-[11px] text-sub">
                {fmtInt(g.sizeFP)} FP ・ {r ? fmtSco(r.scoExpected) : '—'}
              </span>
              {isReport && <span className="text-[11px] text-accent">レポートに使用</span>}
              {willDrop && <span className="text-[11px] text-coral-soft">次の実行で削除</span>}
            </button>
            <span className="mt-auto h-[5px] w-full rounded-[3px] bg-raised" aria-hidden="true">
              <span
                className={`fill block h-full rounded-[3px] ${isLast ? 'bg-accent' : 'bg-line-strong'}`}
                style={{ width: `${mounted && r ? Math.round((r.p50 / maxMed) * 100) : 0}%` }}
              />
            </span>
            {isBase ? (
              <span className="inline-flex min-h-6 items-center text-[11px] text-sub">編集の元</span>
            ) : (
              <Link to={estimatePath(estimateId, 'conditions', g.label)} className="inline-flex min-h-6 items-center text-[11px]" aria-label={`${g.label} の条件を開く`}>
                この条件を開く
              </Link>
            )}
          </div>
        );
      })}
      {empties.map((label) => (
        <div
          key={label}
          className="box-border flex min-h-[112px] min-w-0 items-center justify-center rounded-[14px] border border-dashed border-muted p-3.5 text-center text-[11px] text-sub"
        >
          {label}
        </div>
      ))}
    </div>
  );
}
