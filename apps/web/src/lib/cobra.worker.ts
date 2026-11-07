/// <reference lib="webworker" />
// モンテカルロ・モデル構築を UI スレッド外で実行する。
import { buildModel, levers, simulate } from 'cobra-core';
import type { WorkerRequest, WorkerResponse } from './cobra-protocol';

const post = (m: WorkerResponse, transfer: Transferable[] = []) => (self as DedicatedWorkerGlobalScope).postMessage(m, transfer);

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    if (req.type === 'simulate') {
      const r = simulate(req.model, req.input, { ...req.opts, onProgress: (f) => post({ id: req.id, type: 'progress', stage: 'montecarlo', done: f, total: 1 }) });
      post({ id: req.id, type: 'result', result: r }, [r.samples.buffer]);
    } else if (req.type === 'build') {
      const r = buildModel(req.model, req.projects, { ...req.opts, onProgress: (stage, done, total) => post({ id: req.id, type: 'progress', stage, done, total }) });
      post({ id: req.id, type: 'result', result: r });
    } else if (req.type === 'levers') {
      post({ id: req.id, type: 'result', result: levers(req.model, req.input, req.opts) });
    }
  } catch (err) {
    post({ id: req.id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
