// モデル構築の実行と 3 段の進捗。
// 進捗は Web Worker（runBuild）の実際の報告を使う。ただし計算は 1 秒未満で終わるので、
// 表示は実進捗を上限に一定速度で追いかける（各段が目で追えるように）。reduced-motion なら実進捗そのまま。
// cancel(): cobra-client に中断の仕組みがないため、Worker の計算は最後まで走るが結果は捨てる（保存もしない）。
import type { BuildResult, BuildStage, ModelSpec, ProjectRecord } from 'cobra-core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { runBuild } from '../../lib/cobra-client';
import { STAGE_SPANS } from './progress';
import { MIN_VISIBLE_MS } from './runEstimate';

export { STAGE_SPANS };

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export type RunPhase = 'idle' | 'running' | 'done' | 'error' | 'cancelled';

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
  /** 実行ごとの番号。cancel や次の run で古い結果を捨てる */
  const token = useRef(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      token.current++;
      cancelAnimationFrame(raf.current);
    };
  }, []);

  /** excluded: 不採用の実績。α には使わず、不整合の判定だけ行う（cobra-core `BuildOptions.excluded`） */
  const run = useCallback((spec: ModelSpec, projects: ProjectRecord[], opts: { runs: number; seed: number }, excluded: ProjectRecord[] = []) => {
    cancelAnimationFrame(raf.current);
    const my = ++token.current;
    const current = () => alive.current && token.current === my;
    real.current = 0;
    let shown = 0;
    let result: BuildResult | null = null;
    let elapsedMs = 0;
    const t0 = performance.now();
    setState({ phase: 'running', shown: 0, elapsedMs: null, error: null });

    const onProgress = (stage: BuildStage, done: number, total: number) => {
      if (!current()) return;
      const [a, b] = STAGE_SPANS[stage];
      real.current = Math.max(real.current, a + (b - a) * (total ? done / total : 1));
    };

    let last = performance.now();
    const tick = (t: number) => {
      if (!current()) return;
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

    runBuild(spec, projects, { ...opts, excluded }, onProgress).then(
      (r) => {
        if (!current()) return;
        elapsedMs = performance.now() - t0;
        result = r;
        // 背面タブでは rAF が止まるので、その場で完了させる
        if (document.hidden) {
          cancelAnimationFrame(raf.current);
          setState({ phase: 'done', shown: 1, elapsedMs, error: null });
          doneRef.current(r, { ...opts, elapsedMs });
        }
      },
      (e: unknown) => {
        if (!current()) return;
        cancelAnimationFrame(raf.current);
        setState({ phase: 'error', shown: 0, elapsedMs: null, error: e instanceof Error ? e.message : String(e) });
      },
    );
  }, []);

  /** 実行中の構築を取りやめる。結果は表示も保存もしない */
  const cancel = useCallback(() => {
    token.current++;
    cancelAnimationFrame(raf.current);
    setState((s) => (s.phase === 'running' ? { phase: 'cancelled', shown: 0, elapsedMs: null, error: null } : s));
  }, []);

  return { ...state, run, cancel };
}
