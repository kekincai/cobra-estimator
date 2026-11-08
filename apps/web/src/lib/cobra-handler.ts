// Web Worker 側の依頼処理（純粋なロジック。postMessage は引数で受け取るのでテストできる）。
// どんな失敗でも、必ず依頼 ID 付きの error を返す（主スレッドが「実行中」のまま止まらないように）。
import { buildModel, levers, simulate } from 'cobra-core';
import type { WorkerRequest, WorkerResponse } from './cobra-protocol';

export type Post = (m: WorkerResponse, transfer?: Transferable[]) => void;

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function handleRequest(req: WorkerRequest, post: Post): void {
  const id = req && typeof req === 'object' && typeof req.id === 'number' ? req.id : null;
  if (id === null) {
    post({ id: null, type: 'fatal', message: '計算の依頼を読み取れませんでした。' });
    return;
  }
  try {
    switch (req.type) {
      case 'simulate': {
        const r = simulate(req.model, req.input, { ...req.opts, onProgress: (f) => post({ id, type: 'progress', stage: 'montecarlo', done: f, total: 1 }) });
        post({ id, type: 'result', result: r }, [r.samples.buffer]);
        return;
      }
      case 'build': {
        const r = buildModel(req.model, req.projects, { ...req.opts, onProgress: (stage, done, total) => post({ id, type: 'progress', stage, done, total }) });
        post({ id, type: 'result', result: r });
        return;
      }
      case 'levers':
        post({ id, type: 'result', result: levers(req.model, req.input, req.opts) });
        return;
      default:
        post({ id, type: 'error', message: `不明な計算の種類です（${String((req as { type?: unknown }).type)}）。` });
    }
  } catch (err) {
    // 結果の送信（postMessage の複製）で失敗した場合もここに来る。error の送信自体が失敗したら fatal を試す
    try {
      post({ id, type: 'error', message: messageOf(err) });
    } catch {
      post({ id: null, type: 'fatal', message: messageOf(err) });
    }
  }
}
