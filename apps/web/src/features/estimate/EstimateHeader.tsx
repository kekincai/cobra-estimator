import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { estimatePath } from './genParam';

const TABS = [
  { key: 'overview', label: '概要' },
  { key: 'conditions', label: '条件' },
  { key: 'risk', label: 'リスク' },
  { key: 'report', label: 'レポート' },
] as const;

export type EstimateTab = (typeof TABS)[number]['key'];

/** 見積り系画面の見出し（メタ行・タイトル・説明・概要/条件/リスク/レポートの切替）。gen があれば各タブに ?gen= を付ける */
export function EstimateHeader({
  id,
  meta,
  title,
  lead,
  current,
  gen,
}: {
  id: string;
  meta: ReactNode;
  title: string;
  lead: string;
  current: EstimateTab;
  /** URL の ?gen=（世代ラベル）。タブの移動先にも引き継ぐ */
  gen?: string | null;
}) {
  const to = (key: EstimateTab) => (key === 'overview' ? '/' : estimatePath(id, key, gen));
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-sub">
          <span className="size-1.5 shrink-0 rounded-[3px] bg-teal" />
          {meta}
        </span>
        <h1 className="n m-0 text-[30px] leading-[1.1] break-words">{title}</h1>
        <span className="text-[12px] text-sub">{lead}</span>
      </div>
      <nav aria-label="見積りの表示" className="flex flex-wrap gap-1.5">
        {TABS.map((t) =>
          t.key === current ? (
            <span key={t.key} aria-current="page" className="inline-flex min-h-[30px] items-center rounded-full bg-raised px-3 text-[12px] font-medium text-text">
              {t.label}
            </span>
          ) : (
            <Link key={t.key} to={to(t.key)} className="tab-link inline-flex min-h-[30px] items-center rounded-full px-3 text-[12px] font-medium">
              {t.label}
            </Link>
          ),
        )}
      </nav>
    </header>
  );
}

/** 読み込み中・エラー・空の状態 */
export function ScreenMessage({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 pt-6 pb-10 md:px-8">
      <div className="tile p-8 text-sub">{children}</div>
    </div>
  );
}

/** 読み込み・計算の失敗（日本語の説明 + 再試行） */
export function ScreenError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="px-4 pt-6 pb-10 md:px-8">
      <div role="alert" className="tile flex flex-col items-start gap-3 p-8">
        <p className="m-0 text-[13px] text-coral-soft">{message}</p>
        {onRetry && <RetryButton onClick={onRetry} />}
      </div>
    </div>
  );
}

export function RetryButton({ onClick, label = '再試行' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn inline-flex min-h-9 cursor-pointer items-center rounded-[10px] border border-line bg-transparent px-3.5 font-[inherit] text-[12px] font-medium text-text"
    >
      {label}
    </button>
  );
}
