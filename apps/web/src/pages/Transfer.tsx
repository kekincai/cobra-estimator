// /transfer 取り込み / 書き出し（design/Transfer.dc.html）
// タブ: JSON を取り込む / JSON を書き出す / CSV で実績を取り込む（+ モデル管理者には「申請の確認」）。
// ?tab=json|export|csv|review で直接開ける。一度開いたタブは隠すだけで残すので、切り替えても読み込んだファイルや選択は消えない。
import { useRef, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router';
import { useMe, useModel, useProjects } from '../data/api';
import { useSubmissions } from '../features/transfer/api';
import { CsvTab } from '../features/transfer/CsvTab';
import { ExportTab } from '../features/transfer/ExportTab';
import { ImportTab } from '../features/transfer/ImportTab';
import { ReviewTab } from '../features/transfer/ReviewTab';
import type { Handoff, TransferTab } from '../features/transfer/tabs';
import { cx, ghostBtn } from '../features/transfer/ui';
import { describeApiError } from '../ui/apiError';
import { HelpLink } from '../ui/HelpLink';

const ALL_TABS: readonly { key: TransferTab; label: string }[] = [
  { key: 'json', label: 'JSON を取り込む' },
  { key: 'export', label: 'JSON を書き出す' },
  { key: 'csv', label: 'CSV で実績を取り込む' },
  { key: 'review', label: '申請の確認' },
];

export default function TransferPage() {
  const [params, setParams] = useSearchParams();
  const model = useModel();
  const projects = useProjects();
  const me = useMe();
  const user = me.data?.user ?? null;
  const isAdmin = user?.role === 'admin';
  const tabs = ALL_TABS.filter((t) => t.key !== 'review' || isAdmin);
  const tab: TransferTab = tabs.find((t) => t.key === params.get('tab'))?.key ?? 'json';
  const bundle = model.data;
  const pjs = projects.data;
  const subs = useSubmissions(isAdmin);
  const pending = isAdmin ? (subs.data ?? []).filter((s) => s.status === 'pending').length : 0;

  // 開いたことのあるタブ（隠して残す）
  const [visited, setVisited] = useState<Set<TransferTab>>(() => new Set([tab]));
  if (!visited.has(tab)) setVisited(new Set(visited).add(tab));
  const [handoff, setHandoff] = useState<Handoff | null>(null);

  const tabRefs = useRef<Partial<Record<TransferTab, HTMLButtonElement | null>>>({});
  const go = (k: TransferTab, file?: File) => {
    setParams(k === 'json' ? {} : { tab: k }, { replace: true });
    if (file) setHandoff({ tab: k, file, seq: Date.now() });
  };
  // ← → Home End でタブを移る（WAI-ARIA tabs、選択も移る）
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.key === tab);
    const next =
      e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    const k = tabs[next]!.key;
    go(k);
    tabRefs.current[k]?.focus();
  };

  const role = user?.role ?? null;
  const loadError = model.error ?? projects.error;
  const retry = () => {
    if (model.isError) void model.refetch();
    if (projects.isError) void projects.refetch();
  };

  return (
    <div className="flex flex-col gap-5 px-4 pt-7 pb-9 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 grow basis-[min(100%,22rem)] flex-col gap-1.5">
          <span className="text-[12px] text-sub">
            {bundle && pjs
              ? `${bundle.model.name} v${bundle.activeVersion?.version ?? 0} ・ 要因 ${bundle.factors.length} ・ 実績 ${pjs.length} 件`
              : ' '}
          </span>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h1 className="n m-0 text-[28px] break-words">取り込み / 書き出し</h1>
            <HelpLink section="usage" />
          </div>
          <span className="text-[13px] text-sub">
            旧 Excel 版の XML (Shift-JIS) は JSON に置き換え。簡易見積りモデルツールとのやり取りも、実績データの一括登録もここで行います。
          </span>
        </div>
        <div
          role="tablist"
          aria-label="取り込み / 書き出し"
          onKeyDown={onTabKey}
          className="flex max-w-full flex-wrap gap-0.5 rounded-xl border border-line bg-card p-1"
        >
          {tabs.map((t) => {
            const on = tab === t.key;
            return (
              <button
                key={t.key}
                ref={(el) => {
                  tabRefs.current[t.key] = el;
                }}
                type="button"
                role="tab"
                id={`tab-${t.key}`}
                aria-selected={on}
                aria-controls={`panel-${t.key}`}
                tabIndex={on ? 0 : -1}
                onClick={() => go(t.key)}
                className={cx(
                  'btn inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-[9px] border-0 px-4 text-left text-[13px] font-bold',
                  on ? 'bg-accent text-bg' : 'bg-transparent text-sub hover:text-text',
                )}
              >
                {t.label}
                {t.key === 'review' && pending > 0 && (
                  <span aria-label={`レビュー待ち ${pending} 件`} className={cx('n rounded-full px-1.5 text-[11px] leading-[18px]', on ? 'bg-bg/20 text-bg' : 'bg-warn/15 text-warn')}>
                    {pending}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {loadError ? (
        <div role="alert" className="tile flex flex-wrap items-center gap-3 px-[22px] py-5 text-[13px]">
          <span className="min-w-0 flex-1 text-coral-soft">モデルを読み込めませんでした。{describeApiError(loadError)}</span>
          <button type="button" onClick={retry} className={ghostBtn}>
            再試行
          </button>
        </div>
      ) : !bundle || !pjs ? (
        <div role="status" className="tile px-[22px] py-5 text-[13px] text-sub">
          読み込み中…
        </div>
      ) : (
        tabs
          .filter((t) => visited.has(t.key))
          .map((t) => (
            <div key={t.key} id={`panel-${t.key}`} role="tabpanel" aria-labelledby={`tab-${t.key}`} hidden={tab !== t.key} className="@container min-w-0">
              {t.key === 'json' ? (
                <ImportTab
                  bundle={bundle}
                  projects={pjs}
                  role={role}
                  userName={user?.name ?? 'ゲスト'}
                  handoff={handoff?.tab === 'json' ? handoff : null}
                  onSwitchTab={go}
                />
              ) : t.key === 'export' ? (
                <ExportTab bundle={bundle} projects={pjs} role={role} userName={user?.name ?? 'ゲスト'} userEmail={user?.email ?? null} />
              ) : t.key === 'csv' ? (
                <CsvTab
                  bundle={bundle}
                  projects={pjs}
                  role={role}
                  userName={user?.name ?? 'ゲスト'}
                  handoff={handoff?.tab === 'csv' ? handoff : null}
                  onSwitchTab={go}
                />
              ) : (
                <ReviewTab />
              )}
            </div>
          ))
      )}
    </div>
  );
}
