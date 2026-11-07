// Web Worker への薄いラッパ。画面からは runSimulation / runBuild / runLevers を await する。
import type { BuildOptions, BuildResult, BuildStage, EstimateInput, Lever, ModelSpec, ProjectRecord, SimulationResult } from 'cobra-core';
import type { WorkerRequest, WorkerResponse } from './cobra-protocol';

export type Progress = (stage: BuildStage, done: number, total: number) => void;

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; onProgress?: Progress }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./cobra.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const m = e.data;
    const p = pending.get(m.id);
    if (!p) return;
    if (m.type === 'progress') p.onProgress?.(m.stage, m.done, m.total);
    else {
      pending.delete(m.id);
      if (m.type === 'result') p.resolve(m.result);
      else p.reject(new Error(m.message));
    }
  };
  return worker;
}

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function call<T>(req: DistOmit<WorkerRequest, 'id'>, onProgress?: Progress): Promise<T> {
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress });
    getWorker().postMessage({ ...req, id });
  });
}

export const runSimulation = (model: ModelSpec, input: EstimateInput, opts: { runs: number; seed: number }, onProgress?: Progress) =>
  call<SimulationResult>({ type: 'simulate', model, input, opts }, onProgress);

export const runBuild = (model: ModelSpec, projects: ProjectRecord[], opts: Omit<BuildOptions, 'onProgress'>, onProgress?: Progress) =>
  call<BuildResult>({ type: 'build', model, projects, opts }, onProgress);

export const runLevers = (model: ModelSpec, input: EstimateInput, opts: { runs: number; seed: number; budget?: number; top?: number }) =>
  call<Lever[]>({ type: 'levers', model, input, opts });
