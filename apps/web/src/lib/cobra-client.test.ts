// cobra-client を偽の Worker で動かし、成功・Worker 内の例外・onerror・onmessageerror・送信失敗で
// Promise が必ず決着する（「実行中」のまま止まらない）ことを確かめる。
import { SEED_G3, SEED_MODEL } from 'cobra-core/seed';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleRequest } from './cobra-handler';
import { CALC_ERROR, isAbortError } from './cobra-pending';
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

  describe('取りやめ（AbortSignal）', () => {
    const reasonOf = async (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);

    it('開始前に abort 済みなら Worker に何も送らず AbortError で reject', async () => {
      const { runBuild } = await load();
      const ac = new AbortController();
      ac.abort();
      const e = await reasonOf(runBuild(SEED_MODEL, [], { runs: 10, seed: 1 }, undefined, { signal: ac.signal }));
      expect(isAbortError(e)).toBe(true);
      expect((e as Error).message).toBe(CALC_ERROR.aborted);
      expect(FakeWorker.instances).toHaveLength(0);
    });

    it('計算中に abort すると AbortError で reject し、Worker を止める。後から届いた応答は無視', async () => {
      FakeWorker.mode = 'silent';
      const { runSimulation } = await load();
      const ac = new AbortController();
      const seen: number[] = [];
      const a = runSimulation(SEED_MODEL, input, { runs: 10, seed: 1 }, (_s, done) => seen.push(done), { signal: ac.signal });
      const w = FakeWorker.instances[0]!;
      const id = w.received[0]!.id;
      w.emit({ id, type: 'progress', stage: 'montecarlo', done: 0.4, total: 1 });
      ac.abort();
      const e = await reasonOf(a);
      expect(isAbortError(e)).toBe(true);
      expect(w.terminated).toBe(true);
      // 他に待っている依頼がないので、新しい Worker は次の依頼まで作らない
      expect(FakeWorker.instances).toHaveLength(1);
      w.emit({ id, type: 'progress', stage: 'montecarlo', done: 0.8, total: 1 });
      w.emit({ id, type: 'result', result: 'stale' });
      expect(seen).toEqual([0.4]);
    });

    it('同じ Worker で待っていた他の依頼は失敗にせず、新しい Worker に送り直して結果を返す', async () => {
      FakeWorker.mode = 'silent';
      const { runSimulation, runBuild } = await load();
      const ac = new AbortController();
      const other = runSimulation(SEED_MODEL, input, { runs: 300, seed: 1 });
      const b = runBuild(SEED_MODEL, [], { runs: 10, seed: 1 }, undefined, { signal: ac.signal });
      const old = FakeWorker.instances[0]!;
      const otherReq = old.received[0]!;
      ac.abort();
      expect(isAbortError(await reasonOf(b))).toBe(true);
      expect(old.terminated).toBe(true);
      expect(FakeWorker.instances).toHaveLength(2);
      const fresh = FakeWorker.instances[1]!;
      expect(fresh.received).toEqual([otherReq]);
      // 新しい Worker で計算した結果が、元の依頼に届く
      handleRequest(fresh.received[0]!, (m) => fresh.emit(m));
      await expect(other).resolves.toMatchObject({ runs: 300 });
    });

    it('決着した後の abort は何もしない（Worker も止めない）', async () => {
      const { runSimulation } = await load();
      const ac = new AbortController();
      const r = await runSimulation(SEED_MODEL, input, { runs: 100, seed: 1 }, undefined, { signal: ac.signal });
      expect(r.runs).toBe(100);
      ac.abort();
      expect(FakeWorker.instances[0]!.terminated).toBe(false);
      await expect(runSimulation(SEED_MODEL, input, { runs: 50, seed: 1 })).resolves.toMatchObject({ runs: 50 });
      expect(FakeWorker.instances).toHaveLength(1);
    });

    it('失敗で決着した後の abort も何もしない', async () => {
      const { runBuild } = await load();
      const ac = new AbortController();
      await expect(runBuild(SEED_MODEL, [], { runs: 10, seed: 1 }, undefined, { signal: ac.signal })).rejects.toThrow('2 件以上');
      ac.abort();
      expect(FakeWorker.instances[0]!.terminated).toBe(false);
    });

    it('取りやめた後の依頼は新しい Worker で普通に計算できる（同じ seed なら同じ結果）', async () => {
      const { runBuild, runSimulation } = await load();
      const expected = await runSimulation(SEED_MODEL, input, { runs: 500, seed: 3 });
      FakeWorker.mode = 'silent';
      const ac = new AbortController();
      const a = runSimulation(SEED_MODEL, input, { runs: 500, seed: 3 }, undefined, { signal: ac.signal });
      ac.abort();
      expect(isAbortError(await reasonOf(a))).toBe(true);
      FakeWorker.mode = 'real';
      const again = await runSimulation(SEED_MODEL, input, { runs: 500, seed: 3 });
      expect(again.p50).toBe(expected.p50);
      expect(FakeWorker.instances).toHaveLength(2);
      expect(FakeWorker.instances[1]!.terminated).toBe(false);
      await expect(runBuild(SEED_MODEL, [], { runs: 10, seed: 1 })).rejects.toThrow('2 件以上');
    });

    it('signal を渡さない従来の呼び方はそのまま動く（runLevers も options を受け取る）', async () => {
      const { runLevers } = await load();
      const ac = new AbortController();
      await expect(runLevers(SEED_MODEL, input, { runs: 200, seed: 1 }, { signal: ac.signal })).resolves.toHaveLength(3);
    });
  });
});
