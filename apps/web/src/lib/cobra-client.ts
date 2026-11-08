// Web Worker への薄いラッパ。画面からは runSimulation / runBuild / runLevers を await する。
// 失敗はすべて日本語メッセージの Error で reject する（Worker 内の例外・Worker の停止・応答の破損・送信失敗）。
// 待ち合わせのロジックは cobra-pending.ts（テストあり）。
import type { BuildOptions, BuildResult, EstimateInput, Lever, ModelSpec, ProjectRecord, SimulationResult } from 'cobra-core';
import { CALC_ERROR, PendingCalls, toCalcError, type Progress } from './cobra-pending';
import type { WorkerRequest, WorkerResponse } from './cobra-protocol';

export type { Progress } from './cobra-pending';

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

function call<T>(req: DistOmit<WorkerRequest, 'id'>, onProgress?: Progress): Promise<T> {
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.add(id, { resolve: resolve as (v: unknown) => void, reject, onProgress });
    let w: Worker;
    try {
      w = getWorker();
    } catch (err) {
      pending.reject(id, toCalcError(err, CALC_ERROR.crashed));
      return;
    }
    try {
      w.postMessage({ ...req, id });
    } catch (err) {
      pending.reject(id, toCalcError(err, CALC_ERROR.unsendable));
    }
  });
}

export const runSimulation = (model: ModelSpec, input: EstimateInput, opts: { runs: number; seed: number }, onProgress?: Progress) =>
  call<SimulationResult>({ type: 'simulate', model, input, opts }, onProgress);

export const runBuild = (model: ModelSpec, projects: ProjectRecord[], opts: Omit<BuildOptions, 'onProgress'>, onProgress?: Progress) =>
  call<BuildResult>({ type: 'build', model, projects, opts }, onProgress);

export const runLevers = (model: ModelSpec, input: EstimateInput, opts: { runs: number; seed: number; budget?: number; top?: number }) =>
  call<Lever[]>({ type: 'levers', model, input, opts });
