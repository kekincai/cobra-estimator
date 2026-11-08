// 確認ダイアログ（ネイティブ <dialog>。Esc で閉じ、閉じたら呼び出し元へフォーカスが戻る）。
// 取り消しにくい操作（見積りに使うモデルの切替、ユーザー削除、権限変更、取り込み確定など）の前に使う。
import { useEffect, useId, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** 破壊的な操作は coral の確定ボタンにする */
  danger?: boolean;
  busy?: boolean;
  /** 確定ボタン下に出すエラー（describeApiError の結果など） */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel = 'キャンセル', danger, busy, error, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={children ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      className="m-auto max-h-[calc(100dvh-32px)] max-w-[calc(100vw-32px)] overflow-auto border-0 bg-transparent p-0 text-text backdrop:bg-bg/75"
    >
      {open && (
        <div className="flex w-[440px] max-w-full flex-col gap-4 rounded-[16px] border border-muted bg-card px-6 py-5">
          <h2 id={titleId} className="m-0 text-[16px] font-bold">
            {title}
          </h2>
          {children && (
            <div id={descId} className="text-[13px] leading-relaxed text-sub">
              {children}
            </div>
          )}
          {error && (
            <p role="alert" className="m-0 text-[12px] text-coral-soft">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="btn inline-flex min-h-10 cursor-pointer items-center rounded-[10px] border border-line bg-transparent px-4 text-[13px] text-text disabled:opacity-60"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              autoFocus
              className={`btn inline-flex min-h-10 cursor-pointer items-center rounded-[10px] border-0 px-4 text-[13px] font-bold disabled:opacity-60 ${danger ? 'bg-coral text-bg' : 'bg-accent text-bg'}`}
            >
              {busy ? '処理中…' : confirmLabel}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
