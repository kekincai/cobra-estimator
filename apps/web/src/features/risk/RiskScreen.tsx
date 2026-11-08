import { useMutation, useQueryClient } from '@tanstack/react-query';
import { effortAtExceedance, exceedance, type SimulationResult } from 'cobra-core';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { GenerationRow, ModelBundle, ModelVersionRow } from '../../../shared/types';
import { apiSend, qk } from '../../data/api';
import { describeApiError } from '../../ui/apiError';
import { ExceedanceCurve } from '../../ui/ExceedanceCurve';
import { fmt1, factorNo, fmtSigned } from '../../ui/format';
import { factorContributions } from '../../ui/contribution';
import { HelpLink } from '../../ui/HelpLink';
import { EXCEED_NOTE, exceedWithP } from '../../ui/percentile';
import { ViewToggle } from './ViewToggle';
import { clamp, histRange } from '../../ui/stats';
import { useMounted } from '../../ui/useMounted';
import { useSimSettings } from '../sim-settings';
import { EstimateHeader, RetryButton, ScreenError, ScreenMessage } from '../estimate/EstimateHeader';
import { estimateTitle, specFor, useEstimateContext, useGenerationSimulation, useLeversState, type EstimateContext } from '../estimate/context';
import { draftAsGeneration, useDraft } from '../estimate/draft';
import { estimatePath, resolveGen, useGenParam } from '../estimate/genParam';
import { useEstimateLeaveGuard } from '../estimate/useEstimateLeaveGuard';
import {
  BUDGET_ERROR,
  EXCEED_CHOICES,
  EXCEED_TABLE,
  budgetChanged,
  exceedAux,
  leverDelta,
  leverExceedText,
  marginParts,
  parseBudget,
  pctRound,
  showCumulative,
  verdictOf,
} from './display';

type Shown = { gen: GenerationRow; result: SimulationResult; version: ModelVersionRow; isDraft: boolean };

export function RiskScreen({ id }: { id: string }) {
  const { ctx, error, refetch } = useEstimateContext(id);
  const genParam = useGenParam();
  const draft = useDraft(id);
  const settings = useSimSettings('estimate');
  // 未保存の条件があるときは既定でそれを計算する。「保存済みを表示」で切り替えられる
  const [view, setView] = useState<'draft' | 'saved'>('draft');

  const requested = ctx ? resolveGen(ctx.gens, genParam) : null;
  const savedGen = requested ?? ctx?.reportGen ?? null;
  const active = ctx?.bundle.activeVersion ?? null;
  // 見積り画面のプレビューと同じ入力（見積りに使用中の版・シミュレーション設定の回数とシード）で計算する
  const draftGen = useMemo(
    () => (ctx && draft && active ? draftAsGeneration(id, draft, { runs: settings.runs, seed: settings.seed, modelVersionId: active.id }) : null),
    [ctx, draft, active, id, settings.runs, settings.seed],
  );
  const useDraftView = !!draftGen && view === 'draft';
  const simGen = useDraftView ? draftGen : savedGen;
  const sim = useGenerationSimulation(ctx?.bundle, simGen);

  // 再計算中は直前の結果を出し続ける（画面の状態・入力を保つ）
  const [last, setLast] = useState<Shown | null>(null);
  useEffect(() => {
    if (sim.result && simGen && sim.version) setLast({ gen: simGen, result: sim.result, version: sim.version, isDraft: useDraftView });
    // sim.result が変わったときだけ
  }, [sim.result]);
  const shown: Shown | null =
    sim.result && simGen && sim.version ? { gen: simGen, result: sim.result, version: sim.version, isDraft: useDraftView } : last;

  if (error) return <ScreenError message={describeApiError(error, '見積りを読み込めませんでした。')} onRetry={refetch} />;
  if (!ctx) return <ScreenMessage>読み込み中…</ScreenMessage>;
  if (!simGen)
    return (
      <ScreenMessage>
        まだ保存された世代がありません。<Link to={estimatePath(id, 'conditions', genParam)}>工数見積り</Link>で実行すると、ここでリスクを確認できます。
      </ScreenMessage>
    );
  if (!shown) {
    if (sim.error) return <ScreenError message="シミュレーションを実行できませんでした。" onRetry={sim.retry} />;
    return <ScreenMessage>シミュレーション中…</ScreenMessage>;
  }
  return (
    <RiskView
      key={ctx.estimate.id}
      ctx={ctx}
      shown={shown}
      genParam={genParam}
      recalculating={!sim.result && !sim.error}
      simError={sim.error ? sim.retry : null}
      hasDraft={!!draftGen}
      draftBaseLabel={draft ? (ctx.gens.find((g) => g.id === draft.baseGenId)?.label ?? null) : null}
      savedGen={savedGen}
      genMissing={!!genParam && !requested}
      onView={setView}
    />
  );
}

