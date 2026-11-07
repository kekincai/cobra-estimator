// モデル構築の実行と 3 段の進捗。
// 進捗は Web Worker（runBuild）の実際の報告を使う。ただし計算は 1 秒未満で終わるので、
// 表示は実進捗を上限に一定速度で追いかける（各段が目で追えるように）。reduced-motion なら実進捗そのまま。
import type { BuildResult, BuildStage, ModelSpec, ProjectRecord } from 'cobra-core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { runBuild } from '../../lib/cobra-client';

/** 全体の進捗に占める各段の区間（設計稿: α 推定 0–35%、モンテカルロ 35–80%、交差検証 80–100%） */
export const STAGE_SPANS: Record<BuildStage, [number, number]> = { alpha: [0, 0.35], montecarlo: [0.35, 0.8], loo: [0.8, 1] };
/** 0→100% を表示するのに最低限かける時間 */
const MIN_VISIBLE_MS = 1800;

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export type RunPhase = 'idle' | 'running' | 'done' | 'error';

export interface BuildRunState {
  phase: RunPhase;
  /** 表示上の進捗 0〜1 */
  shown: number;
  /** 計算にかかった実時間 ms（完了後） */
  elapsedMs: number | null;
  error: string | null;
}

export function useBuildRunner(onDone: (r: BuildResult, meta: { runs: number; seed: number; elapsedMs: number }) => void) {
  const [state, setState] = useState<BuildRunState>({ phase: 'idle', shown: 0, elapsedMs: null, error: null });
  const real = useRef(0);
  const raf = useRef(0);
  const alive = useRef(true);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cancelAnimationFrame(raf.current);
    };
  }, []);

  const run = useCallback((spec: ModelSpec, projects: ProjectRecord[], opts: { runs: number; seed: number }) => {
    cancelAnimationFrame(raf.current);
    real.current = 0;
    let shown = 0;
    let result: BuildResult | null = null;
    let elapsedMs = 0;
    const t0 = performance.now();
    setState({ phase: 'running', shown: 0, elapsedMs: null, error: null });

    const onProgress = (stage: BuildStage, done: number, total: number) => {
      const [a, b] = STAGE_SPANS[stage];
      real.current = Math.max(real.current, a + (b - a) * (total ? done / total : 1));
    };

    let last = performance.now();
    const tick = (t: number) => {
      if (!alive.current) return;
      const target = result ? 1 : real.current;
      shown = reduced() ? target : Math.min(target, shown + (t - last) / MIN_VISIBLE_MS);
      last = t;
      if (result && shown >= 1) {
        setState({ phase: 'done', shown: 1, elapsedMs, error: null });
        doneRef.current(result, { ...opts, elapsedMs });
        return;
      }
      setState((s) => (s.phase === 'running' ? { ...s, shown } : s));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);

    runBuild(spec, projects, opts, onProgress).then(
      (r) => {
        elapsedMs = performance.now() - t0;
        result = r;
        // 背面タブでは rAF が止まるので、その場で完了させる
        if (document.hidden && alive.current) {
          cancelAnimationFrame(raf.current);
          setState({ phase: 'done', shown: 1, elapsedMs, error: null });
          doneRef.current(r, { ...opts, elapsedMs });
        }
      },
      (e: unknown) => {
        cancelAnimationFrame(raf.current);
        if (alive.current) setState({ phase: 'error', shown: 0, elapsedMs: null, error: e instanceof Error ? e.message : String(e) });
      },
    );
  }, []);

  return { ...state, run };
}
