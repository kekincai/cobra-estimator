// 読み込み中・エラー・要確認の小さな部品（ダッシュボード専用）。
import { useState } from 'react';
import { Link } from 'react-router';

export function RetryButton({ onClick, label = '再試行' }: { onClick: () => void | Promise<unknown>; label?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onClick();
        } finally {
          setBusy(false);
        }
      }}
      className="btn inline-flex min-h-9 cursor-pointer items-center rounded-[10px] border border-line bg-card px-3 font-sans text-[12px] font-medium text-text disabled:cursor-progress disabled:opacity-60"
    >
      {busy ? '再読み込み中…' : label}
    </button>
  );
}

/** ページ上部のエラー（describeApiError 済みの文言 + 再試行） */
export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void | Promise<unknown> }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl bg-coral-bg px-4 py-3 text-coral-ink">
      <p className="m-0 min-w-0 text-[13px] leading-relaxed">{message}</p>
      {onRetry && <RetryButton onClick={onRetry} />}
    </div>
  );
}

/**
 * 「要確認 N 件」。件数があるときはモデル構築（確認事項の一覧）へのリンク、0 件はただの状態表示、
 * 読み込み中・エラーは件数を断言しない（—）。
 */
export function ReviewBadge({ status, count }: { status: 'loading' | 'error' | 'ready'; count: number }) {
  if (status === 'ready' && count > 0) {
    return (
      <Link
        to="/model/build"
        aria-label={`要確認 ${count} 件 — モデル構築で確認する`}
        className="btn inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-line bg-card px-3 text-[12px] text-text no-underline"
      >
        <span aria-hidden="true" className="size-[7px] rounded-full bg-coral" />
        要確認 {count} 件
        <span aria-hidden="true" className="text-sub">
          →
        </span>
      </Link>
    );
  }
  return (
    <span className="inline-flex min-h-10 items-center gap-2 px-1 text-[12px] text-sub">
      <span aria-hidden="true" className={`size-[7px] rounded-full ${status === 'ready' ? 'bg-ok' : 'bg-muted'}`} />
      {status === 'ready' ? '要確認 0 件' : '要確認 —'}
      {status !== 'ready' && <span className="sr-only">{status === 'loading' ? '（読み込み中）' : '（読み込めませんでした）'}</span>}
    </span>
  );
}
