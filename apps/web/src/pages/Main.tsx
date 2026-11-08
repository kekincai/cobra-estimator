// ダッシュボード（design/Main.dc.html）。アクティブなモデルと最新の見積りの概要。
// 読み込み中・エラー・データなしを分けて表示する（読み込み中やエラーのときに「無い」とは言わない）。
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ActivityTile } from '../features/dashboard/ActivityTile';
import { describeFeed } from '../features/dashboard/activity';
import { ContributionTile } from '../features/dashboard/ContributionTile';
import { BudgetTile, DistributionTile } from '../features/dashboard/DistributionTiles';
import { EstimateTile } from '../features/dashboard/EstimateTile';
import { estimateTitle, fmtMD } from '../features/dashboard/format';
import { GenerationsTile } from '../features/dashboard/GenerationsTile';
import { estimateLinks } from '../features/dashboard/links';
import { AccuracyTile, AlphaTile } from '../features/dashboard/ModelTiles';
import { NewEstimateButton } from '../features/dashboard/NewEstimateButton';
import { exceedAt, sharedBandScale } from '../features/dashboard/results';
import { SearchBox } from '../features/dashboard/SearchBox';
import { ErrorBanner, ReviewBadge } from '../features/dashboard/StateViews';
import { useAudit } from '../features/dashboard/useAudit';
import { useBudgetDraft } from '../features/dashboard/useBudgetDraft';
import { useDashboard } from '../features/dashboard/useDashboard';
import '../features/dashboard/dashboard.css';
import { describeApiError } from '../ui/apiError';
import { CURRENT_ESTIMATE_ID } from '../ui/Layout';
import { useMounted } from '../ui/useMounted';
import { useUnsavedChangesPrompt } from '../ui/useUnsavedChangesPrompt';

/** 「最近の操作」に出す件数（ログインなどを除いたあと） */
const FEED_ROWS = 6;

