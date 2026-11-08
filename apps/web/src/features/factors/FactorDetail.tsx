// 変動要因画面の右側: 定義・レベル・三角分布の編集、関係、削除。
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { availableTargets } from '../../../shared/factor-rules';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { HelpLink } from '../../ui/HelpLink';
import { LevelBadge } from '../../ui/LevelBadge';
import { TriangleShape } from '../../ui/TriangleShape';
import { describeApiError } from '../../ui/apiError';
import { factorNo, fmt1 } from '../../ui/format';
import { issuesOf } from './api';
import { useDeleteFactor, useUpdateFactor, type FactorRow } from './data';
import { AVERAGE, checkDraft, dfid, draftFromRow, patchFromDraft, triOf, type FactorDraft } from './draft';
import { errorsFromIssues } from './formCheck';
import { fmtMultiplier, TRI_KEYS, TRI_LABEL } from './triangle';

export { AVERAGE, draftFromRow, triOf, type FactorDraft, type TriDraft } from './draft';

const statBox = 'flex flex-col gap-0.5 rounded-[10px] bg-bg px-3 py-2.5';
/** DOM の id（新規追加フォームと衝突しないよう d- を付ける） */
const domId = (field: string) => `d-${field}`;
const errId = (field: string) => `d-${field}-err`;

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
  k,
  onDeleted,
  onPick,
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
  /** 間接要因の係数（L3 で 1 + k 倍） */
  k: number;
  onDeleted: () => void;
  /** 別の要因を選ぶ（削除できない理由の要因を開くとき） */
  onPick: (id: string) => void;
}) {
  const update = useUpdateFactor();
  const del = useDeleteFactor();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tried, setTried] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [shownId, setShownId] = useState(factor.id);
  const rootRef = useRef<HTMLElement>(null);
  if (shownId !== factor.id) {
    // 別の要因に切り替えたら確認・メッセージを消す
    setShownId(factor.id);
    setConfirmDelete(false);
    setSaved(false);
    setTried(false);
    setServerErrors({});
    if (update.error) update.reset();
    if (del.error) del.reset();
  }

  const indirect = factor.kind === 'indirect';
  const helper = factors.find((f) => f.kind === 'indirect' && f.targetFactorId === factor.id);
  const targets = availableTargets(factors, factor.id);
  const check = checkDraft(draft, indirect);
  // 入力中の欄の検査 + サーバーが返した欄のエラー（入力し直したら消す）
  const errors = { ...serverErrors, ...check.errors };
  const errOf = (field: string) => errors[field];

  const touch = () => {
    setSaved(false);
    if (Object.keys(serverErrors).length) setServerErrors({});
  };
  const set = (patch: Partial<FactorDraft>) => {
    touch();
    setDraft((d) => ({ ...d, ...patch }));
  };
  const setTri = (i: number, key: 'b' | 'l' | 'w', v: string) => {
    touch();
    setDraft((d) => ({ ...d, tris: d.tris.map((t, j) => (j === i ? { ...t, [key]: v } : t)) }));
  };
  const focusField = (field: string | null) => {
    if (!field) return;
    rootRef.current?.querySelector<HTMLElement>(`#${CSS.escape(domId(field))}`)?.focus();
  };

  const save = () => {
    setTried(true);
    const patch = patchFromDraft(draft, factor, indirect);
    if (!patch) {
      focusField(check.first);
      return;
    }
    update.mutate(
      { id: factor.id, patch },
      {
        onSuccess: () => {
          resetDraft();
          setSaved(true);
          setTried(false);
        },
        onError: (e) => {
          const fe = errorsFromIssues(issuesOf(e));
          setServerErrors(fe);
          focusField(Object.keys(fe)[0] ?? null);
        },
      },
    );
  };

  const cur = triOf(draft, expert);
  const otherName = expert === AVERAGE ? (experts[0] ?? AVERAGE) : (experts.find((e) => e !== expert) ?? AVERAGE);
  const other = triOf(draft, otherName);
  // 不正な入力の間は、保存済みの値で形を描く
  const saved0 = draftFromRow(factor);
  const shapeCur = cur ?? triOf(saved0, expert) ?? [0, 0, 0];
  const shapeOther = other ?? triOf(saved0, otherName) ?? [0, 0, 0];
  const nErr = Object.keys(errors).length;
  const status = update.error
    ? describeApiError(update.error, '保存できませんでした。時間をおいて再試行してください。')
    : tried && nErr
      ? `入力に誤りがあります (${nErr} 件)。赤枠の欄を確認してください。`
      : null;

  const fieldCls = (field: string) => `fx-field ${errOf(field) ? 'fx-bad' : ''}`;
  const errorText = (field: string) =>
    errOf(field) ? (
      <span key={field} id={errId(field)} className="text-[11px] text-coral-soft">
        {errOf(field)}
      </span>
    ) : null;
  const describedBy = (...fields: string[]) => fields.filter((f) => errOf(f)).map(errId).join(' ') || undefined;

  return (
    <aside
      ref={rootRef}
      id="factor-detail"
      aria-label="要因の詳細"
      className="tile fx-static col-span-12 flex min-w-0 scroll-mt-4 flex-col gap-3.5 px-4 py-5 sm:px-[26px] sm:py-6 xl:col-span-5"
      style={{ animationDelay: '240ms' }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="n m-0 min-w-0 text-[20px] [overflow-wrap:anywhere]">
          {factorNo(factor.no)} {factor.name}
        </h2>
        <div className="flex shrink-0 items-center gap-1.5">
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

      {helper ? (
        <ConfirmDialog
          open={confirmDelete}
          title="この要因は削除できません"
          confirmLabel={`「${helper.name}」を開く`}
          cancelLabel="閉じる"
          onConfirm={() => {
            setConfirmDelete(false);
            onPick(helper.id);
          }}
          onCancel={() => setConfirmDelete(false)}
        >
          間接要因「{helper.name}」が「{factor.name}」を強めています。先に「{helper.name}」を削除するか、強める対象を別の直接要因に変えてください。
        </ConfirmDialog>
      ) : (
        <ConfirmDialog
          open={confirmDelete}
          title={`「${factor.name}」を削除しますか？`}
          confirmLabel="削除する"
          cancelLabel="やめる"
          danger
          busy={del.isPending}
          error={del.error ? describeApiError(del.error, '削除できませんでした。時間をおいて再試行してください。') : null}
          onConfirm={() => del.mutate(factor.id, { onSuccess: () => { setConfirmDelete(false); onDeleted(); } })}
          onCancel={() => {
            setConfirmDelete(false);
            del.reset();
          }}
        >
          「{factor.name}」をモデルから削除します。実績・見積りに入っているこの要因のレベル値は使われなくなります。元に戻すことはできません。
        </ConfirmDialog>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(96px,1fr))] gap-2">
        <div className={statBox}><span className="text-[11px] text-sub">現在の見積り {stats.genLabel}</span><span className="n text-[16px]">{stats.level === null ? '—' : `L${stats.level}`}</span></div>
        <div className={statBox}><span className="text-[11px] text-sub">実績での L3 件数</span><span className="n text-[16px]">{stats.l3n} / {stats.total}</span></div>
        <div className={statBox}><span className="text-[11px] text-sub">{indirect ? `倍率 (${stats.genLabel})` : `寄与 (${stats.genLabel})`}</span><span className="n text-[16px]">{stats.contrib}</span></div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={domId(dfid.def)} className="text-[11px] text-sub">定義</label>
        <textarea
          id={domId(dfid.def)}
          rows={2}
          className={fieldCls(dfid.def)}
          value={draft.definition}
          disabled={!canEdit}
          aria-invalid={!!errOf(dfid.def) || undefined}
          aria-describedby={describedBy(dfid.def)}
          onChange={(e) => set({ definition: e.target.value })}
        />
        {errorText(dfid.def)}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-sub">レベル定義 0 → 3</span>
        {draft.levels.map((t, i) => (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex items-center gap-2.5">
              <LevelBadge level={i} />
              <input
                id={domId(dfid.level(i))}
                type="text"
                className={fieldCls(dfid.level(i))}
                aria-label={`L${i}`}
                aria-invalid={!!errOf(dfid.level(i)) || undefined}
                aria-describedby={describedBy(dfid.level(i))}
                value={t}
                disabled={!canEdit}
                onChange={(e) => {
                  const v = e.target.value;
                  touch();
                  setDraft((d) => {
                    const levels = [...d.levels] as FactorDraft['levels'];
                    levels[i] = v;
                    return { ...d, levels };
                  });
                }}
              />
            </div>
            {errorText(dfid.level(i))}
          </div>
        ))}
      </div>

      {(indirect || helper) && (
        <div className="flex flex-col gap-2 rounded-[10px] bg-bg px-3 py-2.5 text-[12px]">
          {indirect ? (
            <>
              <label htmlFor={domId(dfid.target)} className="text-[11px] text-sub">
                強める直接要因 <span className="text-weak">(L3 で CO が {fmtMultiplier(1 + k)})</span>
              </label>
              <select
                id={domId(dfid.target)}
                className={`${fieldCls(dfid.target)} cursor-pointer`}
                value={draft.targetFactorId ?? ''}
                disabled={!canEdit}
                aria-invalid={!!errOf(dfid.target) || undefined}
                aria-describedby={describedBy(dfid.target)}
                onChange={(e) => set({ targetFactorId: e.target.value || null })}
              >
                {!draft.targetFactorId && <option value="">選択してください</option>}
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {factorNo(t.no)} {t.name}
                  </option>
                ))}
              </select>
              {errorText(dfid.target)}
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="whitespace-nowrap rounded-full bg-raised px-2 py-[3px] text-[11px] text-sub">{helper!.name} (間接)</span>
              <span className="whitespace-nowrap text-sub">→ 強める →</span>
              <span className="whitespace-nowrap rounded-full bg-raised px-2 py-[3px] text-[11px] text-text">{factor.name}</span>
            </div>
          )}
          <Link to={`/model/relations?f=${factor.id}`} className="self-end whitespace-nowrap text-[11px]">
            関係図で見る
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-line pt-2.5">
        <span className="flex items-start justify-between gap-2 text-[11px] text-sub">
          <span>
            {indirect
              ? `三角分布 (参考値) — 間接要因の分布は工数の計算には使われません。工数には「強める直接要因の CO × 倍率」として入ります`
              : '三角分布 — レベル 3 での工数増加率 (%)。担当者ごとに入力'}
          </span>
          <HelpLink section="factors" className="size-6! shrink-0 text-[11px]!" />
        </span>
        <div aria-hidden="true" className="grid grid-cols-[minmax(48px,70px)_repeat(3,minmax(0,1fr))] gap-2 text-[11px] text-sub"><span /><span>最良</span><span>最頻</span><span>最悪</span></div>
        {draft.tris.map((t, i) => {
          const active = expert === t.expert || expert === AVERAGE;
          const rowErr = dfid.row(i);
          return (
            <div key={t.expert} className="flex flex-col gap-1">
              <div className="grid grid-cols-[minmax(48px,70px)_repeat(3,minmax(0,1fr))] items-center gap-2">
                <span className={`truncate text-[12px] font-medium ${active ? 'text-text' : 'text-sub'}`}>{t.expert}</span>
                {TRI_KEYS.map((key) => {
                  const field = dfid.tri(i, key);
                  const bad = !!errOf(field) || !!errOf(rowErr);
                  return (
                    <input
                      key={key}
                      id={domId(field)}
                      type="text"
                      inputMode="decimal"
                      className={`fx-field n min-w-0 ${bad ? 'fx-bad' : ''}`}
                      aria-label={`${t.expert} ${TRI_LABEL[key]} (%)`}
                      aria-invalid={bad || undefined}
                      aria-describedby={describedBy(field, rowErr)}
                      value={t[key]}
                      disabled={!canEdit}
                      onChange={(e) => setTri(i, key, e.target.value)}
                    />
                  );
                })}
              </div>
              {TRI_KEYS.map((key) => errorText(dfid.tri(i, key)))}
              {errorText(rowErr)}
            </div>
          );
        })}
        <TriangleShape
          series={[
            { tri: shapeOther, stroke: 'var(--color-line-strong)', dashed: true },
            { tri: shapeCur, stroke: 'var(--accent)', fill: 'var(--accent)' },
          ]}
          peakOf={1}
        />
        <span className="text-[11px] text-sub">
          実線は {expert}、点線は {otherName}。モデル構築で「平均」を選ぶと両者の平均を使います。{!cur || !other ? '入力に誤りがある間は、保存済みの値で形を表示しています。' : ''}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          className="btn min-h-[42px] cursor-pointer rounded-[10px] border-0 bg-accent px-[18px] text-[13px] font-bold text-bg disabled:cursor-default disabled:bg-raised disabled:text-weak"
          disabled={!canEdit || !dirty || update.isPending}
          onClick={save}
        >
          {update.isPending ? '保存中…' : '保存'}
        </button>
        <button
          type="button"
          className="btn min-h-[42px] cursor-pointer rounded-[10px] border border-muted bg-transparent px-3.5 text-[13px] font-medium text-text disabled:cursor-default disabled:text-weak"
          disabled={!dirty}
          onClick={() => {
            resetDraft();
            update.reset();
            setTried(false);
            setServerErrors({});
          }}
        >
          元に戻す
        </button>
        <span role="status" className={`ml-auto min-w-0 text-[11px] ${status ? 'text-coral-soft' : 'text-sub'}`}>
          {status ??
            (saved ? (
              <>
                保存しました。モデルの再構築が必要です — <Link to="/model/build">モデル構築へ</Link>
              </>
            ) : !canEdit ? (
              '読み取り専用です'
            ) : dirty ? (
              '未保存の変更があります。保存後はモデルの再構築が必要です'
            ) : (
              '変更後はモデルの再構築が必要'
            ))}
        </span>
      </div>
    </aside>
  );
}

export const contribLabel = (factor: FactorRow, contrib: number | undefined, multiplier: number) =>
  factor.kind === 'indirect' ? fmtMultiplier(multiplier) : contrib === undefined ? '—' : `${fmt1(contrib)} 人月`;
