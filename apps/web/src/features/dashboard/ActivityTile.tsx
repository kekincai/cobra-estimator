import { fmtMDHM } from './format';
import type { FeedItem, FeedTone } from './activity';

const TONE: Record<FeedTone, string> = { accent: 'bg-accent', info: 'bg-info', teal: 'bg-teal', coral: 'bg-coral' };

/** 最近の操作（監査ログ） */
export function ActivityTile({ items, loading }: { items: FeedItem[]; loading: boolean }) {
  return (
    <div className="tile col-span-12 flex min-w-0 flex-col gap-3 px-6 py-[22px] xl:col-span-5" style={{ animationDelay: '560ms' }}>
      <span className="text-[13px] font-medium">最近の操作</span>
      {items.length === 0 ? (
        <span className="text-[12px] text-weak">{loading ? '読み込み中…' : 'まだ操作の記録がありません。構築・見積り・取り込みなどを行うとここに並びます。'}</span>
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {items.map((it, i) => (
            <li
              key={it.id}
              className={`dash-feed grid grid-cols-[18px_minmax(0,1fr)_64px] items-start gap-3 py-2 ${i > 0 ? 'border-t border-raised' : ''}`}
              style={{ animationDelay: `${650 + i * 70}ms` }}
            >
              <span className={`mt-1 ml-1 size-2.5 rounded-full ${TONE[it.tone]}`} />
              <span className="text-[12px] leading-[1.5]">
                <span className="font-medium">{it.title}</span>
                {it.sub && <> — {it.sub}</>}
              </span>
              <time dateTime={it.at} className="text-right text-[11px] text-weak">
                {fmtMDHM(it.at)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
