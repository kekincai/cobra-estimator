// 要因を追加（design/FactorNew.dc.html）: 既定は「一から定義する」、切替で「標準要因から選ぶ」。
// 2 つのタブは切り替えても入力が消えないよう、両方とも表示したまま片方を隠す。
import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useFactorContext } from '../features/factors/data';
import { LoadState } from '../features/factors/LoadState';
import { NewFactorForm } from '../features/factors/NewFactorForm';
import { StandardPicker } from '../features/factors/StandardPicker';
import '../features/factors/factors.css';
import { HelpLink } from '../ui/HelpLink';
import { useUnsavedChangesPrompt } from '../ui/useUnsavedChangesPrompt';

const MODES = [
  { id: 'new', label: '一から定義する' },
  { id: 'standard', label: '標準要因から選ぶ' },
] as const;

export default function FactorNewPage() {
  const { data, isLoading, error, refetch, canEdit } = useFactorContext();
  const [params, setParams] = useSearchParams();
  const mode = params.get('tab') === 'standard' ? 'standard' : 'new';
  const [dirtyNew, setDirtyNew] = useState(false);
  const [dirtyStd, setDirtyStd] = useState(false);
  // 保存に成功して一覧へ移るときは確認しない（遷移の時点で読むので ref）
  const leaving = useRef(false);
  const onLeaving = useCallback(() => {
    leaving.current = true;
  }, []);
  useUnsavedChangesPrompt(dirtyNew || dirtyStd, { allow: () => leaving.current });
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  if (isLoading || error || !data) return <LoadState isLoading={isLoading} error={error} refetch={refetch} />;
  const { bundle, factors } = data;
  const modelName = `${bundle.model.name}${bundle.activeVersion ? ` v${bundle.activeVersion.version}` : ''}`;
  const select = (id: (typeof MODES)[number]['id']) => setParams(id === 'standard' ? { tab: 'standard' } : {}, { replace: true });
  const onTabKey = (e: KeyboardEvent, i: number) => {
    const next = e.key === 'ArrowRight' ? (i + 1) % MODES.length : e.key === 'ArrowLeft' ? (i - 1 + MODES.length) % MODES.length : e.key === 'Home' ? 0 : e.key === 'End' ? MODES.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    select(MODES[next]!.id);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="flex min-w-0 flex-col gap-5 px-4 pt-6 pb-10 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 max-w-[860px] flex-col gap-1.5">
          <span className="text-[11px] text-sub">
            <Link to="/model/factors" className="text-sub! no-underline hover:text-text!">変動要因</Link> <span aria-hidden="true" className="mx-1.5">›</span> 新しい要因
          </span>
          <h1 className="n m-0 flex items-center gap-2.5 text-[30px] leading-[1.1]">
            要因を追加
            <HelpLink section="factors" />
          </h1>
          <span className="text-[12px] text-sub">
            自社向けに一から定義するのが基本です。CoBRA 標準データの要因を下敷きにしたいときは右の切替から選べます。追加した要因は「{modelName}」に入ります (現在 {factors.length} 要因)。
          </span>
        </div>
        <div role="tablist" aria-label="追加の方法" className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-line bg-card p-1">
          {MODES.map((m, i) => (
            <button
              key={m.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              id={`fx-tab-${m.id}`}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              aria-controls={`fx-panel-${m.id}`}
              tabIndex={mode === m.id ? 0 : -1}
              className={`btn min-h-9 cursor-pointer rounded-[9px] border-0 px-4 font-[inherit] text-[13px] font-bold ${mode === m.id ? 'bg-raised text-text' : 'bg-transparent text-sub'}`}
              onClick={() => select(m.id)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </header>

      <div role="tabpanel" id="fx-panel-new" aria-labelledby="fx-tab-new" hidden={mode !== 'new'}>
        <NewFactorForm factors={factors} canEdit={canEdit} k={bundle.model.k} onDirtyChange={setDirtyNew} onLeaving={onLeaving} />
      </div>
      <div role="tabpanel" id="fx-panel-standard" aria-labelledby="fx-tab-standard" hidden={mode !== 'standard'}>
        <StandardPicker factors={factors} canEdit={canEdit} onDirtyChange={setDirtyStd} onLeaving={onLeaving} />
      </div>
    </div>
  );
}
