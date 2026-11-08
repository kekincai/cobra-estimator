import { DEFAULT_SEED, simulate } from 'cobra-core';
import { SEED_G3, SEED_MODEL, SEED_PROJECTS } from 'cobra-core/seed';
import { describe, expect, it } from 'vitest';
import { handleRequest } from './cobra-handler';
import type { WorkerRequest, WorkerResponse } from './cobra-protocol';

const input = { alpha: 0.021, sizeFP: SEED_G3.sizeFP, levels: SEED_G3.levels, sigma: 0.145 };

function collect() {
  const out: { m: WorkerResponse; transfer?: Transferable[] }[] = [];
  return { out, post: (m: WorkerResponse, transfer?: Transferable[]) => void out.push({ m, transfer }) };
}

describe('handleRequest（Worker 側）', () => {
  it('simulate: 進捗のあと結果、samples の buffer を transfer に渡す。値は直接呼んだ simulate と同じ', () => {
    const { out, post } = collect();
    handleRequest({ id: 7, type: 'simulate', model: SEED_MODEL, input, opts: { runs: 2000, seed: DEFAULT_SEED } }, post);
    const last = out.at(-1)!;
    expect(last.m.type).toBe('result');
    expect(last.m.id).toBe(7);
    const progress = out.slice(0, -1).map((x) => x.m);
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.every((m) => m.type === 'progress' && m.id === 7 && m.stage === 'montecarlo')).toBe(true);
    const r = (last.m as { result: ReturnType<typeof simulate> }).result;
    expect(last.transfer).toEqual([r.samples.buffer]);
    expect(r.p50).toBe(simulate(SEED_MODEL, input, { runs: 2000, seed: DEFAULT_SEED }).p50);
  });

  it('build: 段階の進捗と結果', () => {
    const { out, post } = collect();
    const projects = SEED_PROJECTS.filter((p) => p.adopted);
    handleRequest({ id: 1, type: 'build', model: SEED_MODEL, projects, opts: { runs: 500, seed: 1 } }, post);
    const stages = [...new Set(out.filter((x) => x.m.type === 'progress').map((x) => (x.m as { stage: string }).stage))];
    expect(stages).toEqual(['alpha', 'montecarlo', 'loo']);
    expect(out.at(-1)!.m).toMatchObject({ id: 1, type: 'result' });
  });

  it('levers: 結果', () => {
    const { out, post } = collect();
    handleRequest({ id: 3, type: 'levers', model: SEED_MODEL, input, opts: { runs: 500, seed: 1, budget: 45 } }, post);
    expect(out).toHaveLength(1);
    expect(out[0]!.m).toMatchObject({ id: 3, type: 'result' });
    expect((out[0]!.m as { result: unknown[] }).result).toHaveLength(3);
  });

  it('計算中の例外は ID 付きの error（日本語のメッセージはそのまま）', () => {
    const { out, post } = collect();
    handleRequest({ id: 5, type: 'build', model: SEED_MODEL, projects: [], opts: { runs: 10, seed: 1 } }, post);
    expect(out.at(-1)!.m).toEqual({ id: 5, type: 'error', message: 'α の推定には 2 件以上の実績が必要です' });
  });

  it('壊れた入力（model が無い）でも error を返し、例外を外に出さない', () => {
    const { out, post } = collect();
    expect(() => handleRequest({ id: 6, type: 'simulate', model: undefined, input, opts: { runs: 10, seed: 1 } } as unknown as WorkerRequest, post)).not.toThrow();
    expect(out.at(-1)!.m).toMatchObject({ id: 6, type: 'error' });
  });

  it('不明な種類は error', () => {
    const { out, post } = collect();
    handleRequest({ id: 8, type: 'nope' } as unknown as WorkerRequest, post);
    expect(out).toEqual([{ m: { id: 8, type: 'error', message: '不明な計算の種類です（nope）。' }, transfer: undefined }]);
  });

  it('ID の無い依頼は fatal（主スレッドが全件を失敗にする）', () => {
    const { out, post } = collect();
    handleRequest(null as unknown as WorkerRequest, post);
    handleRequest({ type: 'simulate' } as unknown as WorkerRequest, post);
    expect(out.map((x) => x.m.type)).toEqual(['fatal', 'fatal']);
    expect(out[0]!.m.id).toBeNull();
  });

  it('結果の送信（複製）に失敗したら error を送り直す', () => {
    const sent: WorkerResponse[] = [];
    const post = (m: WorkerResponse) => {
      if (m.type === 'result') throw new DOMException('could not be cloned', 'DataCloneError');
      sent.push(m);
    };
    handleRequest({ id: 9, type: 'levers', model: SEED_MODEL, input, opts: { runs: 100, seed: 1 } }, post);
    expect(sent.at(-1)).toEqual({ id: 9, type: 'error', message: 'could not be cloned' });
  });

  it('error の送信も失敗したら fatal', () => {
    const sent: WorkerResponse[] = [];
    const post = (m: WorkerResponse) => {
      if (m.type !== 'fatal') throw new Error('closed');
      sent.push(m);
    };
    handleRequest({ id: 10, type: 'levers', model: SEED_MODEL, input, opts: { runs: 100, seed: 1 } }, post);
    expect(sent).toEqual([{ id: null, type: 'fatal', message: 'closed' }]);
  });
});
