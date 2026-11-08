import { useQueryClient } from '@tanstack/react-query';
import { expectedCO, type Levels, type SimulationResult } from 'cobra-core';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { SimSettingsDialog, useSimSettings } from '../sim-settings';
import { apiSend, qk } from '../../data/api';
import { runSimulation } from '../../lib/cobra-client';
import { describeApiError } from '../../ui/apiError';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { displayDelta, factorNo, fmt1, fmtInt, fmtSigned } from '../../ui/format';
import { factorContributions } from '../../ui/contribution';
import { HelpLink } from '../../ui/HelpLink';
import { parseNumberInput } from '../../ui/numberInput';
import { EXCEED_NOTE } from '../../ui/percentile';
import { DistributionHistogram } from './DistributionHistogram';
import { PBand } from '../../ui/PBand';
import { binSamples, histRange } from '../../ui/stats';
import { useCountUp } from '../../ui/useCountUp';
import { useMounted } from '../../ui/useMounted';
import type { GenerationRow } from '../../../shared/types';
import {
  MEMO_KEY,
  defaultInputs,
  estimateTitle,
  nextGenLabel,
  resultsOf,
  sigmaFor,
  specFor,
  useEstimateContext,
  useSetReportGeneration,
  type EstimateContext,
  type StoredResults,
} from './context';
import { ESTIMATE_QUANTILES, MEDIAN_LABEL, fmtSco, stackFormula, sumShown } from './display';
import { clearDraft, inputsOfGen, sameInputs, syncDraft, useDraft, type DraftInputs, type EstimateDraft } from './draft';
import { EstimateHeader, RetryButton, ScreenError, ScreenMessage } from './EstimateHeader';
import { FactorLevels } from './FactorLevels';
import { GenerationStrip } from './GenerationStrip';
import { estimatePath, resolveGen, useGenParam } from './genParam';
import { useEstimateLeaveGuard } from './useEstimateLeaveGuard';

const PREVIEW_DEBOUNCE_MS = 200;
const HIST_BINS = 26;
const MAX_GENERATIONS = 5;

const inputCls =
  'box-border w-full rounded-[10px] border border-muted bg-bg px-3 py-2.5 font-[inherit] text-[13px] text-text transition-colors focus:border-accent focus:outline-none';
const pillBtn =
  'btn min-h-7 cursor-pointer rounded-full border border-muted bg-transparent px-2.5 font-[inherit] text-[11px] text-sub hover:text-text disabled:cursor-not-allowed disabled:opacity-50';

/** 積み上げの系列色（Tailwind のユーティリティとして書くので、テーマ変数が必ず出力される） */
const FACTOR_BG = ['bg-factor-1', 'bg-factor-2', 'bg-factor-3', 'bg-factor-4', 'bg-factor-5', 'bg-factor-6', 'bg-factor-7', 'bg-factor-8'] as const;

const SIZE_ERROR = '規模は 0 より大きい数値（FP）で入力してください。';

function stripSamples(r: SimulationResult): StoredResults {
  const { samples, ...rest } = r;
  void samples;
  return rest;
}

export function EstimateScreen({ id }: { id: string }) {
  const { ctx, error, refetch } = useEstimateContext(id);
  const genParam = useGenParam();
  const draft = useDraft(id);
  // 実行直後は、URL の ?gen= が新しい世代に変わるまで新しい世代を元にする（古い条件が一瞬出ないように）
  const [savedGenId, setSavedGenId] = useState<string | null>(null);

  const requested = ctx ? resolveGen(ctx.gens, genParam) : null;
  useEffect(() => {
    if (savedGenId && requested?.id === savedGenId) setSavedGenId(null);
  }, [savedGenId, requested?.id]);

  if (error) return <ScreenError message={describeApiError(error, '見積りを読み込めませんでした。')} onRetry={refetch} />;
  if (!ctx) return <ScreenMessage>読み込み中…</ScreenMessage>;
  if (!ctx.bundle.activeVersion) return <ScreenMessage>見積りに使用中のモデル版がありません。モデル構築で版を「見積りに使う」に設定してください。</ScreenMessage>;

  // 編集の元: 実行直後の新世代 → URL の ?gen= → 下書きの元の世代 → 最新
  const pending = savedGenId ? (ctx.gens.find((g) => g.id === savedGenId) ?? null) : null;
  const draftBase = draft ? (ctx.gens.find((g) => g.id === draft.baseGenId) ?? null) : null;
  const base = pending ?? requested ?? draftBase ?? ctx.latest;
  // 下書きがこの元に合うか（元の世代が消えた下書きは、?gen= が無ければ最新を元にして引き継ぐ）
  const draftFits = !!draft && (draft.baseGenId === (base?.id ?? null) || (!draftBase && !requested && !pending));
  const foreignDraft = draft && !draftFits ? draft : null;

  return (
    <EstimateEditor
      key={`${ctx.estimate.id}:${base?.id ?? 'new'}`}
      ctx={ctx}
      base={base}
      genParam={genParam}
      initialDraft={draftFits ? draft : null}
      foreignDraft={foreignDraft}
      foreignBase={foreignDraft ? draftBase : null}
      onSaved={setSavedGenId}
    />
  );
}

