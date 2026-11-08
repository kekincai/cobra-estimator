import { fmtMDHM } from './format';
import type { FeedItem, FeedTone } from './activity';
import { RetryButton } from './StateViews';

const TONE: Record<FeedTone, string> = { accent: 'bg-accent', info: 'bg-info', teal: 'bg-teal', coral: 'bg-coral' };

interface Props {
  items: FeedItem[];
  status: 'loading' | 'error' | 'ready';
  /** describeApiError 済みの文言 */
  error?: string | null;
  onRetry?: () => void;
}

/** 最近の操作（監査ログ） */
export function ActivityTile({ items, status, error, onRetry }: Props) {
  return (
    <div className="tile col-span-12 flex min-w-0 flex-col gap-3 px-5 py-[22px] sm:px-6 xl:col-span-5" style={{ animationDelay: '560ms' }} aria-busy={status === 'loading'}>
      <h2 className="m-0 text-[13px] font-medium">最近の操作</h2>
      {status === 'loading' ? (
        <span className="text-[12px] text-sub">読み込み中…</span>
      ) : status === 'error' ? (
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[12px] text-sub">{error ?? '操作の記録を読み込めませんでした。'}</span>
          {onRetry && <RetryButton onClick={onRetry} />}
        </div>
      ) : items.length === 0 ? (
        <span className="text-[12px] text-sub">まだ操作の記録がありません。構築・見積り・取り込みなどを行うとここに並びます。</span>
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {items.map((it, i) => (
            <li
              key={it.id}
              className={`dash-feed grid grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-x-3 py-2 ${i > 0 ? 'border-t border-raised' : ''}`}
              style={{ animationDelay: `${650 + i * 70}ms` }}
            >
              <span aria-hidden="true" className={`mt-1 ml-1 size-2.5 rounded-full ${TONE[it.tone]}`} />
              <span className="min-w-0 text-[12px] leading-[1.5] break-words">
                <span className="font-medium">{it.title}</span>
                {it.sub && <> — {it.sub}</>}
                <span className="text-sub"> ・ {it.actor}</span>
              </span>
              <time dateTime={it.at} className="n text-right text-[11px] whitespace-nowrap text-weak">
                {fmtMDHM(it.at)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
