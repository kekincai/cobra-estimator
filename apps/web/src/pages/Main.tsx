// ダッシュボード（design/Main.dc.html）。アクティブなモデルと最新の見積りの概要。
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ActivityTile } from '../features/dashboard/ActivityTile';
import { describeFeed } from '../features/dashboard/activity';
import { ContributionTile } from '../features/dashboard/ContributionTile';
import { BudgetTile, DistributionTile } from '../features/dashboard/DistributionTiles';
import { EstimateTile } from '../features/dashboard/EstimateTile';
import { estimateTitle, fmtMD } from '../features/dashboard/format';
import { GenerationsTile } from '../features/dashboard/GenerationsTile';
import { AccuracyTile, AlphaTile } from '../features/dashboard/ModelTiles';
import { bandScale, exceedAt } from '../features/dashboard/results';
import { useAudit } from '../features/dashboard/useAudit';
import { useDashboard } from '../features/dashboard/useDashboard';
import '../features/dashboard/dashboard.css';
import { CURRENT_ESTIMATE_ID } from '../ui/Layout';
import { useMounted } from '../ui/useMounted';

export default function MainPage() {
  const d = useDashboard();
  const audit = useAudit(6);
  const mounted = useMounted();
  const estimateId = d.estimate?.id ?? CURRENT_ESTIMATE_ID;
  const result = d.result;
  // 予算: 見積りに保存された値 → なければ P80。スライダーで動かした値はこの画面だけのもの
  const [budget, setBudget] = useState<number | null>(null);
  const savedBudget = d.estimate?.budget ?? null;
  const scale = useMemo(() => (result ? bandScale(result, savedBudget) : { lo: 0, hi: 1 }), [result, savedBudget]);
  const budgetValue = budget ?? savedBudget ?? (result ? Math.round(result.pct[80] * 2) / 2 : 0);
  const pExceed = result ? exceedAt(result, budgetValue) : 0;

  const inconsistencies = d.active?.inconsistencies ?? [];
  const adopted = d.projects.filter((p) => p.adopted).length;
  const prev = d.genIndex > 0 ? d.gens[d.genIndex - 1]! : null;
  const resultOf = (g: (typeof d.gens)[number]) => (g.id === d.gen?.id ? result : g.stored);

  const feed = useMemo(
    () =>
      describeFeed(audit.data ?? [], {
        gens: d.gens,
        sco: (g) => resultOf(g)?.sco ?? null,
        versions: d.versions,
        factors: d.bundle?.factors ?? [],
      }),
    // resultOf は d.gen と result から決まる
    [audit.data, d.gens, d.versions, d.bundle, result],
  );

  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const tab = 'inline-flex min-h-[30px] items-center rounded-full px-3 text-[12px] font-medium no-underline';

  return (
    <div className="flex min-w-0 flex-col gap-5 px-8 pt-6 pb-10">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative inline-flex items-center">
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-weak)" strokeWidth="2.2" strokeLinecap="round" className="absolute left-[13px]">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            ref={search}
            type="search"
            aria-label="見積り・モデルを検索"
            placeholder="見積り、モデル、プロジェクトを検索"
            className="dash-search box-border min-h-10 w-[260px] rounded-[10px] border border-line bg-card pr-3.5 pl-9 font-sans text-[13px] text-text"
          />
          <span className="n absolute right-2.5 rounded-[5px] border border-muted px-[5px] py-px text-[10px] font-medium tracking-normal text-weak">⌘K</span>
        </div>
        <div className="grow" />
        <span className="inline-flex min-h-9 items-center gap-2 rounded-[10px] border border-line bg-card px-3 text-[12px] text-sub">
          <span className={`size-[7px] rounded-full ${inconsistencies.length ? 'bg-coral' : 'bg-ok'}`} />
          要確認 {inconsistencies.length} 件
        </span>
        <Link to="/transfer" className="btn inline-flex min-h-9 items-center rounded-[10px] border border-line bg-card px-3 text-[12px] font-medium text-text no-underline">
          インポート / エクスポート
        </Link>
        <Link to={`/estimate/${estimateId}`} className="btn inline-flex min-h-9 items-center gap-2 rounded-[10px] bg-accent px-3.5 text-[12px] font-bold text-bg no-underline">
          + 新しい見積り
        </Link>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <Link
            to="/model/build"
            className="btn inline-flex min-h-7 items-center gap-2 self-start rounded-lg border border-line bg-card pr-2.5 pl-2 text-[11px] text-sub no-underline"
          >
            <span className="size-1.5 rounded-full bg-teal" />
            {d.bundle ? `${d.bundle.model.name}${d.active ? ` v${d.active.version}` : ''}` : 'モデルを読み込み中…'}
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </Link>
          <h1 className="n m-0 text-[30px] leading-[1.1]">{d.estimate ? estimateTitle(d.estimate.name) : 'ダッシュボード'}</h1>
          <span className="text-[12px] text-sub">
            {[
              d.active && `${fmtMD(d.active.builtAt)} モデル構築`,
              d.active && `α ${d.active.alpha.toFixed(4)}`,
              d.bundle && `要因 ${d.bundle.factors.length}`,
              d.projects.length > 0 && `実績 ${adopted}/${d.projects.length} 件`,
              d.estimate && `見積り ${d.isSample ? 0 : d.gens.length} 世代`,
            ]
              .filter(Boolean)
              .join(' ・ ')}
          </span>
        </div>
        <nav aria-label="見積りの表示" className="flex gap-1.5">
          <span aria-current="page" className={`${tab} bg-raised text-text`}>
            概要
          </span>
          <Link to={`/estimate/${estimateId}`} className={`${tab} text-sub hover:text-text`}>
            条件
          </Link>
          <Link to={`/estimate/${estimateId}/risk`} className={`${tab} text-sub hover:text-text`}>
            リスク
          </Link>
          <Link to={`/estimate/${estimateId}/report`} className={`${tab} text-sub hover:text-text`}>
            レポート
          </Link>
        </nav>
      </header>

      {d.error && (
        <p role="alert" className="m-0 rounded-xl bg-coral-bg px-4 py-3 text-[13px] text-coral-ink">
          データを読み込めませんでした: {d.error.message}
        </p>
      )}
      {d.simError && (
        <p role="alert" className="m-0 rounded-xl bg-coral-bg px-4 py-3 text-[13px] text-coral-ink">
          シミュレーションに失敗しました: {d.simError}
        </p>
      )}

      <section aria-label="ダッシュボード" className="grid grid-cols-12 gap-4">
        {d.gen && result ? (
          <>
            <EstimateTile
              estimateId={estimateId}
              gen={d.gen}
              prev={prev}
              prevP50={prev ? (prev.stored?.p50 ?? null) : null}
              result={result}
              scale={scale}
              budget={budgetValue}
              mounted={mounted}
              running={d.running}
              progress={d.progress}
              onRun={() => void d.rerun()}
            />
            <DistributionTile result={result} budget={budgetValue} pExceed={pExceed} mounted={mounted} />
            <BudgetTile budget={budgetValue} scale={scale} pExceed={pExceed} p80={result.pct[80]} mounted={mounted} onBudget={setBudget} />
          </>
        ) : (
          <EmptyEstimate loading={d.loading} hasEstimate={!!d.estimate} hasModel={!!d.active} estimateId={estimateId} />
        )}

        <AlphaTile active={d.active} versions={d.versions} />
        <AccuracyTile active={d.active} mounted={mounted} />
        {d.gen && result && <ContributionTile gen={d.gen} result={result} factors={d.bundle?.factors ?? []} mounted={mounted} />}
        {d.gen && (
          <GenerationsTile
            estimateId={estimateId}
            gens={d.gens}
            selectedId={d.gen.id}
            resultOf={resultOf}
            isSample={d.isSample}
            inconsistencies={inconsistencies}
            mounted={mounted}
            onPick={d.pick}
          />
        )}
        <ActivityTile items={feed} loading={audit.isLoading} />
      </section>
    </div>
  );
}

function EmptyEstimate({ loading, hasEstimate, hasModel, estimateId }: { loading: boolean; hasEstimate: boolean; hasModel: boolean; estimateId: string }) {
  const msg = loading
    ? '読み込み中…'
    : !hasModel
      ? '採用中のモデルがありません。モデルを構築すると、見積りを実行できます。'
      : !hasEstimate
        ? 'まだ見積りがありません。'
        : 'シミュレーション中…';
  return (
    <div className="tile col-span-12 flex min-h-[220px] flex-col items-start justify-center gap-3 px-[26px] py-6">
      <span className="text-[12px] text-sub">推定工数 (超過確率 50%)</span>
      <span className="text-[15px] font-medium" aria-live="polite">
        {msg}
      </span>
      {!loading && (
        <Link to={hasModel ? `/estimate/${estimateId}` : '/model/build'} className="btn inline-flex min-h-[38px] items-center rounded-[10px] bg-raised px-3.5 text-[12px] font-medium text-text no-underline">
          {hasModel ? '工数見積りへ' : 'モデル構築へ'}
        </Link>
      )}
    </div>
  );
}