function EstimateEditor({
  ctx,
  base,
  genParam,
  initialDraft,
  foreignDraft,
  foreignBase,
  onSaved,
}: {
  ctx: EstimateContext;
  /** 編集の元にする世代（世代が無ければ null） */
  base: GenerationRow | null;
  genParam: string | null;
  initialDraft: EstimateDraft | null;
  /** 別の世代を元にした未保存の下書き（どちらを使うか選ぶまで編集を止める） */
  foreignDraft: EstimateDraft | null;
  foreignBase: GenerationRow | null;
  onSaved: (genId: string) => void;
}) {
  const { bundle, estimate, gens, reportGen } = ctx;
  const id = estimate.id;
  const version = bundle.activeVersion!;
  const alpha = version.alpha;
  const spec = useMemo(() => specFor(bundle, version), [bundle, version]);
  const settings = useSimSettings('estimate');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const sigma = useMemo(() => sigmaFor(version), [version]);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const mounted = useMounted();

  // 元の世代の条件。無ければ §6 の示例 G3（新しい見積り）
  const baseInputs = useMemo<DraftInputs>(
    () => (base ? inputsOfGen(base, MEMO_KEY) : defaultInputs(bundle, estimate.name)),
    // 元の世代が変わると key で作り直すので初回だけ
    [],
  );
  const initial = initialDraft ?? baseInputs;
  const [name, setName] = useState(initial.name);
  const [sizeFP, setSizeFP] = useState(initial.sizeFP);
  const [sizeText, setSizeText] = useState(fmtInt(initial.sizeFP));
  const [sizeError, setSizeError] = useState(false);
  const [levels, setLevels] = useState<Levels>({ ...initial.levels });
  const [memo, setMemo] = useState(initial.memo);

  // 下書きをストアへ（「リスク」へ行っても残る）。別の世代の下書きがあるあいだは上書きしない
  const current: DraftInputs = { name, sizeFP, levels, memo };
  const locked = !!foreignDraft;
  const dirty = !locked && !sameInputs(current, baseInputs);
  useEffect(() => {
    if (locked) return;
    syncDraft(id, { name, sizeFP, levels, memo }, baseInputs, base?.id ?? null);
  }, [id, locked, name, sizeFP, levels, memo, baseInputs, base?.id]);
  useEstimateLeaveGuard(id, { draftDirty: dirty || sizeError });

  // 確定計算（即時）
  const det = useMemo(() => expectedCO(spec, levels), [spec, levels]);
  const nominal = alpha * sizeFP;
  const detMean = nominal * (1 + det.sco);

  // モンテカルロ（デバウンスして Web Worker）
  // プレビューは保存済みのシードで回す（「実行ごとに更新」でも入力を変えるたびに揺れないように）
  const inputKey = JSON.stringify([version.id, sizeFP, levels, settings.runs, settings.seed]);
  const [sim, setSim] = useState<{ key: string; result: SimulationResult; det: number } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  useEffect(() => {
    if (!(sizeFP > 0)) return;
    let alive = true;
    const d = detMean;
    setPreviewError(null);
    const t = setTimeout(() => {
      runSimulation(spec, { alpha, sizeFP, levels, sigma }, { runs: settings.runs, seed: settings.seed })
        .then((result) => alive && setSim({ key: inputKey, result, det: d }))
        .catch(() => alive && setPreviewError(inputKey));
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // inputKey が入力をすべて表す
  }, [inputKey, previewAttempt]);
  const previewFailed = previewError === inputKey;
  const recalculating = !previewFailed && sim?.key !== inputKey;

  // シミュレーションが追いつくまでは確定計算の比で拡大縮小して即時に見せる
  const scale = sim && sim.det > 0 ? detMean / sim.det : 1;
  const r = sim?.result;
  const p50 = r ? r.p50 * scale : detMean;
  const quantiles = ESTIMATE_QUANTILES.map((q) => ({ ...q, v: r ? r.pct[q.p] * scale : null }));
  const p20 = quantiles[0]!.v;
  const p80 = quantiles[1]!.v;
  const p95 = quantiles[2]!.v;
  const shown = useCountUp(p50, 300);

  const hist = useMemo(() => {
    if (!r) return null;
    const { lo, hi } = histRange(r.samples);
    return { counts: binSamples(r.samples, lo, hi, HIST_BINS), lo, hi };
  }, [r]);

  // 元の世代との差（表示値どうしの差）
  const prev = resultsOf(base);
  const delta = prev ? displayDelta(p50, prev.p50) : null;
  const same = delta === 0;

  // 実行
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [runError, setRunError] = useState<string | null>(null);
  const [confirmDrop, setConfirmDrop] = useState(false);
  const nextLabel = nextGenLabel(gens);
  const droppedGen = gens.length >= MAX_GENERATIONS ? gens[0]! : null;
  const canRun = sizeFP > 0 && !sizeError && !locked;

  const run = async () => {
    if (running || !canRun) return;
    setConfirmDrop(false);
    setRunning(true);
    setProgress(0);
    setRunError(null);
    const key = inputKey;
    const d = detMean;
    const runs = settings.runs;
    const seed = settings.seedForRun();
    let result: SimulationResult;
    try {
      result = await runSimulation(spec, { alpha, sizeFP, levels, sigma }, { runs, seed }, (_stage, done, total) => setProgress(done / total));
      setSim({ key, result, det: d });
    } catch {
      setRunError('シミュレーションを実行できませんでした。もう一度実行してください。');
      setRunning(false);
      return;
    }
    try {
      const notes = memo.trim() ? { [MEMO_KEY]: memo.trim() } : {};
      const saved = await apiSend<{ id: string; label: string }>('POST', `/estimates/${id}/generations`, {
        name,
        sizeFP,
        levels,
        notes,
        runs,
        seed,
        modelVersionId: version.id,
        results: stripSamples(result),
      });
      await qc.invalidateQueries({ queryKey: qk.estimate(id) });
      void qc.invalidateQueries({ queryKey: qk.estimates });
      // 新しい世代を編集の元にし、URL も ?gen=<新しい世代> にする（リスク・レポートへのリンクも新しい世代になる）
      onSaved(saved.id);
      clearDraft(id);
      setRunning(false);
      navigate(estimatePath(id, 'conditions', saved.label), { replace: true });
    } catch (e) {
      setRunError(`保存できませんでした: ${describeApiError(e)}`);
      setRunning(false);
    }
  };
  const requestRun = () => {
    if (!canRun || running) return;
    if (droppedGen) setConfirmDrop(true);
    else void run();
  };

  // レポート世代の選択
  const setReport = useSetReportGeneration(id);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);
  const selectReport = async (genId: string) => {
    setSelecting(genId);
    setSelectError(null);
    try {
      await setReport(genId);
    } catch (e) {
      setSelectError(describeApiError(e));
    } finally {
      setSelecting(null);
    }
  };

  const setLevel = (fid: string, v: number) => setLevels((l) => ({ ...l, [fid]: v }));
  const applySize = (v: number) => {
    setSizeFP(v);
    setSizeText(fmtInt(v));
    setSizeError(false);
  };
  const resetToBase = () => {
    setName(baseInputs.name);
    applySize(baseInputs.sizeFP);
    setLevels({ ...baseInputs.levels });
    setMemo(baseInputs.memo);
  };
  const allZero = () => setLevels(Object.fromEntries(bundle.factors.map((f) => [f.id, 0])));

  // 積み上げ（名目 + 各要因の上乗せ、確定計算 = 期待値。リスク・レポートと同じ factorContributions）。並びは要因番号順
  const contribById = new Map(factorContributions(spec, levels, nominal).map((c) => [c.factorId, c.mm]));
  const stack = [
    { key: 'nominal', no: '', name: '名目 (α × 規模)', v: nominal, bg: 'bg-line-strong', ink: 'text-text' },
    ...bundle.factors
      .filter((f) => f.kind === 'direct')
      .map((f) => ({
        key: f.id,
        no: factorNo(f.no),
        name: f.name,
        v: contribById.get(f.id) ?? 0,
        bg: FACTOR_BG[(f.no - 1) % FACTOR_BG.length]!,
        ink: 'text-bg',
      }))
      .filter((x) => x.v > 0.01),
  ];
  const stackTotal = stack.reduce((s, x) => s + x.v, 0) || 1;
  const formula = stackFormula(nominal, p50);
  const breakdownSum = sumShown(stack.slice(1).map((x) => x.v));
  const breakdownDiffers = fmt1(breakdownSum) !== formula.overhead;

  const nextNo = Number(nextLabel.slice(1));
  const runLabel = droppedGen ? `見積りを実行 — 第${nextNo}世代 として保存（${droppedGen.label} を削除）` : `見積りを実行 — 第${nextNo}世代 として保存`;
  const doneRuns = Math.round(progress * settings.runs);
  const baseLabel = base?.label ?? null;
  const droppedIsReport = !!droppedGen && droppedGen.id === reportGen?.id;

  return (
    <div className="flex flex-col gap-5 px-4 pt-6 pb-10 md:px-8">
      <EstimateHeader
        id={id}
        gen={genParam}
        current="conditions"
        meta={
          <>
            <span>
              {bundle.model.name} v{version.version} ・ α {alpha.toFixed(4)} 人月/FP
            </span>
            {dirty && <span className="rounded-full bg-warn-bg px-2 py-px text-[11px] text-warn-ink">未保存の変更あり{baseLabel ? `（${baseLabel} から編集）` : ''}</span>}
          </>
        }
        title={estimateTitle(estimate.name)}
        lead="条件を動かすと右側が即時に再計算されます。実行すると世代として保存されます。"
      />

      {foreignDraft && (
        <ForeignDraftNotice
          id={id}
          draft={foreignDraft}
          draftBase={foreignBase}
          requestedLabel={baseLabel}
          onDiscard={() => clearDraft(id)}
        />
      )}

      {gens.length === 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-line bg-card-2 px-5 py-3 text-[12.5px] text-sub" role="note">
          <span className="font-medium text-text">まだ世代がありません。</span>
          規模とレベルを決めて「見積りを実行」すると、G1 として保存されます。初期値は社内標準モデルの示例です。
        </div>
      )}

      <section className="grid grid-cols-12 items-start gap-4">
        {/* 見積り条件 */}
        <div className="tile col-span-12 flex min-w-0 flex-col gap-3.5 px-4 py-[22px] sm:px-6 xl:col-span-5" style={{ animationDelay: '0ms' }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-[13px] font-medium">見積り条件</h2>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={pillBtn} onClick={resetToBase} disabled={locked || !dirty}>
                {baseLabel ? `${baseLabel} の条件に戻す` : '初期条件に戻す'}
              </button>
              <button type="button" className={pillBtn} onClick={allZero} disabled={locked}>
                すべて L0
              </button>
            </div>
          </div>
          <fieldset disabled={locked} className="m-0 flex min-w-0 flex-col gap-3.5 border-0 p-0">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(104px,150px)] gap-2.5">
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="e-name" className="text-[11px] text-sub">
                  見積り名
                </label>
                <input id="e-name" type="text" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="e-size" className="text-[11px] text-sub">
                  規模 (FP)
                </label>
                <input
                  id="e-size"
                  type="text"
                  inputMode="numeric"
                  aria-invalid={sizeError}
                  aria-describedby={sizeError ? 'e-size-error' : undefined}
                  className={`${inputCls} n py-1.5 text-[20px] tracking-[-0.02em] ${sizeError ? 'border-coral focus:border-coral' : ''}`}
                  value={sizeText}
                  onChange={(e) => {
                    setSizeText(e.target.value);
                    const v = parseNumberInput(e.target.value);
                    if (v !== null && v > 0) {
                      setSizeFP(v);
                      setSizeError(false);
                    } else setSizeError(true);
                  }}
                  onBlur={() => {
                    if (!sizeError) setSizeText(fmtInt(sizeFP));
                  }}
                />
              </div>
            </div>
            {sizeError && (
              <p id="e-size-error" role="alert" className="m-0 -mt-2 text-[11.5px] text-coral-soft">
                {SIZE_ERROR}（計算は直前の {fmtInt(sizeFP)} FP のまま）
              </p>
            )}
            <input
              type="range"
              min={200}
              max={2400}
              step={10}
              value={sizeFP}
              onChange={(e) => applySize(Number(e.target.value))}
              aria-label="規模スライダー"
              className="-mt-1.5 h-6 w-full cursor-pointer accent-accent"
            />

            <div className="flex flex-col gap-0.5 border-t border-line pt-2">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5">
                <span className="inline-flex items-center gap-1.5 text-[11px] text-sub">
                  変動要因のレベル (0 = 影響なし → 3 = 最大)
                  <HelpLink section="factors" className="size-6 text-[11px]" />
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-sub">
                  ΣCO <span className="n text-[15px] text-accent">{fmtSco(det.sco)}</span>
                  <HelpLink section="formula" className="size-6 text-[11px]" />
                </span>
              </div>
              <FactorLevels factors={bundle.factors} spec={spec} levels={levels} byFactor={det.byFactor} onChange={setLevel} disabled={locked} />
            </div>

            <div className="flex flex-col gap-1.5 border-t border-line pt-2">
              <label htmlFor="e-memo" className="text-[11px] text-sub">
                前提メモ (レポートの「前提と注意事項」に載ります)
              </label>
              <textarea
                id="e-memo"
                rows={2}
                className={`${inputCls} resize-y`}
                placeholder="例: 外部連携 6 システムのうち 2 つは仕様未確定"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </div>
          </fieldset>

          <div className="h-1 overflow-hidden rounded-sm bg-raised" aria-hidden="true">
            <div className="fill h-full rounded-sm bg-accent" style={{ width: `${running ? progress * 100 : 0}%`, opacity: running ? 1 : 0 }} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn min-h-[46px] min-w-0 flex-1 basis-[16rem] cursor-pointer rounded-xl border-0 bg-accent px-3 font-[inherit] text-[14px] font-bold text-bg disabled:cursor-not-allowed disabled:opacity-60"
              onClick={requestRun}
              disabled={!canRun}
              aria-busy={running}
            >
              {running ? `シミュレーション中 ${Math.round(progress * 100)}% ・ ${fmtInt(doneRuns)} / ${fmtInt(settings.runs)}` : runLabel}
            </button>
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setSettingsOpen(true)}
              className="btn inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border border-muted bg-transparent px-3 font-[inherit] text-[11px] whitespace-nowrap text-sub hover:text-text"
            >
              {fmtInt(settings.runs)} 回 ・ {settings.fixedSeed ? '乱数固定' : '乱数は毎回更新'}
              <span className="text-accent underline">設定</span>
            </button>
            <SimSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} target="estimate" />
          </div>
          {droppedGen && !running && (
            <p className="m-0 -mt-1.5 text-[11.5px] text-coral-soft">
              保存は最大 {MAX_GENERATIONS} 世代です。実行すると最も古い {droppedGen.label} が削除されます（元に戻せません）。
            </p>
          )}
          {runError && (
            <div role="alert" className="flex flex-wrap items-center gap-2.5">
              <p className="m-0 text-[12px] text-coral-soft">{runError}</p>
              <RetryButton onClick={requestRun} />
            </div>
          )}
          <ConfirmDialog
            open={confirmDrop}
            title={`${droppedGen?.label ?? ''} を削除して保存しますか？`}
            confirmLabel={`${droppedGen?.label ?? ''} を削除して実行`}
            danger
            onConfirm={() => void run()}
            onCancel={() => setConfirmDrop(false)}
          >
            保存は最大 {MAX_GENERATIONS} 世代です。{nextLabel} を保存すると、最も古い {droppedGen?.label}
            {resultsOf(droppedGen) ? `（推定 ${fmt1(resultsOf(droppedGen)!.p50)} 人月）` : ''} が削除され、元に戻せません。
            {droppedIsReport && ` ${droppedGen?.label} はレポートに使用中です。削除後は最新の世代がレポートに使われます。`}
          </ConfirmDialog>
        </div>

        <div className="col-span-12 flex min-w-0 flex-col gap-4 xl:col-span-7">
          {/* 推定値・帯・分布 */}
          <div className="tile flex flex-col gap-[18px] px-4 py-6 sm:px-7" style={{ animationDelay: '100ms' }}>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="inline-flex flex-wrap items-center gap-1.5 text-[12px] text-sub">
                  推定工数 — {MEDIAN_LABEL}
                  <HelpLink section="estimate" className="size-6 text-[11px]" />
                  {recalculating && (
                    <span role="status" className="rounded-full bg-raised px-2 py-px text-[11px] text-sub">
                      再計算中…
                    </span>
                  )}
                </span>
                <div className="flex flex-wrap items-end gap-x-3.5 gap-y-1">
                  <span className="n text-[64px] leading-[0.95] text-accent sm:text-[80px]" aria-hidden="true">
                    {shown.toFixed(1)}
                    <span className="ml-2 text-[22px] font-medium tracking-normal text-sub">人月</span>
                  </span>
                  {/* 読み上げは確定した値だけ（カウントアップの途中の値を読ませない） */}
                  <span className="sr-only" aria-live="polite" aria-atomic="true">
                    {recalculating ? '' : `推定工数 ${fmt1(p50)} 人月`}
                  </span>
                  {delta !== null && base ? (
                    <span
                      className={`mb-2.5 inline-flex min-h-[26px] items-center rounded-full px-2.5 font-num text-[12px] font-bold ${
                        same ? 'bg-raised text-sub' : delta > 0 ? 'bg-coral-bg text-coral-soft' : 'bg-ok-bg text-ok'
                      }`}
                    >
                      {same ? `${base.label} と同じ` : `${fmtSigned(delta)} vs 保存済み ${base.label}`}
                    </span>
                  ) : (
                    <span className="mb-2.5 inline-flex min-h-[26px] items-center rounded-full bg-raised px-2.5 text-[12px] font-bold text-sub">未保存</span>
                  )}
                </div>
              </div>
              <dl className="m-0 flex flex-wrap gap-x-[22px] gap-y-2">
                {quantiles.map((q) => (
                  <div key={q.p} className="flex flex-col items-end gap-0.5">
                    <dt className="text-[11px] text-sub">{q.tag}</dt>
                    <dd className="m-0 flex flex-col items-end gap-0.5">
                      <span className="n text-[22px]">{q.v === null ? '—' : fmt1(q.v)}</span>
                      <span className="text-[11px] text-sub">{q.label}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <p className="m-0 -mt-2 text-[11px] leading-relaxed text-sub">{EXCEED_NOTE}</p>

            {previewFailed && (
              <div role="alert" className="flex flex-wrap items-center gap-2.5">
                <p className="m-0 text-[12px] text-coral-soft">シミュレーションを実行できませんでした。分布と幅は表示できません。</p>
                <RetryButton onClick={() => setPreviewAttempt((n) => n + 1)} />
              </div>
            )}

            {p20 !== null && p80 !== null && p95 !== null ? (
              <PBand
                p20={p20}
                p50={p50}
                p80={p80}
                p95={p95}
                reference={prev && base ? { value: prev.p50, label: `保存済み ${base.label} ${fmt1(prev.p50)}` } : null}
              />
            ) : (
              !previewFailed && <div className="h-[46px]" />
            )}

            {hist && p80 !== null ? (
              <DistributionHistogram
                counts={hist.counts}
                lo={hist.lo * scale}
                hi={hist.hi * scale}
                highlight={[p50, p80]}
                markers={[
                  { x: p50, label: '中央値', tone: 'accent' },
                  { x: p80, label: '超過確率 20%', tone: 'sub' },
                ]}
                ariaLabel={`見積り工数の分布ヒストグラム。中央値 ${fmt1(p50)} 人月、超過確率 20%（P80）${fmt1(p80)} 人月`}
              />
            ) : (
              !previewFailed && <div className="h-[184px]" aria-busy="true" />
            )}
          </div>

          {/* 積み上げ */}
          <div className="tile flex flex-col gap-3 px-4 py-5 sm:px-6" style={{ animationDelay: '200ms' }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="m-0 text-[13px] font-medium">工数の積み上げ — 名目 + 各要因の上乗せ</h2>
              <span className="text-[12px] text-sub">
                名目 {formula.nominal} + 上乗せ {formula.overhead} = {formula.total} 人月
              </span>
            </div>
            <div
              className="flex h-[26px] overflow-hidden rounded-lg bg-raised"
              role="img"
              aria-label={`名目工数と各要因の上乗せの積み上げ: ${stack.map((x) => `${x.no ? `${x.no} ` : ''}${x.name} ${fmt1(x.v)}`).join('、')} 人月`}
            >
              {stack.map((x, i) => {
                const w = (x.v / stackTotal) * 100;
                return (
                  <div
                    key={x.key}
                    className={`fill box-border flex h-full items-center justify-center overflow-hidden ${x.bg}`}
                    title={`${x.no ? `${x.no} ` : ''}${x.name} ${fmt1(x.v)}`}
                    style={{
                      width: `${mounted ? w : 0}%`,
                      borderRight: i < stack.length - 1 ? '2px solid var(--color-card)' : 0,
                      transitionDelay: `${i * 40}ms`,
                    }}
                  >
                    {/* 色だけに頼らないよう、幅があれば番号を書く */}
                    {w >= 6 && (
                      <span className={`n text-[11px] tracking-normal ${x.ink}`} aria-hidden="true">
                        {x.no || '名目'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {stack.map((x) => (
                <span key={x.key} className="inline-flex items-center gap-1.5 text-[11px] text-sub">
                  <span className={`inline-block size-2.5 shrink-0 rounded-[3px] ${x.bg}`} aria-hidden="true" />
                  {x.no && <span className="font-num text-sub">{x.no}</span>}
                  {x.name} <span className="n text-text">{fmt1(x.v)}</span>
                </span>
              ))}
            </div>
            {breakdownDiffers && (
              <p className="m-0 text-[11px] text-sub">
                各要因の値は期待値をそれぞれ四捨五入しています（並んだ数字の合計 {fmt1(breakdownSum)}、上乗せ {formula.overhead} 人月）。
              </p>
            )}
          </div>

          {/* 世代 */}
          <div className="tile flex flex-col gap-3 px-4 py-5 sm:px-6" style={{ animationDelay: '300ms' }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="m-0 text-[13px] font-medium">世代の比較 — 最大 {MAX_GENERATIONS} 世代</h2>
              <span className="text-[12px] text-sub">実行するたびに右へ追加 ・ カードを押すとレポートにする世代を選べます</span>
            </div>
            <GenerationStrip
              estimateId={id}
              gens={gens}
              reportGenId={reportGen?.id ?? null}
              baseGenId={base?.id ?? null}
              droppedGenId={droppedGen?.id ?? null}
              onSelect={selectReport}
              current={p50}
              busyId={selecting}
            />
            {selectError && (
              <p role="alert" className="m-0 text-[12px] text-coral-soft">
                レポート世代を変更できませんでした: {selectError}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/** 別の世代を元にした未保存の下書きがあるとき（例: G3 を編集中に ?gen=G2 を開いた） */
function ForeignDraftNotice({
  id,
  draft,
  draftBase,
  requestedLabel,
  onDiscard,
}: {
  id: string;
  draft: EstimateDraft;
  draftBase: GenerationRow | null;
  requestedLabel: string | null;
  onDiscard: () => void;
}) {
  const from = draftBase ? `${draftBase.label} から編集した` : '';
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[14px] border border-warn-line bg-warn-bg px-5 py-3">
      <span className="min-w-0 flex-1 basis-[18rem] text-[12.5px] text-warn-ink">
        {from}未保存の条件（規模 {fmtInt(draft.sizeFP)} FP）があります。どちらを使うか選んでください。選ぶまで編集できません。
      </span>
      <span className="flex flex-wrap gap-2">
        <Link
          to={estimatePath(id, 'conditions', draftBase?.label ?? null)}
          replace
          className="btn inline-flex min-h-9 items-center rounded-[10px] bg-accent px-3.5 text-[12px] font-bold text-bg no-underline"
        >
          未保存の条件を開く
        </Link>
        <button
          type="button"
          onClick={onDiscard}
          className="btn inline-flex min-h-9 cursor-pointer items-center rounded-[10px] border border-warn-line bg-transparent px-3.5 font-[inherit] text-[12px] text-warn-ink"
        >
          破棄して {requestedLabel ?? '保存済み'} の条件を使う
        </button>
      </span>
    </div>
  );
}
