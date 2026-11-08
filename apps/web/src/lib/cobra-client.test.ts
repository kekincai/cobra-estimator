// cobra-client を偽の Worker で動かし、成功・Worker 内の例外・onerror・onmessageerror・送信失敗で
// Promise が必ず決着する（「実行中」のまま止まらない）ことを確かめる。
import { SEED_G3, SEED_MODEL } from 'cobra-core/seed';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleRequest } from './cobra-handler';
import { CALC_ERROR } from './cobra-pending';
import type { WorkerRequest, WorkerResponse } from './cobra-protocol';

type Mode = 'real' | 'silent' | 'throwOnPost';

class FakeWorker {
  static instances: FakeWorker[] = [];
  static mode: Mode = 'real';
  onmessage: ((e: { data: WorkerResponse }) => void) | null = null;
  onerror: ((e: { message: string; preventDefault: () => void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  received: WorkerRequest[] = [];
  constructor(
    public url: URL,
    public opts: unknown,
  ) {
    FakeWorker.instances.push(this);
  }
  postMessage(req: WorkerRequest) {
    if (FakeWorker.mode === 'throwOnPost') throw new DOMException('could not be cloned', 'DataCloneError');
    this.received.push(req);
    if (FakeWorker.mode === 'real') queueMicrotask(() => handleRequest(req, (m) => this.emit(m)));
  }
  emit(m: WorkerResponse) {
    this.onmessage?.({ data: m });
  }
  crash(message = 'Uncaught SyntaxError') {
    this.onerror?.({ message, preventDefault: () => undefined });
  }
  terminate() {
    this.terminated = true;
  }
}

const input = { alpha: 0.021, sizeFP: SEED_G3.sizeFP, levels: SEED_G3.levels, sigma: 0.145 };
const load = () => import('./cobra-client');

beforeEach(() => {
  vi.resetModules();
  FakeWorker.instances = [];
  FakeWorker.mode = 'real';
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cobra-client', () => {
  it('結果を resolve し、進捗を渡す。Worker は 1 つを使い回す', async () => {
    const { runSimulation, runLevers } = await load();
    const seen: number[] = [];
    const r = await runSimulation(SEED_MODEL, input, { runs: 1000, seed: 1 }, (_s, done) => seen.push(done));
    expect(r.runs).toBe(1000);
    expect(seen.at(-1)).toBe(1);
    const ls = await runLevers(SEED_MODEL, input, { runs: 200, seed: 1 });
    expect(ls).toHaveLength(3);
    expect(FakeWorker.instances).toHaveLength(1);
    expect(FakeWorker.instances[0]!.opts).toEqual({ type: 'module' });
  });

  it('同時に出した依頼をそれぞれの ID で返す', async () => {
    const { runSimulation } = await load();
    const [a, b] = await Promise.all([
      runSimulation(SEED_MODEL, input, { runs: 300, seed: 1 }),
      runSimulation(SEED_MODEL, { ...input, sizeFP: 600 }, { runs: 300, seed: 1 }),
    ]);
    expect(a.nominal).toBeCloseTo(0.021 * 1200, 12);
    expect(b.nominal).toBeCloseTo(0.021 * 600, 12);
  });

  it('Worker 内の例外は日本語メッセージで reject', async () => {
    const { runBuild } = await load();
    await expect(runBuild(SEED_MODEL, [], { runs: 10, seed: 1 })).rejects.toThrow('α の推定には 2 件以上の実績が必要です');
  });

  it('Worker 内の英語の例外は既定の日本語文言に', async () => {
    const { runSimulation } = await load();
    await expect(runSimulation(undefined as never, input, { runs: 10, seed: 1 })).rejects.toThrow(CALC_ERROR.failed);
  });

  it('onerror（起動失敗・停止）で待っている依頼をすべて reject し、次の依頼で Worker を作り直す', async () => {
    FakeWorker.mode = 'silent';
    const { runSimulation, runBuild } = await load();
    const a = runSimulation(SEED_MODEL, input, { runs: 10, seed: 1 });
    const b = runBuild(SEED_MODEL, [], { runs: 10, seed: 1 });
    const w = FakeWorker.instances[0]!;
    w.crash();
    await expect(a).rejects.toThrow(CALC_ERROR.crashed);
    await expect(b).rejects.toThrow(CALC_ERROR.crashed);
    expect(w.terminated).toBe(true);

    FakeWorker.mode = 'real';
    const c = await runSimulation(SEED_MODEL, input, { runs: 100, seed: 1 });
    expect(c.runs).toBe(100);
    expect(FakeWorker.instances).toHaveLength(2);
  });

  it('捨てた Worker から後で届いた応答は無視', async () => {
    FakeWorker.mode = 'silent';
    const { runSimulation } = await load();
    const a = runSimulation(SEED_MODEL, input, { runs: 10, seed: 1 });
    const old = FakeWorker.instances[0]!;
    const req = old.received[0]!;
    old.crash();
    await expect(a).rejects.toThrow(CALC_ERROR.crashed);
    const b = runSimulation(SEED_MODEL, input, { runs: 10, seed: 1 });
    // 古い Worker が同じ ID 体系で応答しても新しい依頼には混ざらない
    old.emit({ id: req.id + 1, type: 'result', result: 'stale' });
    const fresh = FakeWorker.instances[1]!;
    fresh.emit({ id: fresh.received[0]!.id, type: 'result', result: 'ok' });
    await expect(b).resolves.toBe('ok');
  });

  it('onmessageerror で待っている依頼を reject（Worker は使い続ける）', async () => {
    FakeWorker.mode = 'silent';
    const { runSimulation } = await load();
    const a = runSimulation(SEED_MODEL, input, { runs: 10, seed: 1 });
    FakeWorker.instances[0]!.onmessageerror?.();
    await expect(a).rejects.toThrow(CALC_ERROR.unreadable);
    expect(FakeWorker.instances[0]!.terminated).toBe(false);
  });

  it('Worker が fatal を返したら待っている依頼をすべて reject', async () => {
    FakeWorker.mode = 'silent';
    const { runSimulation } = await load();
    const a = runSimulation(SEED_MODEL, input, { runs: 10, seed: 1 });
    FakeWorker.instances[0]!.emit({ id: null, type: 'fatal', message: '計算の依頼を読み取れませんでした。' });
    await expect(a).rejects.toThrow('計算の依頼を読み取れませんでした。');
  });

  it('postMessage が投げたら（複製できない入力）その依頼だけ reject', async () => {
    FakeWorker.mode = 'throwOnPost';
    const { runSimulation } = await load();
    await expect(runSimulation(SEED_MODEL, input, { runs: 10, seed: 1 })).rejects.toThrow(CALC_ERROR.unsendable);
    FakeWorker.mode = 'real';
    await expect(runSimulation(SEED_MODEL, input, { runs: 10, seed: 1 })).resolves.toMatchObject({ runs: 10 });
  });

  it('Worker を作れない環境でも reject（例外を投げっぱなしにしない）', async () => {
    vi.stubGlobal('Worker', class {
      constructor() {
        throw new Error('Worker is not defined');
      }
    });
    const { runSimulation } = await load();
    await expect(runSimulation(SEED_MODEL, input, { runs: 10, seed: 1 })).rejects.toThrow(CALC_ERROR.crashed);
  });
});
