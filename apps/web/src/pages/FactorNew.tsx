// 要因を追加（design/FactorNew.dc.html）: 既定は「一から定義する」、切替で「標準要因から選ぶ」。
import { Link, useSearchParams } from 'react-router';
import { useFactorContext } from '../features/factors/data';
import { NewFactorForm } from '../features/factors/NewFactorForm';
import { StandardPicker } from '../features/factors/StandardPicker';
import '../features/factors/factors.css';

const MODES = [
  { id: 'new', label: '一から定義する' },
  { id: 'standard', label: '標準要因から選ぶ' },
] as const;

export default function FactorNewPage() {
  const { data, isLoading, error, canEdit } = useFactorContext();
  const [params, setParams] = useSearchParams();
  const mode = params.get('tab') === 'standard' ? 'standard' : 'new';

  if (isLoading) return <div className="p-8 text-sub">読み込み中…</div>;
  if (error || !data) return <div className="p-8 text-coral-soft">モデルを読み込めませんでした。</div>;
  const { bundle, factors } = data;
  const modelName = `${bundle.model.name}${bundle.activeVersion ? ` v${bundle.activeVersion.version}` : ''}`;

  return (
    <div className="flex flex-col gap-5 px-8 pt-6 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-[860px] flex-col gap-1.5">
          <span className="text-[11px] text-sub">
            <Link to="/model/factors" className="text-sub! no-underline hover:text-text!">変動要因</Link> <span className="mx-1.5">›</span> 新しい要因
          </span>
          <h1 className="n m-0 text-[30px] leading-[1.1]">要因を追加</h1>
          <span className="text-[12px] text-sub">
            自社向けに一から定義するのが基本です。CoBRA 標準データの要因を下敷きにしたいときは右の切替から選べます。追加した要因は「{modelName}」に入ります (現在 {factors.length} 要因)。
          </span>
        </div>
        <div role="tablist" aria-label="追加の方法" className="inline-flex gap-1 rounded-xl border border-line bg-card p-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              className={`btn min-h-9 cursor-pointer rounded-[9px] border-0 px-4 font-[inherit] text-[13px] font-bold ${mode === m.id ? 'bg-raised text-text' : 'bg-transparent text-sub'}`}
              onClick={() => setParams(m.id === 'standard' ? { tab: 'standard' } : {}, { replace: true })}
            >
              {m.label}
            </button>
          ))}
        </div>
      </header>

      {mode === 'standard' ? <StandardPicker factors={factors} canEdit={canEdit} /> : <NewFactorForm factors={factors} canEdit={canEdit} />}
    </div>
  );
}
