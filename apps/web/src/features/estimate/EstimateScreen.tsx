import { useQueryClient } from '@tanstack/react-query';
import { expectedCO, type Levels, type SimulationResult } from 'cobra-core';
import { useEffect, useMemo, useState } from 'react';
import { SimSettingsDialog, useSimSettings } from '../sim-settings';
import { apiSend, qk } from '../../data/api';
import { runSimulation } from '../../lib/cobra-client';
import { fmt1, fmtInt } from '../../ui/format';
import { DistributionHistogram } from './DistributionHistogram';
import { PBand } from '../../ui/PBand';
import { binSamples, histRange } from '../../ui/stats';
import { useCountUp } from '../../ui/useCountUp';
import { useMounted } from '../../ui/useMounted';
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
import { EstimateHeader, ScreenMessage } from './EstimateHeader';
import { FactorLevels } from './FactorLevels';
import { GenerationStrip } from './GenerationStrip';

const PREVIEW_DEBOUNCE_MS = 200;
const HIST_BINS = 26;

const inputCls =
  'box-border w-full rounded-[10px] border border-muted bg-bg px-3 py-2.5 font-[inherit] text-[13px] text-text transition-colors focus:border-accent focus:outline-none';
const pillBtn =
  'btn min-h-7 cursor-pointer rounded-full border border-muted bg-transparent px-2.5 font-[inherit] text-[11px] text-sub hover:text-text';

function stripSamples(r: SimulationResult): StoredResults {
  const { samples, ...rest } = r;
  void samples;
  return rest;
}

export function EstimateScreen({ id }: { id: string }) {
  const { ctx, error } = useEstimateContext(id);
  if (error) return <ScreenMessage>読み込めませんでした: {error.message}</ScreenMessage>;
  if (!ctx) return <ScreenMessage>読み込み中…</ScreenMessage>;
  if (!ctx.bundle.activeVersion) return <ScreenMessage>採用中のモデル版がありません。モデル構築で版を採用してください。</ScreenMessage>;
  return <EstimateEditor key={ctx.estimate.id} ctx={ctx} />;
}

