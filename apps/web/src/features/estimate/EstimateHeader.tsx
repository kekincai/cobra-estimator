import type { ReactNode } from 'react';
import { Link } from 'react-router';

const TABS = [
  { key: 'overview', label: '概要', to: () => '/' },
  { key: 'conditions', label: '条件', to: (id: string) => `/estimate/${id}` },
  { key: 'risk', label: 'リスク', to: (id: string) => `/estimate/${id}/risk` },
  { key: 'report', label: 'レポート', to: (id: string) => `/estimate/${id}/report` },
] as const;

export type EstimateTab = (typeof TABS)[number]['key'];

/** 見積り系画面の見出し（メタ行・タイトル・説明・概要/条件/リスク/レポートの切替） */
export function EstimateHeader({ id, meta, title, lead, current }: { id: string; meta: ReactNode; title: string; lead: string; current: EstimateTab }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="inline-flex items-center gap-2 text-[11px] text-sub">
          <span className="size-1.5 rounded-[3px] bg-teal" />
          {meta}
        </span>
        <h1 className="n m-0 text-[30px] leading-[1.1]">{title}</h1>
        <span className="text-[12px] text-sub">{lead}</span>
      </div>
      <nav aria-label="見積りの表示" className="flex gap-1.5">
        {TABS.map((t) =>
          t.key === current ? (
            <span key={t.key} aria-current="page" className="inline-flex min-h-[30px] items-center rounded-full bg-raised px-3 text-[12px] font-medium text-text">
              {t.label}
            </span>
          ) : (
            <Link key={t.key} to={t.to(id)} className="tab-link inline-flex min-h-[30px] items-center rounded-full px-3 text-[12px] font-medium">
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
    <div className="px-8 pt-6 pb-10">
      <div className="tile p-8 text-sub">{children}</div>
    </div>
  );
}
