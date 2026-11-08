// タブ 4（モデル管理者のみ）: 申請の確認 — 「管理者へアップロード」された内容を見て承認 / 却下する。
// 承認は状態を「承認済み」にするだけ。CoBRA 標準データ（「要因を追加」の標準リスト）への反映は管理者が手で行う。
import { useMemo, useState } from 'react';
import { describeApiError } from '../../ui/apiError';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { fmtPct } from '../../ui/format';
import { useReview, useSubmissions, type SubmissionWithReview } from './api';
import { SUBMISSION_STATUS } from './ExportTab';
import { previewJson } from './exportModel';
import type { ModelFile } from './schema';
import { summarizeSubmission } from './submission';
import { cx, ghostBtn, KV, mmdd, Seg, Tile, TileHead, ymd } from './ui';

type Filter = 'pending' | 'done' | 'all';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'pending', label: 'レビュー待ち' },
  { key: 'done', label: '対応済み' },
  { key: 'all', label: 'すべて' },
];

export function ReviewTab() {
  const subs = useSubmissions(true);
  const [filter, setFilter] = useState<Filter>('pending');
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = useMemo(
    () => (subs.data ?? []).filter((s) => (filter === 'all' ? true : filter === 'pending' ? s.status === 'pending' : s.status !== 'pending')),
    [subs.data, filter],
  );
  const pendingCount = (subs.data ?? []).filter((s) => s.status === 'pending').length;
  const selected = rows.find((s) => s.id === openId) ?? rows[0] ?? null;

  return (
    <div className="grid grid-cols-1 items-start gap-4 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <Tile className="flex min-w-0 flex-col gap-3">
        <TileHead title="管理者へのアップロード" aside={`レビュー待ち ${pendingCount} 件`} />
        <span className="text-[12px] leading-[1.6] text-sub">
          「JSON を書き出す」から送られたモデルです。実績データは含まれません。承認すると申請者の画面に「承認済み」と表示されます。標準データへの反映はこの画面の外で行ってください。
        </span>
        <Seg label="表示する申請" options={FILTERS} value={filter} onChange={setFilter} />
        {subs.isError ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-[12px] text-coral-soft">
            申請を読み込めませんでした。{describeApiError(subs.error)}
            <button type="button" onClick={() => void subs.refetch()} className={ghostBtn}>
              再試行
            </button>
          </div>
        ) : subs.isLoading ? (
          <span role="status" className="text-[12px] text-sub">
            読み込み中…
          </span>
        ) : rows.length === 0 ? (
          <span className="py-2 text-[12px] text-sub">{filter === 'pending' ? 'レビュー待ちの申請はありません。' : '該当する申請はありません。'}</span>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {rows.map((s) => {
              const on = selected?.id === s.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setOpenId(s.id)}
                    className={cx(
                      'btn flex w-full cursor-pointer flex-col gap-1 rounded-xl border px-3.5 py-2.5 text-left text-text',
                      on ? 'border-line-strong bg-card-2' : 'border-line bg-transparent hover:bg-card-2',
                    )}
                  >
                    <span className="flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-1">
                      <span className="min-w-0 text-[13px] font-bold">
                        {s.submittedBy.split('@')[0]} ・ {ymd(s.createdAt) ?? ''}
                      </span>
                      <span className={cx('shrink-0 rounded-full px-2 py-[3px] text-[11px] whitespace-nowrap', SUBMISSION_STATUS[s.status].cls)}>{SUBMISSION_STATUS[s.status].label}</span>
                    </span>
                    <span className="line-clamp-2 text-[11px] break-words text-sub">{s.note || 'メモなし'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Tile>
      {selected && <SubmissionDetail key={selected.id} s={selected} />}
    </div>
  );
}

function SubmissionDetail({ s }: { s: SubmissionWithReview }) {
  const sum = useMemo(() => summarizeSubmission(s.payload), [s.payload]);
  const review = useReview();
  const [note, setNote] = useState('');
  const [ask, setAsk] = useState<'approved' | 'rejected' | null>(null);
  const pending = s.status === 'pending';
  const who = s.submittedBy.split('@')[0];

  return (
    <Tile delay={80} className="flex min-w-0 flex-col gap-3.5">
      <TileHead title={`${who} さんの申請`} aside={`${ymd(s.createdAt) ?? ''} ・ ${SUBMISSION_STATUS[s.status].label}`} />
      {s.note && (
        <p className="m-0 rounded-xl border border-line bg-bg px-3.5 py-3 text-[12px] leading-[1.6] break-words">
          <span className="font-bold text-sub">申請者のメモ: </span>
          {s.note}
        </p>
      )}
      <div className="flex flex-col gap-1 text-[12px]">
        <KV k="モデル">{sum.modelName || '(名前なし)'}{sum.version != null ? ` v${sum.version}` : ''}</KV>
        <KV k="変動要因">
          <span className="n">{sum.factors}</span>（標準由来 {sum.standard} ・ 独自 {sum.custom}）
        </KV>
        <KV k="三角分布">
          <span className="n">{sum.triangles}</span>
          {sum.experts.length ? `（${sum.experts.join(' / ')}）` : ''}
        </KV>
        <KV k="要因間の関係"><span className="n">{sum.relations}</span></KV>
        {(sum.mmre != null || sum.pred25 != null) && (
          <KV k="精度">
            {sum.mmre != null ? `MMRE ${fmtPct(sum.mmre, 1)}` : ''}
            {sum.mmre != null && sum.pred25 != null ? ' ・ ' : ''}
            {sum.pred25 != null ? `PRED(25) ${fmtPct(sum.pred25)}` : ''}
          </KV>
        )}
      </div>
      {sum.unknownFormat && <span className="text-[12px] text-warn">形式が estima-model/1 ではありません。内容を確かめてください。</span>}
      {sum.factorNames.length > 0 && (
        <details className="text-[12px]">
          <summary className="cursor-pointer text-sub">要因の一覧（{sum.factors} 件）</summary>
          <ul className="m-0 mt-1.5 grid list-none grid-cols-1 gap-x-4 gap-y-0.5 p-0 font-num text-[11.5px] @md:grid-cols-2">
            {sum.factorNames.map((n) => (
              <li key={n} className="break-words">
                {n}
              </li>
            ))}
          </ul>
          {sum.factors > sum.factorNames.length && <span className="text-[11px] text-sub">ほか {sum.factors - sum.factorNames.length} 件</span>}
        </details>
      )}
      <details className="text-[12px]">
        <summary className="cursor-pointer text-sub">JSON のプレビュー</summary>
        <pre className="m-0 mt-1.5 max-h-[320px] overflow-auto rounded-xl border border-line bg-bg px-4 py-3.5 font-num text-[11.5px] leading-[1.65] whitespace-pre-wrap break-all text-text/80">
          {s.payload && typeof s.payload === 'object' && !Array.isArray(s.payload) ? previewJson(s.payload as ModelFile) : String(JSON.stringify(s.payload))}
        </pre>
      </details>

      {pending ? (
        <div className="flex flex-col gap-2.5 border-t border-line pt-3.5">
          <label className="flex flex-col gap-1.5 text-[12px]">
            <span className="text-sub">申請者へのコメント（任意・申請者の画面に表示されます）</span>
            <textarea
              rows={3}
              value={note}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例: 要因 05 の L3 定義は標準に取り込みます。三角分布は次回の見直しで検討します。"
              className="w-full resize-y rounded-[10px] border border-line bg-bg px-3 py-2.5 text-[12px] leading-[1.6] text-text focus:border-accent focus:outline-none"
            />
          </label>
          <div className="flex flex-wrap gap-2.5">
            <button type="button" onClick={() => setAsk('approved')} className="btn min-h-10 cursor-pointer rounded-xl border-0 bg-accent px-4 text-[13px] font-bold text-bg">
              承認する
            </button>
            <button type="button" onClick={() => setAsk('rejected')} className="btn min-h-10 cursor-pointer rounded-xl border border-coral/50 bg-transparent px-4 text-[13px] font-bold text-coral-soft hover:bg-coral/10">
              却下する
            </button>
          </div>
        </div>
      ) : (
        <div role="status" className="flex flex-col gap-1 border-t border-line pt-3.5 text-[12px]">
          <span>
            <span className={cx('rounded-full px-2 py-[3px] text-[11px]', SUBMISSION_STATUS[s.status].cls)}>{SUBMISSION_STATUS[s.status].label}</span>
            {s.review && (
              <span className="ml-2 text-sub">
                {s.review.by} ・ {mmdd(s.review.at)}
              </span>
            )}
          </span>
          {s.review?.note && <span className="leading-[1.6] break-words text-sub">コメント: {s.review.note}</span>}
        </div>
      )}

      <ConfirmDialog
        open={ask != null}
        title={ask === 'approved' ? `${who} さんの申請を承認しますか` : `${who} さんの申請を却下しますか`}
        confirmLabel={ask === 'approved' ? '承認する' : '却下する'}
        danger={ask === 'rejected'}
        busy={review.isPending}
        error={review.isError ? describeApiError(review.error) : null}
        onConfirm={() => ask && review.mutate({ id: s.id, status: ask, note: note.trim() || undefined }, { onSuccess: () => setAsk(null) })}
        onCancel={() => {
          setAsk(null);
          review.reset();
        }}
      >
        <p className="m-0">
          {ask === 'approved'
            ? '申請者の画面に「承認済み」と表示されます。CoBRA 標準データへの反映は自動では行われません。'
            : '申請者の画面に「却下」と表示されます。'}
          結果はあとから変更できません。
        </p>
        {note.trim() && <p className="m-0 mt-2 break-words">コメント: {note.trim()}</p>}
      </ConfirmDialog>
    </Tile>
  );
}