export default function MainPage() {
  const [params, setParams] = useSearchParams();
  const d = useDashboard(params.get('gen'));
  // ログインの記録を除いてから 6 件にするので、少し多めに取る
  const audit = useAudit(20);
  const mounted = useMounted();
  const estimateId = d.estimate?.id ?? CURRENT_ESTIMATE_ID;
  const result = d.result;
  const isRealGen = !!d.gen && !d.isSample;
  const links = estimateLinks(estimateId, isRealGen ? d.gen!.label : null);

  // 予算: 保存値 → なければ P80。スライダーで動かした値は「予算を保存」するまで試算
  const savedBudget = d.estimate?.budget ?? null;
  const budget = useBudgetDraft(d.estimate?.id ?? null, savedBudget);
  useUnsavedChangesPrompt(budget.dirty, { message: '予算の試算値を保存していません。保存せずに移動しますか？' });
  const resultOf = (g: (typeof d.gens)[number]) => (g.id === d.gen?.id ? result : g.stored);
  // 帯・ヒストグラム・スライダーは全世代で共通の目盛り（世代を切り替えても位置が動かない）
  const scale = useMemo(
    () => sharedBandScale(d.gens.map(resultOf), savedBudget) ?? { lo: 0, hi: 1 },
    // resultOf は d.gen と result から決まる
    [d.gens, d.gen, result, savedBudget],
  );
  const budgetValue = budget.draft ?? savedBudget ?? (result ? Math.round(result.pct[80] * 2) / 2 : 0);
  const pExceed = result ? exceedAt(result, budgetValue) : 0;

  const inconsistencies = d.active?.inconsistencies ?? [];
  const adopted = d.projects.filter((p) => p.adopted).length;
  const prev = d.genIndex > 0 ? d.gens[d.genIndex - 1]! : null;

  const feed = useMemo(
    () =>
      describeFeed(
        audit.data ?? [],
        { gens: d.gens, sco: (g) => resultOf(g)?.sco ?? null, versions: d.versions, factors: d.bundle?.factors ?? [] },
        FEED_ROWS,
      ),
    // resultOf は d.gen と result から決まる
    [audit.data, d.gens, d.versions, d.bundle, result],
  );

  const pick = (id: string) => {
    const g = d.gens.find((x) => x.id === id);
    if (!g || g.id === 'sample') return;
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set('gen', g.label);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  };

  const tab = 'inline-flex min-h-[30px] items-center rounded-full px-3 text-[12px] font-medium no-underline';
  const errorText = d.error ? `ダッシュボードのデータを読み込めませんでした。${describeApiError(d.error)}` : null;

  return (
    <div className="flex min-w-0 flex-col gap-5 px-4 pt-6 pb-10 sm:px-8">
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchBox />
        <div className="grow" />
        <ReviewBadge status={d.modelStatus} count={inconsistencies.length} />
        <Link to="/transfer" className="btn inline-flex min-h-10 items-center rounded-[10px] border border-line bg-card px-3 text-[12px] font-medium text-text no-underline">
          取り込み / 書き出し
        </Link>
        <NewEstimateButton />
      </div>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Link
            to="/model/build"
            className="btn inline-flex min-h-7 max-w-full items-center gap-2 self-start rounded-lg border border-line bg-card pr-2.5 pl-2 text-[11px] text-sub no-underline"
          >
            <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${d.modelStatus === 'error' ? 'bg-coral' : d.modelStatus === 'loading' ? 'bg-muted' : 'bg-teal'}`} />
            <span className="min-w-0 truncate">
              {d.bundle
                ? `${d.bundle.model.name}${d.active ? ` v${d.active.version}` : ''}`
                : d.modelStatus === 'error'
                  ? 'モデルを読み込めませんでした'
                  : 'モデルを読み込み中…'}
            </span>
            <span aria-hidden="true">→</span>
          </Link>
          <h1 className="n m-0 text-[30px] leading-[1.1] break-words">{d.estimate ? estimateTitle(d.estimate.name) : 'ダッシュボード'}</h1>
          <span className="text-[12px] text-sub">
            {[
              d.active && `${fmtMD(d.active.builtAt)} モデル構築`,
              d.active && `α ${d.active.alpha.toFixed(4)}`,
              d.bundle && `要因 ${d.bundle.factors.length}`,
              d.projectsReady && d.projects.length > 0 && `実績 ${adopted}/${d.projects.length} 件`,
              d.estimate && `見積り ${d.isSample ? 0 : d.gens.length} 世代`,
            ]
              .filter(Boolean)
              .join(' ・ ')}
          </span>
        </div>
        <nav aria-label="見積りの表示" className="flex flex-wrap gap-1.5">
          <span aria-current="page" className={`${tab} bg-raised text-text`}>
            概要
          </span>
          <Link to={links.conditions} className={`${tab} text-sub hover:text-text`}>
            条件
          </Link>
          <Link to={links.risk} className={`${tab} text-sub hover:text-text`}>
            リスク
          </Link>
          <Link to={links.report} className={`${tab} text-sub hover:text-text`}>
            レポート
          </Link>
        </nav>
      </header>

      {errorText && <ErrorBanner message={errorText} onRetry={d.retry} />}
      {d.simError != null && !d.running && (
        <ErrorBanner message={`シミュレーションに失敗しました。${describeApiError(d.simError, '再実行してください。')}`} onRetry={d.rerun} />
      )}

      <section aria-label="ダッシュボード" className="grid grid-cols-12 gap-4">
        {d.gen && result ? (
          <>
            <EstimateTile
              links={links}
              gen={d.gen}
              prev={prev}
              prevP50={prev ? (resultOf(prev)?.p50 ?? null) : null}
              result={result}
              scale={scale}
              budget={budgetValue}
              mounted={mounted}
              running={d.running}
              progress={d.progress}
              rerunNote={d.rerunNote}
              onRun={() => void d.rerun()}
            />
            <DistributionTile result={result} scale={scale} budget={budgetValue} pExceed={pExceed} mounted={mounted} />
            <BudgetTile
              budget={budgetValue}
              scale={scale}
              pExceed={pExceed}
              p80={result.pct[80]}
              mounted={mounted}
              onBudget={budget.setDraft}
              dirty={budget.dirty}
              savedBudget={savedBudget}
              saving={budget.saving}
              justSaved={budget.justSaved}
              saveError={budget.error ? describeApiError(budget.error, '予算を保存できませんでした。時間をおいて再試行してください。') : null}
              onSave={budget.save}
              onRevert={budget.revert}
            />
          </>
        ) : (
          <EstimatePlaceholder
            state={d.error ? 'error' : d.loading ? 'loading' : !d.active ? 'no-model' : !d.estimate ? 'no-estimate' : 'simulating'}
            conditionsHref={links.conditions}
          />
        )}

        <AlphaTile status={d.modelStatus} active={d.active} versions={d.versions} />
        <AccuracyTile status={d.modelStatus} active={d.active} mounted={mounted} />
        {d.gen && result && <ContributionTile gen={d.gen} result={result} bundle={d.bundle} mounted={mounted} />}
        {d.gen && (
          <GenerationsTile
            estimateHref={links.conditions}
            gens={d.gens}
            selectedId={d.gen.id}
            resultOf={resultOf}
            isSample={d.isSample}
            inconsistencies={inconsistencies}
            mounted={mounted}
            onPick={pick}
          />
        )}
        <ActivityTile
          items={feed}
          status={audit.isError ? 'error' : audit.isLoading ? 'loading' : 'ready'}
          error={audit.isError ? `操作の記録を読み込めませんでした。${describeApiError(audit.error)}` : null}
          onRetry={() => void audit.refetch()}
        />
      </section>
    </div>
  );
}

type PlaceholderState = 'loading' | 'error' | 'no-model' | 'no-estimate' | 'simulating';

/** 推定値タイルの代わり。読み込み中は骨組み、エラーは「—」、データが無いときだけ次の一歩を示す */
function EstimatePlaceholder({ state, conditionsHref }: { state: PlaceholderState; conditionsHref: string }) {
  const msg: Record<PlaceholderState, string> = {
    loading: '読み込み中…',
    error: '—',
    'no-model': '見積りに使うモデルがまだありません。モデルを構築すると、見積りを実行できます。',
    'no-estimate': 'まだ見積りがありません。「+ 新しい見積り」から作成できます。',
    simulating: 'シミュレーション中…',
  };
  return (
    <div className="tile col-span-12 flex min-h-[220px] flex-col items-start justify-center gap-3 px-5 py-6 sm:px-[26px]" aria-busy={state === 'loading' || state === 'simulating'}>
      <h2 className="m-0 text-[12px] font-normal text-sub">推定工数 (超過確率 50%)</h2>
      {state === 'loading' ? (
        <>
          <span aria-hidden="true" className="dash-skel block h-[72px] w-[min(240px,70%)]" />
          <span className="sr-only">読み込み中…</span>
        </>
      ) : (
        <span className={state === 'error' ? 'n text-[40px] leading-none text-sub' : 'text-[15px] font-medium'}>{msg[state]}</span>
      )}
      {state === 'error' && <span className="text-[12px] text-sub">上のメッセージの「再試行」で読み込み直せます。</span>}
      {state === 'no-model' && (
        <Link to="/model/build" className="btn inline-flex min-h-10 items-center rounded-[10px] bg-raised px-3.5 text-[12px] font-medium text-text no-underline">
          モデル構築へ
        </Link>
      )}
      {state === 'simulating' && (
        <Link to={conditionsHref} className="btn inline-flex min-h-10 items-center rounded-[10px] bg-raised px-3.5 text-[12px] font-medium text-text no-underline">
          工数見積りへ
        </Link>
      )}
    </div>
  );
}
