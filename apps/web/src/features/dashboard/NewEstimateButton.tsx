// 「+ 新しい見積り」: 名前と（任意の）予算を入れて POST /api/estimates で新規作成し、/estimate/:id へ移る。
// 見た目は ui/ConfirmDialog と揃える（ネイティブ <dialog>、Esc で閉じ、閉じたら呼び出し元へフォーカスが戻る）。
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { apiSend, qk } from '../../data/api';
import { describeApiError } from '../../ui/apiError';
import { validateNewEstimate } from './newEstimate';

export function NewEstimateButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="btn inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-[10px] border-0 bg-accent px-3.5 font-sans text-[12px] font-bold text-bg"
      >
        + 新しい見積り
      </button>
      <NewEstimateDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function NewEstimateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const nameId = useId();
  const budgetId = useId();
  const nameErrId = useId();
  const budgetErrId = useId();
  const [name, setName] = useState('');
  const [budget, setBudget] = useState('');
  const [touched, setTouched] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const create = useMutation({
    mutationFn: (body: { name: string; budget: number | null }) => apiSend<{ id: string }>('POST', '/estimates', body),
    onSuccess: async ({ id }) => {
      await qc.invalidateQueries({ queryKey: qk.estimates });
      onClose();
      navigate(`/estimate/${encodeURIComponent(id)}`);
    },
  });

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setName('');
      setBudget('');
      setTouched(false);
      create.reset();
      d.showModal();
      requestAnimationFrame(() => nameRef.current?.focus());
    }
    if (!open && d.open) d.close();
    // create.reset は安定しているので open の変化だけを見る
  }, [open]);

  const v = validateNewEstimate(name, budget);
  const busy = create.isPending;

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    setTouched(true);
    if (!v.ok || busy) return;
    create.mutate(v.value);
  };

  const nameErr = touched ? v.errors.name : undefined;
  const budgetErr = touched || budget ? v.errors.budget : undefined;

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-32px)] max-w-[calc(100vw-32px)] overflow-auto border-0 bg-transparent p-0 text-text backdrop:bg-bg/75"
    >
      {open && (
        <form noValidate onSubmit={submit} className="flex w-[440px] max-w-full flex-col gap-4 rounded-[16px] border border-muted bg-card px-6 py-5">
          <h2 id={titleId} className="m-0 text-[16px] font-bold">
            新しい見積り
          </h2>
          <p className="m-0 text-[13px] leading-relaxed text-sub">見積りを作成して、工数見積りの画面で条件を入れて実行します。最初の実行が G1 になります。</p>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={nameId} className="text-[12px] font-medium">
              見積りの名前 <span className="text-coral-soft">（必須）</span>
            </label>
            <input
              id={nameId}
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!nameErr}
              aria-describedby={nameErr ? nameErrId : undefined}
              required
              maxLength={120}
              placeholder="例: 顧客ポータル刷新"
              className="box-border min-h-10 w-full rounded-[10px] border border-line bg-bg px-3 font-sans text-[13px] text-text"
            />
            {nameErr && (
              <span id={nameErrId} className="text-[12px] text-coral-soft">
                {nameErr}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={budgetId} className="text-[12px] font-medium">
              予算（人月・任意）
            </label>
            <input
              id={budgetId}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              inputMode="decimal"
              aria-invalid={!!budgetErr}
              aria-describedby={budgetErr ? budgetErrId : undefined}
              placeholder="例: 45"
              className="box-border min-h-10 w-full max-w-[160px] rounded-[10px] border border-line bg-bg px-3 font-sans text-[13px] text-text"
            />
            {budgetErr && (
              <span id={budgetErrId} className="text-[12px] text-coral-soft">
                {budgetErr}
              </span>
            )}
          </div>

          {create.error && (
            <p role="alert" className="m-0 text-[12px] text-coral-soft">
              {describeApiError(create.error, '見積りを作成できませんでした。時間をおいて再試行してください。')}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="btn inline-flex min-h-10 cursor-pointer items-center rounded-[10px] border border-line bg-transparent px-4 font-sans text-[13px] text-text disabled:opacity-60"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={busy}
              className="btn inline-flex min-h-10 cursor-pointer items-center rounded-[10px] border-0 bg-accent px-4 font-sans text-[13px] font-bold text-bg disabled:opacity-60"
            >
              {busy ? '作成中…' : '作成して開く'}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
