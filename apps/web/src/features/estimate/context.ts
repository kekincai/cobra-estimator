// 見積り・リスク・レポート画面で共有するデータ取得と計算フック。
import { useQueryClient } from '@tanstack/react-query';
import { predictiveSigma, type ExpertMode, type Lever, type Levels, type ModelSpec, type SimulationResult } from 'cobra-core';
import { SEED_G3 } from 'cobra-core/seed';
import { useEffect, useMemo, useState } from 'react';
import { apiSend, qk, useEstimate, useModel } from '../../data/api';
import { runLevers, runSimulation } from '../../lib/cobra-client';
import { toModelSpec, type EstimateWithGenerations, type GenerationRow, type ModelBundle, type ModelVersionRow } from '../../../shared/types';

/** 世代に保存する結果（samples は保存しない） */
export type StoredResults = Omit<SimulationResult, 'samples'>;

export const resultsOf = (g: GenerationRow | null | undefined): StoredResults | null => (g?.results as StoredResults | null | undefined) ?? null;

/** 世代に保存する前提メモのキー（要因 ID と衝突しない） */
export const MEMO_KEY = 'memo';

/**
 * 版のモデル誤差 σ（LOO 残差の対数 RMS）。runSimulation / runLevers の `EstimateInput.sigma` に必ず渡す。
 * 渡さないと CO のばらつきだけになり、P5〜P95 が狭くなりすぎる。
 */
export const sigmaFor = (version: ModelVersionRow | null | undefined): number => (version ? predictiveSigma(version.loo) : 0);

export const genNo = (label: string) => Number(label.slice(1)) || 0;
export const nextGenLabel = (gens: GenerationRow[]) => `G${gens.reduce((m, g) => Math.max(m, genNo(g.label)), 0) + 1}`;

/** 世代の構築に使ったモデル版（無ければ採用中の版） */
export function versionFor(bundle: ModelBundle, gen?: GenerationRow | null): ModelVersionRow | null {
  return (gen?.modelVersionId && bundle.versions.find((v) => v.id === gen.modelVersionId)) || bundle.activeVersion;
}

export function specFor(bundle: ModelBundle, version: ModelVersionRow | null): ModelSpec {
  const mode: ExpertMode = version?.expertMode ?? { kind: 'average' };
  return toModelSpec(bundle, mode);
}

export function expertLabel(bundle: ModelBundle, mode: ExpertMode | undefined): string {
  if (mode?.kind === 'expert') return mode.expert;
  const experts = [...new Set(bundle.factors.flatMap((f) => f.triangles.map((t) => t.expert)))];
  return `${experts.join(' / ')} の平均`;
}

/** 世代が無いときの初期条件（§6 の示例 G3）。要因 ID が一致するものだけ使う。 */
export function defaultInputs(bundle: ModelBundle, estimateName: string) {
  const levels: Levels = {};
  for (const f of bundle.factors) levels[f.id] = (SEED_G3.levels as Levels)[f.id] ?? 0;
  const dash = estimateName.indexOf(' — ');
  return { name: dash >= 0 ? estimateName.slice(dash + 3) : '', sizeFP: SEED_G3.sizeFP, levels, memo: '' };
}

/** 見積りタイトル（「顧客ポータル刷新 — 案B …」の前半） */
export const estimateTitle = (name: string) => name.split(' — ')[0] ?? name;

export interface EstimateContext {
  bundle: ModelBundle;
  estimate: EstimateWithGenerations;
  gens: GenerationRow[];
  latest: GenerationRow | null;
  /** レポート対象の世代（未選択なら最新） */
  reportGen: GenerationRow | null;
}

export function useEstimateContext(id: string) {
  const model = useModel();
  const est = useEstimate(id);
  const ctx = useMemo<EstimateContext | null>(() => {
    if (!model.data || !est.data) return null;
    const gens = est.data.generations;
    const latest = gens.at(-1) ?? null;
    const reportGen = gens.find((g) => g.id === est.data.reportGenerationId) ?? latest;
    return { bundle: model.data, estimate: est.data, gens, latest, reportGen };
  }, [model.data, est.data]);
  return { ctx, isLoading: model.isLoading || est.isLoading, error: model.error ?? est.error };
}

/** レポート対象の世代を変更（PUT reportGenerationId、楽観的更新） */
export function useSetReportGeneration(id: string) {
  const qc = useQueryClient();
  return async (generationId: string) => {
    const key = qk.estimate(id);
    const prev = qc.getQueryData<EstimateWithGenerations>(key);
    if (prev) qc.setQueryData(key, { ...prev, reportGenerationId: generationId });
    try {
      await apiSend('PUT', `/estimates/${id}`, { reportGenerationId: generationId });
    } catch (e) {
      if (prev) qc.setQueryData(key, prev);
      throw e;
    } finally {
      void qc.invalidateQueries({ queryKey: qk.estimates });
    }
  };
}

/**
 * 保存済み世代を、保存時の回数・シードで再シミュレーションして samples を得る（同じ入力 → 同じ結果）。
 */
export function useGenerationSimulation(bundle: ModelBundle | undefined, gen: GenerationRow | null | undefined) {
  const [state, setState] = useState<{ key: string; result: SimulationResult } | { key: string; error: string } | null>(null);
  const version = bundle ? versionFor(bundle, gen) : null;
  const key = gen && version ? `${gen.id}:${version.id}:${gen.runs}:${gen.seed}` : '';
  useEffect(() => {
    if (!bundle || !gen || !version) return;
    let alive = true;
    runSimulation(
      specFor(bundle, version),
      { alpha: version.alpha, sizeFP: gen.sizeFP, levels: gen.levels, sigma: sigmaFor(version) },
      { runs: gen.runs, seed: gen.seed },
    )
      .then((result) => alive && setState({ key, result }))
      .catch((e: unknown) => alive && setState({ key, error: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
    // key が入力（世代・版・回数・シード）を表す
  }, [key]);
  const cur = state && state.key === key ? state : null;
  return {
    result: cur && 'result' in cur ? cur.result : null,
    error: cur && 'error' in cur ? cur.error : null,
    version,
  };
}

/** 効く打ち手 Top 3（予算変更はデバウンスして再計算） */
export function useLevers(
  bundle: ModelBundle | undefined,
  gen: GenerationRow | null | undefined,
  budget: number | null,
  debounceMs = 250,
): Lever[] | null {
  const [state, setState] = useState<{ key: string; levers: Lever[] } | null>(null);
  const version = bundle ? versionFor(bundle, gen) : null;
  const key = gen && version ? `${gen.id}:${version.id}:${gen.runs}:${gen.seed}:${budget ?? ''}` : '';
  useEffect(() => {
    if (!bundle || !gen || !version) return;
    let alive = true;
    const t = setTimeout(() => {
      runLevers(
        specFor(bundle, version),
        { alpha: version.alpha, sizeFP: gen.sizeFP, levels: gen.levels, sigma: sigmaFor(version) },
        { runs: gen.runs, seed: gen.seed, budget: budget ?? undefined, top: 3 },
      )
        .then((levers) => alive && setState({ key, levers }))
        .catch(() => alive && setState({ key, levers: [] }));
    }, debounceMs);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [key]);
  // 予算だけ変わったあいだは前の結果を出し続ける（ちらつき防止）
  return key && state && (state.key === key || state.key.startsWith(key.slice(0, key.lastIndexOf(':') + 1))) ? state.levers : null;
}
