// Web Worker への薄いラッパ。画面からは runSimulation / runBuild / runLevers を await する。
// 失敗はすべて日本語メッセージの Error で reject する（Worker 内の例外・Worker の停止・応答の破損・送信失敗）。
// 待ち合わせのロジックは cobra-pending.ts（テストあり）。
//
// 取りやめ（AbortSignal）: 各 run 関数の最後の引数 { signal } で渡す。
// cobra-core の計算は同期処理で、計算中の Worker はメッセージを受け取れない（協調的な中断はできない）。
// そこで abort されたら Worker を terminate して作り直す（確実に CPU を止める）。
// - 取りやめた依頼は AbortError（isAbortError で判定、文言 CALC_ERROR.aborted）で reject する。
// - 同じ Worker で待っていた他の依頼は失敗にせず、新しい Worker に送り直す（最初から計算し直すので進捗は戻る。
//   seed 固定なので結果は同じ）。
// - 送る前に abort 済みなら Worker には何も送らずに reject。決着後の abort は何もしない。
import type { BuildOptions, BuildResult, EstimateInput, Lever, ModelSpec, ProjectRecord, SimulationResult } from 'cobra-core';
import { CALC_ERROR, PendingCalls, abortError, toCalcError, type Progress } from './cobra-pending';
import type { WorkerRequest, WorkerResponse } from './cobra-protocol';

export type { Progress } from './cobra-pending';
export { isAbortError } from './cobra-pending';

export interface CallOptions {
  /** abort すると計算を止め、AbortError で reject する */
  signal?: AbortSignal;
}

let worker: Worker | null = null;
let seq = 0;
const pending = new PendingCalls();

/** Worker を捨てて、待っている依頼をすべて失敗にする。次の依頼で新しい Worker を作る */
function discardWorker(err: Error) {
  const w = worker;
  worker = null;
  pending.failAll(err);
  try {
    w?.terminate();
  } catch {
    // 停止に失敗しても次の依頼で作り直す
  }
}

/** Worker を止めて作り直し、待っている他の依頼を新しい Worker に送り直す（取りやめ用） */
function restartWorker() {
  const w = worker;
  worker = null;
  try {
    w?.terminate();
  } catch {
    // 止められなくても、古い Worker からの応答は onmessage で無視される
  }
  const rest = pending.resendable();
  if (rest.length === 0) return;
  let nw: Worker;
  try {
    nw = getWorker();
  } catch (err) {
    pending.failAll(toCalcError(err, CALC_ERROR.crashed));
    return;
  }
  for (const { id, req } of rest) {
    try {
      nw.postMessage(req);
    } catch (err) {
      pending.reject(id, toCalcError(err, CALC_ERROR.unsendable));
    }
  }
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./cobra.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent<WorkerResponse>) => {
    if (w === worker) pending.handle(e.data);
  };
  // 起動失敗（スクリプトの読み込み・構文エラー）や、Worker 内で捕まらなかった例外
  w.onerror = (e: ErrorEvent) => {
    e.preventDefault?.();
    if (w === worker) discardWorker(toCalcError(e.message, CALC_ERROR.crashed));
  };
  // 応答を復元できない（どの依頼の応答か分からないので、待っている依頼をすべて失敗にする）
  w.onmessageerror = () => {
    if (w === worker) pending.failAll(toCalcError(null, CALC_ERROR.unreadable));
  };
  worker = w;
  return w;
}

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function call<T>(req: DistOmit<WorkerRequest, 'id'>, onProgress?: Progress, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(abortError(signal.reason));
  const id = ++seq;
  const msg = { ...req, id };
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      if (!pending.has(id)) return;
      pending.reject(id, abortError(signal?.reason));
      restartWorker();
    };
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    pending.add(id, {
      resolve: (v) => {
        cleanup();
        resolve(v as T);
      },
      reject: (e) => {
        cleanup();
        reject(e);
      },
      onProgress,
      req: msg,
    });
    signal?.addEventListener('abort', onAbort, { once: true });
    let w: Worker;
    try {
      w = getWorker();
    } catch (err) {
      pending.reject(id, toCalcError(err, CALC_ERROR.crashed));
      return;
    }
    try {
      w.postMessage(msg);
    } catch (err) {
      pending.reject(id, toCalcError(err, CALC_ERROR.unsendable));
    }
  });
}

export const runSimulation = (model: ModelSpec, input: EstimateInput, opts: { runs: number; seed: number }, onProgress?: Progress, options?: CallOptions) =>
  call<SimulationResult>({ type: 'simulate', model, input, opts }, onProgress, options?.signal);

export const runBuild = (model: ModelSpec, projects: ProjectRecord[], opts: Omit<BuildOptions, 'onProgress'>, onProgress?: Progress, options?: CallOptions) =>
  call<BuildResult>({ type: 'build', model, projects, opts }, onProgress, options?.signal);

export const runLevers = (model: ModelSpec, input: EstimateInput, opts: { runs: number; seed: number; budget?: number; top?: number }, options?: CallOptions) =>
  call<Lever[]>({ type: 'levers', model, input, opts }, undefined, options?.signal);
