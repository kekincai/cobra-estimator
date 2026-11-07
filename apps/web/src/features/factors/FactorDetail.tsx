// 変動要因画面の右側: 定義・レベル・三角分布の編集、関係、削除。
import { useState } from 'react';
import { Link } from 'react-router';
import { availableTargets } from '../../../shared/factor-rules';
import { ApiError } from '../../data/api';
import { LevelBadge } from '../../ui/LevelBadge';
import { TriangleShape } from '../../ui/TriangleShape';
import { factorNo, fmt1 } from '../../ui/format';
import { fromPct, toPct, useDeleteFactor, useUpdateFactor, type FactorRow } from './data';

export interface TriDraft {
  expert: string;
  b: string;
  l: string;
  w: string;
}
export interface FactorDraft {
  definition: string;
  levels: [string, string, string, string];
  tris: TriDraft[];
  targetFactorId: string | null;
}

export const draftFromRow = (f: FactorRow): FactorDraft => ({
  definition: f.definition,
  levels: [...f.levels],
  tris: f.triangles.map((t) => ({ expert: t.expert, b: String(toPct(t.best)), l: String(toPct(t.likely)), w: String(toPct(t.worst)) })),
  targetFactorId: f.targetFactorId,
});

export const triNums = (t: TriDraft): [number, number, number] => [fromPct(t.b), fromPct(t.l), fromPct(t.w)];

/** 担当者 e の三角分布（%）。'平均' または該当者がいなければ平均。 */
export function triOf(d: FactorDraft, expert: string): [number, number, number] {
  const own = d.tris.find((t) => t.expert === expert);
  if (own && expert !== AVERAGE) return triNums(own);
  const ns = d.tris.map(triNums);
  if (!ns.length) return [0, 0, 0];
  const avg = (i: number) => Math.round((ns.reduce((s, t) => s + t[i]!, 0) / ns.length) * 10) / 10;
  return [avg(0), avg(1), avg(2)];
}

export const AVERAGE = '平均';

const statBox = 'flex flex-col gap-0.5 rounded-[10px] bg-bg px-3 py-2.5';