function EstimateEditor({ ctx }: { ctx: EstimateContext }) {
  const { bundle, estimate, gens, latest, reportGen } = ctx;
  const id = estimate.id;
  const version = bundle.activeVersion!;
  const alpha = version.alpha;
  const spec = useMemo(() => specFor(bundle, version), [bundle, version]);
  const settings = useSimSettings('estimate');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const sigma = useMemo(() => sigmaFor(version), [version]);
  const qc = useQueryClient();
  const mounted = useMounted();

  // 初期条件: 最新の世代。無ければ §6 の示例 G3
  const initial = useMemo(
    () =>
      latest
        ? { name: latest.name, sizeFP: latest.sizeFP, levels: { ...latest.levels }, memo: latest.notes[MEMO_KEY] ?? '' }
        : defaultInputs(bundle, estimate.name),
    // 初回のみ（以後は画面の入力が正）
    [],
  );
  const [name, setName] = useState(initial.name);
  const [sizeFP, setSizeFP] = useState(initial.sizeFP);
  const [sizeText, setSizeText] = useState(fmtInt(initial.sizeFP));
  const [levels, setLevels] = useState<Levels>(initial.levels);
  const [memo, setMemo] = useState(initial.memo);

  // 確定計算（即時）
  const det = useMemo(() => expectedCO(spec, levels), [spec, levels]);
  const nominal = alpha * sizeFP;
  const detMean = nominal * (1 + det.sco);

  // モンテカルロ（デバウンスして Web Worker）
  // プレビューは保存済みのシードで回す（「実行ごとに更新」でも入力を変えるたびに揺れないように）
  const inputKey = JSON.stringify([version.id, sizeFP, levels, settings.runs, settings.seed]);
  const [sim, setSim] = useState<{ key: string; result: SimulationResult; det: number } | null>(null);
  useEffect(() => {
    if (!(sizeFP > 0)) return;
    let alive = true;
    const d = detMean;
    const t = setTimeout(() => {
      runSimulation(spec, { alpha, sizeFP, levels, sigma }, { runs: settings.runs, seed: settings.seed })
        .then((result) => alive && setSim({ key: inputKey, result, det: d }))
        .catch(() => undefined);
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // inputKey が入力をすべて表す
  }, [inputKey]);

  // シミュレーションが追いつくまでは確定計算の比で拡大縮小して即時に見せる
  const scale = sim && sim.det > 0 ? detMean / sim.det : 1;
  const r = sim?.result;
  const p50 = r ? r.p50 * scale : detMean;
  const p20 = r ? r.pct[20] * scale : null;
  const p80 = r ? r.pct[80] * scale : null;
  const p95 = r ? r.pct[95] * scale : null;
  const shown = useCountUp(p50);

  const hist = useMemo(() => {
    if (!r) return null;
    const { lo, hi } = histRange(r.samples);
    return { counts: binSamples(r.samples, lo, hi, HIST_BINS), lo, hi };
  }, [r]);

  // 前の世代との差
  const prev = resultsOf(latest);
  const delta = prev ? p50 - prev.p50 : null;
  const same = delta !== null && Math.abs(delta) < 0.05;

  // 実行
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [runError, setRunError] = useState<string | null>(null);
  const nextLabel = nextGenLabel(gens);
  const run = async () => {
    if (running || !(sizeFP > 0)) return;
    setRunning(true);
    setProgress(0);
    setRunError(null);
    const key = inputKey;
    const d = detMean;
    const runs = settings.runs;
    const seed = settings.seedForRun();
    try {
      const result = await runSimulation(spec, { alpha, sizeFP, levels, sigma }, { runs, seed }, (_stage, done, total) => setProgress(done / total));
      setSim({ key, result, det: d });
      const notes = memo.trim() ? { [MEMO_KEY]: memo.trim() } : {};
      await apiSend('POST', `/estimates/${id}/generations`, {
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
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
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
      setSelectError(e instanceof Error ? e.message : String(e));
    } finally {
      setSelecting(null);
    }
  };

  const setLevel = (fid: string, v: number) => setLevels((l) => ({ ...l, [fid]: v }));
  const applySize = (v: number) => {
    setSizeFP(v);
    setSizeText(fmtInt(v));
  };
  const resetToLatest = () => {
    setName(latest?.name ?? initial.name);
    applySize(latest?.sizeFP ?? initial.sizeFP);
    setLevels({ ...(latest?.levels ?? initial.levels) });
  };
  const allZero = () => setLevels(Object.fromEntries(bundle.factors.map((f) => [f.id, 0])));

  // 積み上げ（名目 + 各要因の上乗せ、確定計算）
  const stack = [
    { key: 'nominal', name: '名目 (α × 規模)', v: nominal, color: 'var(--color-line-strong)' },
    ...bundle.factors
      .filter((f) => f.kind === 'direct')
      .map((f) => ({ key: f.id, name: f.name, v: nominal * (det.byFactor[f.id] ?? 0), color: `var(--color-factor-${((f.no - 1) % 8) + 1})` }))
      .filter((x) => x.v > 0.01),
  ];
  const stackTotal = stack.reduce((s, x) => s + x.v, 0) || 1;

  const nextNo = Number(nextLabel.slice(1));
  const runLabel = `見積りを実行 — 第${nextNo}世代 として保存`;
  const dropped = gens.length >= 5 ? gens[0]!.label : null;
  const doneRuns = Math.round(progress * settings.runs);

  return (
    <div className="flex flex-col gap-5 px-8 pt-6 pb-10">
      <EstimateHeader
        id={id}
        current="conditions"
        meta={`${bundle.model.name} v${version.version} ・ α ${alpha.toFixed(4)} 人月/FP`}
        title={estimateTitle(estimate.name)}
        lead="条件を動かすと右側が即時に再計算されます。実行すると世代として保存されます。"
      />

      <section className="grid grid-cols-12 items-start gap-4">
        {/* 見積り条件 */}
        <div className="tile col-span-12 flex min-w-0 flex-col gap-3.5 px-6 py-[22px] xl:col-span-5" style={{ animationDelay: '0ms' }}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="m-0 text-[13px] font-medium">見積り条件</h2>
            <div className="flex gap-1.5">
              <button type="button" className={pillBtn} onClick={resetToLatest}>
                {latest ? `${latest.label} の条件に戻す` : '初期条件に戻す'}
              </button>
              <button type="button" className={pillBtn} onClick={allZero}>
                すべて L0
              </button>
            </div>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_150px] gap-2.5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="e-name" className="text-[11px] text-sub">
                見積り名
              </label>
              <input id="e-name" type="text" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="e-size" className="text-[11px] text-sub">
                規模 (FP)
              </label>
              <input
                id="e-size"
                type="text"
                inputMode="numeric"
                className={`${inputCls} n py-1.5 text-[20px] tracking-[-0.02em]`}
                value={sizeText}
                onChange={(e) => {
                  const v = Number(e.target.value.replace(/[^0-9]/g, '')) || 0;
                  setSizeText(e.target.value);
                  setSizeFP(v);
                }}
                onBlur={() => setSizeText(fmtInt(sizeFP))}
              />
            </div>
          </div>
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
            <div className="flex items-center justify-between pb-1.5">
              <span className="text-[11px] text-sub">変動要因のレベル (0 = 影響なし → 3 = 最大)</span>
              <span className="text-[11px] text-sub">
                ΣCO <span className="n text-[15px] text-accent">+{Math.round(det.sco * 100)}%</span>
              </span>
            </div>
            <FactorLevels factors={bundle.factors} spec={spec} levels={levels} byFactor={det.byFactor} onChange={setLevel} />
          </div>

          <div className="flex flex-col gap-1.5 border-t border-line pt-2">
            <label htmlFor="e-memo" className="text-[11px] text-sub">
              前提メモ (レポートの「判断の根拠」に載ります)
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

          <div className="h-1 overflow-hidden rounded-sm bg-raised" aria-hidden="true">
            <div className="fill h-full rounded-sm bg-accent" style={{ width: `${running ? progress * 100 : 0}%`, opacity: running ? 1 : 0 }} />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn min-h-[46px] flex-1 cursor-pointer rounded-xl border-0 bg-accent font-[inherit] text-[14px] font-bold text-bg disabled:cursor-not-allowed disabled:opacity-60"
              onClick={run}
              disabled={!(sizeFP > 0)}
              aria-busy={running}
            >
              {running ? `シミュレーション中 ${Math.round(progress * 100)}% ・ ${fmtInt(doneRuns)} / ${fmtInt(settings.runs)}` : runLabel}
            </button>
            <span className="whitespace-nowrap text-[11px] text-weak">
              {fmtInt(settings.runs)} 回 ・ {settings.fixedSeed ? '乱数固定' : '乱数は毎回更新'} ・{' '}
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setSettingsOpen(true)}
                className="cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-[11px] text-accent underline"
              >
                設定
              </button>
            </span>
            <SimSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} target="estimate" />
          </div>
          {dropped && !running && <p className="m-0 -mt-1.5 text-[11px] text-weak">保存は最大 5 世代です。実行すると最も古い {dropped} が削除されます。</p>}
          {runError && (
            <p role="alert" className="m-0 text-[12px] text-coral">
              保存できませんでした: {runError}
            </p>
          )}
        </div>

        <div className="col-span-12 flex min-w-0 flex-col gap-4 xl:col-span-7">
          {/* 推定値・帯・分布 */}
          <div className="tile flex flex-col gap-[18px] px-7 py-6" style={{ animationDelay: '100ms' }}>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-[12px] text-sub">推定工数 (超過確率 50%)</span>
                <div className="flex flex-wrap items-end gap-3.5">
                  <span className="n text-[80px] leading-[0.95] text-accent" aria-live="polite" aria-atomic="true">
                    {shown.toFixed(1)}
                    <span className="ml-2 text-[22px] font-medium tracking-normal text-sub">人月</span>
                  </span>
                  {delta !== null && latest ? (
                    <span
                      className={`mb-2.5 inline-flex min-h-[26px] items-center rounded-full px-2.5 font-num text-[12px] font-bold ${
                        same ? 'bg-raised text-sub' : delta > 0 ? 'bg-coral-bg text-coral-soft' : 'bg-ok-bg text-ok'
                      }`}
                    >
                      {same ? `${latest.label} と同じ` : `${delta > 0 ? '+' : ''}${delta.toFixed(1)} vs 保存済み ${latest.label}`}
                    </span>
                  ) : (
                    <span className="mb-2.5 inline-flex min-h-[26px] items-center rounded-full bg-raised px-2.5 text-[12px] font-bold text-sub">未保存</span>
                  )}
                </div>
              </div>
              <div className="flex gap-[22px]">
                {(
                  [
                    ['楽観 P20', p20],
                    ['安全側 P80', p80],
                    ['最悪 P95', p95],
                  ] as const
                ).map(([label, v]) => (
                  <div key={label} className="flex flex-col items-end gap-0.5">
                    <span className="text-[11px] text-sub">{label}</span>
                    <span className="n text-[22px]">{v === null ? '—' : fmt1(v)}</span>
                  </div>
                ))}
              </div>
            </div>

            {p20 !== null && p80 !== null && p95 !== null ? (
              <PBand
                p20={p20}
                p50={p50}
                p80={p80}
                p95={p95}
                reference={prev && latest ? { value: prev.p50, label: `保存済み ${latest.label} ${fmt1(prev.p50)}` } : null}
              />
            ) : (
              <div className="h-[46px]" />
            )}

            {hist && p80 !== null ? (
              <DistributionHistogram
                counts={hist.counts}
                lo={hist.lo * scale}
                hi={hist.hi * scale}
                highlight={[p50, p80]}
                markers={[
                  { x: p50, label: 'P50', tone: 'accent' },
                  { x: p80, label: 'P80', tone: 'sub' },
                ]}
                ariaLabel="見積り工数の分布ヒストグラム"
              />
            ) : (
              <div className="h-[184px]" aria-busy="true" />
            )}
          </div>

          {/* 積み上げ */}
          <div className="tile flex flex-col gap-3 px-6 py-5" style={{ animationDelay: '200ms' }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="m-0 text-[13px] font-medium">工数の積み上げ — 名目 + 各要因の上乗せ</h2>
              <span className="text-[12px] text-weak">
                名目 {fmt1(nominal)} + 上乗せ {fmt1(p50 - nominal)} = {fmt1(p50)} 人月
              </span>
            </div>
            <div className="flex h-[26px] overflow-hidden rounded-lg bg-raised" role="img" aria-label="名目工数と各要因の上乗せの積み上げ">
              {stack.map((x, i) => (
                <div
                  key={x.key}
                  className="fill box-border h-full"
                  title={`${x.name} ${fmt1(x.v)}`}
                  style={{
                    width: `${mounted ? (x.v / stackTotal) * 100 : 0}%`,
                    background: x.color,
                    borderRight: i < stack.length - 1 ? '2px solid var(--color-card)' : 0,
                    transitionDelay: `${i * 40}ms`,
                  }}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {stack.map((x) => (
                <span key={x.key} className="inline-flex items-center gap-1.5 text-[11px] text-sub">
                  <span className="inline-block size-2.5 rounded-[3px]" style={{ background: x.color }} />
                  {x.name} <span className="n text-text">{fmt1(x.v)}</span>
                </span>
              ))}
            </div>
          </div>

          {/* 世代 */}
          <div className="tile flex flex-col gap-3 px-6 py-5" style={{ animationDelay: '300ms' }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="m-0 text-[13px] font-medium">世代の比較 — 最大 5 世代</h2>
              <span className="text-[12px] text-weak">実行するたびに右へ追加 ・ レポートにする世代を選べます</span>
            </div>
            <GenerationStrip gens={gens} reportGenId={reportGen?.id ?? null} onSelect={selectReport} current={p50} busyId={selecting} />
            {selectError && (
              <p role="alert" className="m-0 text-[12px] text-coral">
                レポート世代を変更できませんでした: {selectError}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