function RiskView({
  ctx,
  shown,
  genParam,
  recalculating,
  simError,
  hasDraft,
  draftBaseLabel,
  savedGen,
  genMissing,
  onView,
}: {
  ctx: EstimateContext;
  shown: Shown;
  genParam: string | null;
  recalculating: boolean;
  /** 計算に失敗したとき「再試行」 */
  simError: (() => void) | null;
  hasDraft: boolean;
  draftBaseLabel: string | null;
  savedGen: GenerationRow | null;
  /** ?gen= の世代が見つからなかった */
  genMissing: boolean;
  onView: (v: 'draft' | 'saved') => void;
}) {
  const { bundle, estimate } = ctx;
  const { gen, result, version, isDraft } = shown;
  const samples = result.samples;
  const m = result.p50;
  const p80 = result.pct[80];
  const mounted = useMounted();
  const budgetErrorId = useId();

  // 横軸の範囲（保存済みの予算も入るように広げる）
  const range = useMemo(() => {
    const r = histRange(samples);
    const lo = Math.floor(Math.min(r.lo, estimate.budget ?? r.lo));
    const hi = Math.ceil(Math.max(r.hi, estimate.budget ?? r.hi));
    return { lo, hi };
  }, [samples, estimate.budget]);

  // 予算（保存済みの値、無ければ推定値の近くを提案）
  const saved = estimate.budget;
  const initialBudget = useRef(saved ?? Math.round(m * 2) / 2).current;
  const [budget, setBudgetRaw] = useState(initialBudget);
  const [budgetText, setBudgetText] = useState(fmt1(initialBudget));
  const [budgetInvalid, setBudgetInvalid] = useState(false);
  const setBudget = (v: number) => {
    setBudgetRaw(v);
    setBudgetText(fmt1(v));
    setBudgetInvalid(false);
  };
  const budgetDirty = budgetChanged(budget, saved, initialBudget);
  useEstimateLeaveGuard(estimate.id, { draftDirty: hasDraft, budgetDirty });

  const qc = useQueryClient();
  const [savedNotice, setSavedNotice] = useState(false);
  const saveBudget = useMutation({
    mutationFn: (v: number) => apiSend('PUT', `/estimates/${estimate.id}`, { budget: v }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.estimate(estimate.id) });
      void qc.invalidateQueries({ queryKey: qk.estimates });
      setSavedNotice(true);
    },
  });
  useEffect(() => {
    if (!savedNotice) return;
    const t = setTimeout(() => setSavedNotice(false), 5000);
    return () => clearTimeout(t);
  }, [savedNotice]);
  const revertBudget = () => {
    setBudget(saved ?? initialBudget);
    saveBudget.reset();
  };

  const [pSel, setPSel] = useState<number>(20);
  const [axis, setAxis] = useState<'mm' | 'ratio'>('mm');
  const [sort, setSort] = useState<'share' | 'no'>('share');
  const [unit, setUnit] = useState<'pct' | 'mm'>('pct');

  const p = exceedance(samples, budget);
  const pText = `${pctRound(p)}%`;
  const effFor = (q: number) => effortAtExceedance(samples, q / 100);
  const eff = effFor(pSel);
  const margin = marginParts(eff, m);

  // 寄与度（期待値。間接要因は直接要因に含まれるので 0）。モンテカルロの標本平均ではなく §2.2 の期待値で、見積り・レポートと同じ値
  const contributions = useMemo(
    () => factorContributions(specFor(bundle, version), gen.levels, version.alpha * gen.sizeFP),
    [bundle, version, gen.levels, gen.sizeFP],
  );
  const contribs = useMemo(() => {
    const byId = new Map(contributions.map((c) => [c.factorId, c]));
    const items = bundle.factors.map((f) => {
      const c = byId.get(f.id);
      return { f, lv: gen.levels[f.id] ?? 0, mm: c?.mm ?? 0, share: c?.share ?? 0 };
    });
    return sort === 'share' ? [...items].sort((a, b) => b.mm - a.mm || a.f.no - b.f.no) : items;
  }, [bundle.factors, gen.levels, contributions, sort]);
  const maxMM = Math.max(...contribs.map((c) => c.mm)) || 1;
  const top2 = [...contribs].sort((a, b) => b.share - a.share).slice(0, 2).reduce((s, c) => s + c.share, 0);
  const withCum = showCumulative(sort);
  let cum = 0;

  const levers = useLeversState(bundle, gen, budget);
  const quick = [
    { label: `推定値 ${fmt1(m)}`, v: m },
    { label: `${exceedWithP(80)} ${fmt1(p80)}`, v: p80 },
    ...(saved !== null ? [{ label: `保存済みの予算 ${fmt1(saved).replace(/\.0$/, '')}`, v: saved }] : []),
  ];

  const metaGen = isDraft ? `未保存の条件${draftBaseLabel ? `（${draftBaseLabel} から編集）` : ''}` : `${gen.label}${gen.name ? ` ${gen.name}` : ''}`;
  const rowCols = withCum
    ? 'grid-cols-[minmax(6.5rem,14rem)_minmax(3rem,1fr)_3.75rem_3rem]'
    : 'grid-cols-[minmax(6.5rem,14rem)_minmax(3rem,1fr)_3.75rem]';

  return (
    <div className="flex flex-col gap-5 px-4 pt-6 pb-10 md:px-8">
      <EstimateHeader
        id={estimate.id}
        gen={genParam}
        current="risk"
        meta={`${bundle.model.name} v${version.version} ・ ${metaGen} ・ 推定 ${fmt1(m)} 人月`}
        title={estimateTitle(estimate.name)}
        lead="予算と超過確率を行き来し、どの要因を下げれば効くかを見ます。"
      />

      {/* どの条件で計算しているか */}
      {isDraft ? (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[14px] border border-warn-line bg-warn-bg px-5 py-3">
          <span className="min-w-0 flex-1 basis-[18rem] text-[12.5px] leading-relaxed text-warn-ink">
            <span className="font-bold">未保存の条件で計算中</span> — 条件画面で編集中の内容{draftBaseLabel ? `（${draftBaseLabel} から編集）` : ''}
            です。まだ世代として保存されていないため、レポートには載りません。
          </span>
          <span className="flex flex-wrap gap-2">
            {savedGen && (
              <button
                type="button"
                onClick={() => onView('saved')}
                className="btn inline-flex min-h-9 cursor-pointer items-center rounded-[10px] border border-warn-line bg-transparent px-3.5 font-[inherit] text-[12px] text-warn-ink"
              >
                保存済みの {savedGen.label} を表示
              </button>
            )}
            <Link
              to={estimatePath(estimate.id, 'conditions', genParam)}
              className="btn inline-flex min-h-9 items-center rounded-[10px] bg-accent px-3.5 text-[12px] font-bold text-bg no-underline"
            >
              条件に戻って保存する
            </Link>
          </span>
        </div>
      ) : hasDraft ? (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[14px] border border-line bg-card-2 px-5 py-3">
          <span className="min-w-0 flex-1 basis-[18rem] text-[12.5px] text-sub">
            保存済みの {gen.label} を表示しています。条件画面に未保存の変更があります。
          </span>
          <button
            type="button"
            onClick={() => onView('draft')}
            className="btn inline-flex min-h-9 cursor-pointer items-center rounded-[10px] border border-line bg-transparent px-3.5 font-[inherit] text-[12px] text-text"
          >
            未保存の条件で計算する
          </button>
        </div>
      ) : null}
      {genMissing && (
        <p role="status" className="m-0 text-[12px] text-sub">
          指定された世代（{genParam}）は見つかりませんでした。{gen.label} を表示しています。
        </p>
      )}
      {(recalculating || simError) && (
        <div role={simError ? 'alert' : 'status'} className="flex flex-wrap items-center gap-2.5 text-[12px]">
          {simError ? (
            <>
              <span className="text-coral-soft">シミュレーションを実行できませんでした。表示は直前の結果です。</span>
              <RetryButton onClick={simError} />
            </>
          ) : (
            <span className="text-sub">再計算中…（表示は直前の結果）</span>
          )}
        </div>
      )}

      <section className="grid grid-cols-12 items-start gap-4">
        {/* 超過確率曲線 */}
        <div className="tile col-span-12 flex min-w-0 flex-col gap-3 px-4 py-[22px] sm:px-[26px] xl:col-span-8" style={{ animationDelay: '0ms' }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 inline-flex items-center gap-1.5 text-[13px] font-medium">
              工数超過確率分布
              <HelpLink section="risk" className="size-6 text-[11px]" />
            </h2>
            <ViewToggle
              label="横軸"
              value={axis}
              onChange={setAxis}
              options={[
                { value: 'mm', label: '工数' },
                { value: 'ratio', label: '中央値比 %' },
              ]}
            />
          </div>
          <p className="m-0 text-[11px] leading-relaxed text-sub">{EXCEED_NOTE}</p>
          <ExceedanceCurve samples={samples} lo={range.lo} hi={range.hi} median={m} budget={budget} axis={axis} drawKey={gen.id} />
          <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-sub">
            <span>
              <span className="mr-[5px] inline-block size-2.5 rounded-[3px] bg-accent align-[-1px] opacity-40" />
              予算内の領域
            </span>
            <span>
              <span className="mr-[5px] inline-block h-[3px] w-2.5 bg-coral align-[2px]" />
              超過確率 (右へ行くほど安全)
            </span>
            <span className="sm:ml-auto">横軸は「工数」か「中央値を 100% とした比率」で切替</span>
          </div>
        </div>

        <div className="col-span-12 flex min-w-0 flex-col gap-4 xl:col-span-4">
          {/* 工数 → 超過確率 */}
          <div className="tile flex flex-col gap-2.5 px-4 py-[22px] sm:px-6" style={{ animationDelay: '100ms' }}>
            <label htmlFor="r-budget" className="text-[12px] text-sub">
              工数を入れる → 超過確率
            </label>
            <div className="flex items-center gap-2.5">
              <input
                id="r-budget"
                type="text"
                inputMode="decimal"
                value={budgetText}
                aria-invalid={budgetInvalid}
                aria-describedby={budgetInvalid ? budgetErrorId : undefined}
                onChange={(e) => {
                  setBudgetText(e.target.value);
                  const v = parseBudget(e.target.value);
                  if (v === null) setBudgetInvalid(true);
                  else {
                    setBudgetRaw(v);
                    setBudgetInvalid(false);
                  }
                }}
                onBlur={() => {
                  if (!budgetInvalid) setBudgetText(fmt1(budget));
                }}
                className={`n box-border w-full min-w-0 rounded-xl border bg-bg px-3.5 py-2 text-[26px] tracking-[-0.02em] text-text transition-colors focus:border-coral focus:outline-none ${
                  budgetInvalid ? 'border-coral' : 'border-muted'
                }`}
              />
              <span className="whitespace-nowrap text-[12px] text-sub">人月</span>
            </div>
            {budgetInvalid && (
              <p id={budgetErrorId} role="alert" className="m-0 text-[11.5px] text-coral-soft">
                {BUDGET_ERROR}（計算は直前の {fmt1(budget)} 人月のまま）
              </p>
            )}
            <input
              type="range"
              min={range.lo}
              max={range.hi}
              step={0.5}
              value={clamp(budget, range.lo, range.hi)}
              onChange={(e) => setBudget(Number(e.target.value))}
              aria-label="工数スライダー"
              className="h-7 w-full cursor-pointer accent-coral"
            />
            <div className="flex flex-wrap gap-1.5">
              {quick.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => setBudget(Math.round(q.v * 10) / 10)}
                  className="btn min-h-7 cursor-pointer rounded-full border border-muted bg-transparent px-2.5 font-[inherit] text-[11px] text-sub hover:text-text"
                >
                  {q.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 pt-1" aria-live="polite">
              <span className="n text-[48px] leading-none text-coral">{pText}</span>
              <span className="text-[12px] text-sub">の確率で超過 ・ {verdictOf(p)}</span>
            </div>

            {/* 予算の保存（レポートの「予算」に使われる） */}
            <div className="flex flex-col gap-2 border-t border-line pt-2.5">
              <span className="text-[11.5px] text-sub">
                レポートの予算: {saved !== null ? <span className="n text-text">{fmt1(saved)} 人月</span> : '未設定'}
              </span>
              {budgetDirty && !budgetInvalid && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => saveBudget.mutate(budget)}
                    disabled={saveBudget.isPending}
                    className="btn inline-flex min-h-9 cursor-pointer items-center rounded-[10px] border-0 bg-accent px-3.5 font-[inherit] text-[12px] font-bold text-bg disabled:cursor-progress disabled:opacity-60"
                  >
                    {saveBudget.isPending ? '保存中…' : '予算を保存'}
                  </button>
                  <button
                    type="button"
                    onClick={revertBudget}
                    disabled={saveBudget.isPending}
                    className="btn inline-flex min-h-9 cursor-pointer items-center rounded-[10px] border border-muted bg-transparent px-3.5 font-[inherit] text-[12px] text-sub hover:text-text"
                  >
                    元に戻す
                  </button>
                </div>
              )}
              {saveBudget.isError && (
                <p role="alert" className="m-0 text-[11.5px] text-coral-soft">
                  予算を保存できませんでした: {describeApiError(saveBudget.error)}
                </p>
              )}
              <span role="status" className="text-[11.5px] text-ok">
                {savedNotice && !budgetDirty ? `予算 ${fmt1(budget)} 人月を保存しました。レポートに反映されます。` : ''}
              </span>
            </div>
          </div>

          {/* 超過確率 → 必要工数 */}
          <div className="tile flex flex-col gap-2.5 px-4 py-[22px] sm:px-6" style={{ animationDelay: '180ms' }}>
            <span className="text-[12px] text-sub" id="r-prob-label">
              超過確率を決める → 必要な工数
            </span>
            <div role="group" aria-labelledby="r-prob-label" className="flex flex-wrap gap-1.5">
              {EXCEED_CHOICES.map((q) => (
                <button
                  key={q}
                  type="button"
                  aria-pressed={pSel === q}
                  aria-label={`超過確率 ${q}%（${exceedAux(q)}）`}
                  onClick={() => setPSel(q)}
                  className={`btn n min-h-[34px] cursor-pointer rounded-full border-0 px-3 text-[12px] ${pSel === q ? 'bg-accent text-bg' : 'bg-raised text-sub'}`}
                >
                  {q}%
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1" aria-live="polite">
              <span className="n text-[48px] leading-none text-accent">{fmt1(eff)}</span>
              <span className="text-[12px] text-sub">
                人月で超過確率 {pSel}%（{exceedAux(pSel)}）
              </span>
            </div>
            <span className="text-[11px] text-sub">
              推定値 {margin.median} に対して {margin.diff} 人月 ({margin.pct}) の余裕
            </span>
          </div>
        </div>

        {/* 寄与度 */}
        <div className="tile col-span-12 flex min-w-0 flex-col gap-3 px-4 py-[22px] sm:px-[26px] xl:col-span-7" style={{ animationDelay: '260ms' }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-[13px] font-medium">変動要因の寄与度</h2>
            <div className="flex flex-wrap gap-2">
              <ViewToggle
                label="並び順"
                value={sort}
                onChange={setSort}
                options={[
                  { value: 'share', label: '寄与度順' },
                  { value: 'no', label: '番号順' },
                ]}
              />
              <ViewToggle
                label="単位"
                value={unit}
                onChange={setUnit}
                options={[
                  { value: 'pct', label: '%' },
                  { value: 'mm', label: '人月' },
                ]}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className={`grid ${rowCols} items-center gap-3 text-[11px] text-sub`} aria-hidden="true">
              <span>要因</span>
              <span />
              <span className="text-right">{unit === 'pct' ? '寄与' : '人月'}</span>
              {withCum && <span className="text-right">累積</span>}
            </div>
            {contribs.map((c, i) => {
              cum += c.share;
              const indirect = c.f.kind === 'indirect';
              const label = `${factorNo(c.f.no)} ${c.f.name}${indirect ? ' (間接)' : ''}`;
              return (
                <div key={c.f.id} className={`grid ${rowCols} items-center gap-3 text-[12px]`}>
                  <span className="flex min-w-0 items-center gap-1" title={label}>
                    <span className="shrink-0 font-num text-sub">{factorNo(c.f.no)}</span>
                    <span className="min-w-0 truncate">
                      {c.f.name}
                      {indirect && ' (間接)'}
                    </span>
                    <span className={`n shrink-0 rounded-[5px] px-1.5 py-px text-[11px] ${c.lv === 3 ? 'bg-coral text-bg' : 'bg-raised text-sub'}`}>L{c.lv}</span>
                  </span>
                  <div className="h-3 rounded-md bg-raised">
                    <div
                      className={`fill h-full rounded-md ${c.share >= 0.25 ? 'bg-accent' : c.share > 0 ? 'bg-info' : 'bg-muted'}`}
                      style={{ width: `${mounted ? Math.round((c.mm / maxMM) * 100) : 0}%`, transitionDelay: `${i * 50}ms` }}
                    />
                  </div>
                  <span className="n text-right">{indirect ? '—' : unit === 'pct' ? `${Math.round(c.share * 100)}%` : fmt1(c.mm)}</span>
                  {withCum && <span className="n text-right text-[11px] text-sub">{Math.round(cum * 100)}%</span>}
                </div>
              );
            })}
          </div>
          <span className="text-[11px] text-sub">
            {withCum ? '右端は累積。' : ''}上位 2 要因で上乗せの {Math.round(top2 * 100)}% を占めます。間接要因は強める直接要因の寄与に含みます。
          </span>
        </div>

        {/* 効く打ち手 + 速見表 */}
        <div className="tile col-span-12 flex min-w-0 flex-col gap-2.5 self-stretch px-4 py-[22px] sm:px-6 xl:col-span-5" style={{ animationDelay: '340ms' }}>
          <h2 className="m-0 text-[13px] font-medium">効く打ち手 — レベルを 1 段下げたら</h2>
          <Levers bundle={bundle} state={levers} baseExceed={p} />
          <div className="mt-auto flex flex-col gap-1.5 border-t border-line pt-2.5">
            <span className="text-[11px] text-sub">超過確率 → 必要な工数（人月）</span>
            <div className="grid grid-cols-5 gap-1.5">
              {EXCEED_TABLE.map((q) => (
                <div key={q} className="flex min-w-0 flex-col items-center gap-0.5 rounded-[10px] bg-bg px-1 py-2">
                  <span className="text-[11px] text-sub">{q}%</span>
                  <span className="n text-[14px]">{fmt1(effFor(q))}</span>
                  <span className="text-[11px] text-sub">{exceedAux(q)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Levers({ bundle, state, baseExceed }: { bundle: ModelBundle; state: ReturnType<typeof useLeversState>; baseExceed: number }) {
  if (state.error)
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2.5 py-3">
        <p className="m-0 text-[12px] text-coral-soft">打ち手を計算できませんでした。</p>
        <RetryButton onClick={state.retry} />
      </div>
    );
  const levers = state.levers;
  if (!levers) return <p className="m-0 py-3 text-[12px] text-sub">計算中…</p>;
  if (levers.length === 0) return <p className="m-0 py-3 text-[12px] text-sub">L1 以上の直接要因がありません。</p>;
  return (
    <>
      {levers.map((lv) => {
        const f = bundle.factors.find((x) => x.id === lv.factorId);
        if (!f) return null;
        const ex = leverExceedText(baseExceed, lv.exceedance);
        return (
          <div key={lv.factorId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl bg-bg px-3 py-2.5 transition-colors hover:bg-raised">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[12px] font-medium">
                {f.name}{' '}
                <span className="text-sub">
                  L{lv.fromLevel} → L{lv.toLevel}
                </span>
              </span>
              <span className="text-[11px] text-sub">
                「{f.levels[lv.fromLevel as 0 | 1 | 2 | 3]}」を「{f.levels[lv.toLevel as 0 | 1 | 2 | 3]}」にする
              </span>
            </span>
            <span className="flex flex-col items-end gap-0.5">
              <span className="n text-[18px] whitespace-nowrap text-ok">{fmtSigned(leverDelta(lv))} 人月</span>
              {ex && <span className="text-[11px] whitespace-nowrap text-sub">{ex}</span>}
            </span>
          </div>
        );
      })}
    </>
  );
}