export function FactorDetail({
  factor,
  factors,
  draft,
  dirty,
  expert,
  experts,
  setDraft,
  resetDraft,
  stats,
  canEdit,
  onDeleted,
}: {
  factor: FactorRow;
  factors: FactorRow[];
  draft: FactorDraft;
  dirty: boolean;
  expert: string;
  experts: string[];
  /** 関数で更新（連続入力で古い値に戻らないように） */
  setDraft: (fn: (d: FactorDraft) => FactorDraft) => void;
  resetDraft: () => void;
  stats: { genLabel: string; level: number | null; l3n: number; total: number; contrib: string };
  canEdit: boolean;
  onDeleted: () => void;
}) {
  const update = useUpdateFactor();
  const del = useDeleteFactor();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saved, setSaved] = useState(false);
  const [shownId, setShownId] = useState(factor.id);
  if (shownId !== factor.id) {
    // 別の要因に切り替えたら確認・メッセージを消す
    setShownId(factor.id);
    setConfirmDelete(false);
    setSaved(false);
    if (update.error) update.reset();
    if (del.error) del.reset();
  }

  const indirect = factor.kind === 'indirect';
  const helper = factors.find((f) => f.kind === 'indirect' && f.targetFactorId === factor.id);
  const targets = availableTargets(factors, factor.id);
  const badOrder = draft.tris.some((t) => {
    const [b, l, w] = triNums(t);
    return !(b <= l && l <= w);
  });
  const missingTarget = indirect && !draft.targetFactorId;

  const set = (patch: Partial<FactorDraft>) => {
    setSaved(false);
    setDraft((d) => ({ ...d, ...patch }));
  };
  const setTri = (i: number, k: 'b' | 'l' | 'w', v: string) => {
    setSaved(false);
    setDraft((d) => ({ ...d, tris: d.tris.map((t, j) => (j === i ? { ...t, [k]: v } : t)) }));
  };

  const save = () => {
    if (badOrder || missingTarget) return;
    update.mutate(
      {
        id: factor.id,
        patch: {
          definition: draft.definition,
          levels: draft.levels,
          triangles: draft.tris.map((t) => {
            const [b, l, w] = triNums(t);
            return { expert: t.expert, best: b / 100, likely: l / 100, worst: w / 100 };
          }),
          ...(indirect ? { targetFactorId: draft.targetFactorId } : {}),
        },
      },
      { onSuccess: () => { resetDraft(); setSaved(true); } },
    );
  };

  const cur = triOf(draft, expert);
  const otherName = expert === AVERAGE ? (experts[0] ?? AVERAGE) : (experts.find((e) => e !== expert) ?? AVERAGE);
  const other = triOf(draft, otherName);
  const err = (update.error ?? del.error) as Error | null;
  const errMsg = err ? (err instanceof ApiError ? err.message : '保存できませんでした。') : null;

  return (
    <aside aria-label="要因の詳細" className="tile fx-static col-span-12 flex min-w-0 flex-col gap-3.5 px-[26px] py-6 xl:col-span-5" style={{ animationDelay: '240ms' }}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="n m-0 text-[20px]">
          {factorNo(factor.no)} {factor.name}
        </h2>
        <div className="flex items-center gap-1.5">
          <span className="whitespace-nowrap rounded-full bg-raised px-2.5 py-1 text-[11px] font-bold text-sub">{indirect ? '間接要因' : '直接要因'}</span>
          <button
            type="button"
            className="btn inline-flex size-8 cursor-pointer items-center justify-center rounded-full border border-muted bg-transparent text-sub hover:text-coral disabled:cursor-default disabled:opacity-40"
            aria-label="この要因を削除"
            disabled={!canEdit}
            onClick={() => setConfirmDelete(true)}
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
          </button>
        </div>
      </div>

      {confirmDelete && (
        <div role="alertdialog" aria-label="削除の確認" className="fx-pane flex flex-col gap-2 rounded-[10px] border border-coral-line bg-coral-soft-bg px-3 py-2.5 text-[12px]">
          <span>
            「{factor.name}」をモデルから削除します。実績・見積りに入っているこの要因のレベル値は使われなくなります。
            {helper && <span className="text-coral-soft"> 間接要因「{helper.name}」がこの要因を強めているため、先にそちらを削除してください。</span>}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn min-h-8 cursor-pointer rounded-lg border-0 bg-coral px-3 text-[12px] font-bold text-bg disabled:opacity-50"
              disabled={!!helper || del.isPending}
              onClick={() => del.mutate(factor.id, { onSuccess: () => { setConfirmDelete(false); onDeleted(); } })}
            >
              削除する
            </button>
            <button type="button" className="btn min-h-8 cursor-pointer rounded-lg border border-muted bg-transparent px-3 text-[12px] text-text" onClick={() => setConfirmDelete(false)}>
              やめる
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <div className={statBox}><span className="text-[10px] text-sub">現在の見積り {stats.genLabel}</span><span className="n text-[16px]">{stats.level === null ? '—' : `L${stats.level}`}</span></div>
        <div className={statBox}><span className="text-[10px] text-sub">実績での L3 件数</span><span className="n text-[16px]">{stats.l3n} / {stats.total}</span></div>
        <div className={statBox}><span className="text-[10px] text-sub">寄与 ({stats.genLabel})</span><span className="n text-[16px]">{stats.contrib}</span></div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-sub">定義</span>
        <textarea rows={2} aria-label="定義" className="fx-field" value={draft.definition} disabled={!canEdit} onChange={(e) => set({ definition: e.target.value })} />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-sub">レベル定義 0 → 3</span>
        {draft.levels.map((t, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <LevelBadge level={i} />
            <input
              type="text"
              className="fx-field"
              aria-label={`L${i}`}
              value={t}
              disabled={!canEdit}
              onChange={(e) => {
                const v = e.target.value;
                setSaved(false);
                setDraft((d) => {
                  const levels = [...d.levels] as FactorDraft['levels'];
                  levels[i] = v;
                  return { ...d, levels };
                });
              }}
            />
          </div>
        ))}
      </div>

      {(indirect || helper) && (
        <div className="flex items-center gap-2.5 rounded-[10px] bg-bg px-3 py-2.5 text-[12px]">
          <span className="rounded-full bg-raised px-2 py-[3px] text-[10px] text-sub">{(indirect ? factor.name : helper!.name) + ' (間接)'}</span>
          <span className="text-weak">→ 強める →</span>
          {indirect ? (
            <select
              aria-label="強める直接要因"
              className="cursor-pointer rounded-full border-0 bg-raised px-2 py-[3px] font-[inherit] text-[10px] text-text"
              value={draft.targetFactorId ?? ''}
              disabled={!canEdit}
              onChange={(e) => set({ targetFactorId: e.target.value || null })}
            >
              {!draft.targetFactorId && <option value="">選択してください</option>}
              {targets.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          ) : (
            <span className="rounded-full bg-raised px-2 py-[3px] text-[10px] text-text">{factor.name}</span>
          )}
          <Link to="/model/relations" className="ml-auto text-[11px]">関係図</Link>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-line pt-2.5">
        <span className="text-[11px] text-sub">三角分布 — レベル 3 での工数増加率 (%)。担当者ごとに入力</span>
        <div className="grid grid-cols-[70px_repeat(3,minmax(0,1fr))] gap-2 text-[10px] text-weak"><span /><span>最良</span><span>最頻</span><span>最悪</span></div>
        {draft.tris.map((t, i) => {
          const [b, l, w] = triNums(t);
          const bad = !(b <= l && l <= w);
          const active = expert === t.expert || expert === AVERAGE;
          return (
            <div key={t.expert} className="grid grid-cols-[70px_repeat(3,minmax(0,1fr))] items-center gap-2">
              <span className={`text-[12px] font-medium ${active ? 'text-text' : 'text-weak'}`}>{t.expert}</span>
              {(['b', 'l', 'w'] as const).map((k, j) => (
                <input
                  key={k}
                  type="text"
                  inputMode="decimal"
                  className={`fx-field n ${bad ? 'fx-bad' : ''}`}
                  aria-label={`${t.expert} ${['最良', '最頻', '最悪'][j]}`}
                  aria-invalid={bad || undefined}
                  value={t[k]}
                  disabled={!canEdit}
                  onChange={(e) => setTri(i, k, e.target.value)}
                />
              ))}
            </div>
          );
        })}
        {badOrder && <span className="text-[11px] text-coral-soft">最良 ≤ 最頻 ≤ 最悪 の順になるように入力してください。</span>}
        <TriangleShape
          series={[
            { tri: other, stroke: 'var(--color-line-strong)', dashed: true },
            { tri: cur, stroke: 'var(--accent)', fill: 'var(--accent)' },
          ]}
          peakOf={1}
        />
        <span className="text-[11px] text-weak">実線は {expert}、点線は {otherName}。モデル構築で「平均」を選ぶと両者の平均を使います。</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          className="btn min-h-[42px] cursor-pointer rounded-[10px] border-0 bg-accent px-[18px] text-[13px] font-bold text-bg disabled:cursor-default disabled:bg-raised disabled:text-weak"
          disabled={!canEdit || !dirty || badOrder || missingTarget || update.isPending}
          onClick={save}
        >
          {update.isPending ? '保存中…' : '保存'}
        </button>
        <button
          type="button"
          className="btn min-h-[42px] cursor-pointer rounded-[10px] border border-muted bg-transparent px-3.5 text-[13px] font-medium text-text disabled:cursor-default disabled:text-weak"
          disabled={!dirty}
          onClick={() => { resetDraft(); update.reset(); }}
        >
          元に戻す
        </button>
        <span role="status" className={`ml-auto text-[11px] ${errMsg ? 'text-coral-soft' : 'text-weak'}`}>
          {errMsg ?? (saved ? '保存しました。モデルの再構築が必要です' : !canEdit ? '読み取り専用です' : '変更後はモデルの再構築が必要')}
        </span>
      </div>
    </aside>
  );
}

export const contribLabel = (factor: FactorRow, contrib: number | undefined, multiplier: number) =>
  factor.kind === 'indirect' ? `×${multiplier.toFixed(2)}` : contrib === undefined ? '—' : `${fmt1(contrib)} 人月`;
