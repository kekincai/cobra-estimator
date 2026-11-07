// ダッシュボードのデータ取得と、選択中の世代のシミュレーション（Web Worker）。
import { DEFAULT_RUNS, DEFAULT_SEED, predictiveSigma, type ExpertMode } from 'cobra-core';
import { SEED_G3 } from 'cobra-core/seed';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toModelSpec, type GenerationRow, type ModelBundle, type ModelVersionRow } from '../../../shared/types';
import { useEstimate, useEstimates, useModel, useProjects } from '../../data/api';
import { runSimulation } from '../../lib/cobra-client';
import { fromSim, fromStored, type DashResult } from './results';

export interface GenView {
  id: string;
  label: string;
  name: string;
  sizeFP: number;
  levels: Record<string, number>;
  runs: number;
  seed: number;
  alpha: number;
  /** 予測のモデル誤差 σ（LOO 残差の対数 RMS）。0 ならモデル誤差なし */
  sigma: number;
  expertMode: ExpertMode;
  createdAt: string | null;
  /** 保存済みの結果（初回描画用）。サンプル表示では null */
  stored: DashResult | null;
}

const AVG: ExpertMode = { kind: 'average' };

/** 世代のモデル版の LOO から σ を求める。LOO を持たない版（過去の構築履歴）は有効版の σ を使う */
function sigmaOf(v: ModelVersionRow | null | undefined, active: ModelVersionRow | null): number {
  return predictiveSigma(v?.loo ?? []) || predictiveSigma(active?.loo ?? []);
}

function toGenView(g: GenerationRow, versions: ModelVersionRow[], active: ModelVersionRow | null): GenView {
  const v = versions.find((x) => x.id === g.modelVersionId) ?? active;
  return {
    id: g.id, label: g.label, name: g.name, sizeFP: g.sizeFP, levels: g.levels, runs: g.runs, seed: g.seed,
    alpha: v?.alpha ?? 0, sigma: sigmaOf(v, active), expertMode: v?.expertMode ?? AVG, createdAt: g.createdAt, stored: fromStored(g.results),
  };
}

/** 世代がまだ無いときに表示する §6 G3 の入力（数値は Worker で計算する） */
function sampleGen(active: ModelVersionRow | null): GenView {
  return {
    id: 'sample', label: 'サンプル', name: '既定条件で試算', sizeFP: SEED_G3.sizeFP, levels: { ...SEED_G3.levels }, runs: DEFAULT_RUNS, seed: DEFAULT_SEED,
    alpha: active?.alpha ?? 0, sigma: sigmaOf(active, active), expertMode: active?.expertMode ?? AVG, createdAt: null, stored: null,
  };
}

export function useDashboard() {
  const model = useModel();
  const estimates = useEstimates();
  const latest = estimates.data?.[0];
  const estimate = useEstimate(latest?.id);
  const projects = useProjects();

  const bundle = model.data;
  const active = bundle?.activeVersion ?? null;
  const versions = useMemo(() => [...(bundle?.versions ?? [])].sort((a, b) => a.version - b.version), [bundle]);

  const gens = useMemo<GenView[]>(() => {
    const rows = estimate.data?.generations ?? [];
    return rows.map((g) => toGenView(g, versions, active));
  }, [estimate.data, versions, active]);
  const isSample = !!estimate.data && gens.length === 0;
  const list = isSample ? [sampleGen(active)] : gens;

  const [picked, setPicked] = useState<string | null>(null);
  const gen = list.find((g) => g.id === picked) ?? list[list.length - 1] ?? null;
  const genIndex = gen ? list.indexOf(gen) : -1;

  const sim = useGenerationSim(bundle, gen);

  return {
    loading: model.isLoading || estimates.isLoading || (!!latest && estimate.isLoading),
    error: model.error ?? estimates.error ?? estimate.error ?? null,
    bundle, active, versions, estimate: estimate.data ?? null, projects: projects.data ?? [],
    gens: list, gen, genIndex, isSample, pick: setPicked, ...sim,
  };
}

/** 選択中の世代を Worker で再計算する（同じシード → 保存値と同じ結果、加えて samples が得られる） */
function useGenerationSim(bundle: ModelBundle | undefined, gen: GenView | null) {
  const [state, setState] = useState<{ key: string; result: DashResult } | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const factorsKey = bundle?.factors.map((f) => `${f.id}:${f.updatedAt}`).join('|') ?? '';
  const key = gen && bundle ? `${gen.id}|${gen.alpha}|${gen.sigma}|${gen.runs}|${gen.seed}|${JSON.stringify(gen.expertMode)}|${factorsKey}` : '';

  const run = useCallback(
    async (withProgress: boolean) => {
      if (!gen || !bundle || !gen.alpha) return;
      const my = ++seq.current;
      const spec = toModelSpec(bundle, gen.expertMode);
      if (withProgress) {
        setRunning(true);
        setProgress(0);
      }
      try {
        // 実行が一瞬で終わっても進捗が読めるよう、表示は最低 700ms
        const [r] = await Promise.all([
          runSimulation(spec, { alpha: gen.alpha, sigma: gen.sigma, sizeFP: gen.sizeFP, levels: gen.levels }, { runs: gen.runs, seed: gen.seed }, (_s, done) => {
            if (withProgress && my === seq.current) setProgress(done);
          }),
          withProgress ? new Promise((res) => setTimeout(res, 700)) : null,
        ]);
        if (my !== seq.current) return;
        setState({ key, result: fromSim(r) });
        setError(null);
      } catch (e) {
        if (my === seq.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (my === seq.current) setRunning(false);
      }
    },
    // key に gen / bundle の変化が含まれる
    [key],
  );

  useEffect(() => {
    if (key) void run(false);
  }, [key, run]);

  const result = state?.key === key ? state.result : (gen?.stored ?? null);
  return { result, running, progress, simError: error, rerun: () => run(true) };
}
