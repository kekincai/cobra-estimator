// /transfer 取り込み / 書き出し（design/Transfer.dc.html）
// タブ: JSON を取り込む / JSON を書き出す / CSV で実績を取り込む。?tab=json|export|csv で直接開ける。
import { useSearchParams } from 'react-router';
import { useMe, useModel, useProjects } from '../data/api';
import { CsvTab } from '../features/transfer/CsvTab';
import { ExportTab } from '../features/transfer/ExportTab';
import { ImportTab } from '../features/transfer/ImportTab';
import { cx } from '../features/transfer/ui';

const TABS = [
  { key: 'json', label: 'JSON を取り込む' },
  { key: 'export', label: 'JSON を書き出す' },
  { key: 'csv', label: 'CSV で実績を取り込む' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function TransferPage() {
  const [params, setParams] = useSearchParams();
  const tab: TabKey = TABS.find((t) => t.key === params.get('tab'))?.key ?? 'json';
  const model = useModel();
  const projects = useProjects();
  const me = useMe();
  const user = me.data?.user ?? null;
  const bundle = model.data;
  const pjs = projects.data;

  return (
    <div className="flex flex-col gap-5 px-8 pt-7 pb-9">
      <div className="flex items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] text-sub">
            {bundle && pjs
              ? `${bundle.model.name} v${bundle.activeVersion?.version ?? 0} ・ 要因 ${bundle.factors.length} ・ 実績 ${pjs.length} 件`
              : ' '}
          </span>
          <h1 className="n m-0 text-[28px]">取り込み / 書き出し</h1>
          <span className="text-[13px] text-sub">
            旧 Excel 版の XML (Shift-JIS) は JSON に置き換え。簡易見積りモデルツールとのやり取りも、実績データの一括登録もここで行います。
          </span>
        </div>
        <div role="tablist" aria-label="取り込み / 書き出し" className="inline-flex shrink-0 gap-0.5 rounded-xl border border-line bg-card p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`tab-${t.key}`}
              aria-selected={tab === t.key}
              aria-controls="transfer-panel"
              onClick={() => setParams(t.key === 'json' ? {} : { tab: t.key }, { replace: true })}
              className={cx(
                'btn min-h-9 cursor-pointer rounded-[9px] border-0 px-4 text-[13px] font-bold whitespace-nowrap',
                tab === t.key ? 'bg-accent text-bg' : 'bg-transparent text-sub hover:text-text',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div id="transfer-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} key={tab}>
        {model.isError || projects.isError ? (
          <div role="alert" className="tile px-[22px] py-5 text-[13px] text-coral-soft">
            モデルを読み込めませんでした: {(model.error ?? projects.error)?.message}
          </div>
        ) : !bundle || !pjs ? (
          <div className="tile px-[22px] py-5 text-[13px] text-sub">読み込み中…</div>
        ) : tab === 'json' ? (
          <ImportTab bundle={bundle} projects={pjs} role={user?.role ?? null} />
        ) : tab === 'export' ? (
          <ExportTab bundle={bundle} projects={pjs} role={user?.role ?? null} userName={user?.name ?? 'ゲスト'} />
        ) : (
          <CsvTab bundle={bundle} projects={pjs} role={user?.role ?? null} />
        )}
      </div>
    </div>
  );
}
