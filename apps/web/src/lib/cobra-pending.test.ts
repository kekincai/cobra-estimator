import { describe, expect, it, vi } from 'vitest';
import { CALC_ERROR, PendingCalls, abortError, isAbortError, toCalcError } from './cobra-pending';

const deferred = () => {
  const resolve = vi.fn();
  const reject = vi.fn();
  const onProgress = vi.fn();
  return { resolve, reject, onProgress };
};

describe('toCalcError', () => {
  it('日本語のメッセージはそのまま', () => {
    const e = toCalcError(new Error('α の推定には 2 件以上の実績が必要です'));
    expect(e.message).toBe('α の推定には 2 件以上の実績が必要です');
    expect(e.name).toBe('CalcError');
  });
  it('英語・空・非 Error は日本語の既定文言にし、元は cause に残す', () => {
    const orig = new TypeError("Cannot read properties of undefined (reading 'x')");
    const e = toCalcError(orig);
    expect(e.message).toBe(CALC_ERROR.failed);
    expect(e.cause).toBe(orig);
    expect(toCalcError('').message).toBe(CALC_ERROR.failed);
    expect(toCalcError(null, CALC_ERROR.unreadable).message).toBe(CALC_ERROR.unreadable);
    expect(toCalcError(42).message).toBe(CALC_ERROR.failed);
    expect(toCalcError('Script error.', CALC_ERROR.crashed).message).toBe(CALC_ERROR.crashed);
  });
  it('文言はすべて日本語', () => {
    for (const m of Object.values(CALC_ERROR)) expect(m).toMatch(/[ぁ-んァ-ン一-龯]/);
  });
});

describe('PendingCalls', () => {
  it('result は ID の依頼だけを resolve して取り除く', () => {
    const p = new PendingCalls();
    const a = deferred();
    const b = deferred();
    p.add(1, a);
    p.add(2, b);
    p.handle({ id: 2, type: 'result', result: { p50: 43.9 } });
    expect(b.resolve).toHaveBeenCalledWith({ p50: 43.9 });
    expect(a.resolve).not.toHaveBeenCalled();
    expect(p.has(2)).toBe(false);
    expect(p.size).toBe(1);
  });

  it('progress は onProgress に渡し、依頼は残す', () => {
    const p = new PendingCalls();
    const a = deferred();
    p.add(1, a);
    p.handle({ id: 1, type: 'progress', stage: 'montecarlo', done: 0.5, total: 1 });
    expect(a.onProgress).toHaveBeenCalledWith('montecarlo', 0.5, 1);
    expect(p.has(1)).toBe(true);
  });

  it('onProgress が投げても結果は失わない', () => {
    const p = new PendingCalls();
    const a = deferred();
    a.onProgress.mockImplementation(() => {
      throw new Error('boom');
    });
    p.add(1, a);
    expect(() => p.handle({ id: 1, type: 'progress', stage: 'loo', done: 1, total: 2 })).not.toThrow();
    p.handle({ id: 1, type: 'result', result: 1 });
    expect(a.resolve).toHaveBeenCalledWith(1);
  });

  it('error は日本語の Error で reject（英語は既定文言に）', () => {
    const p = new PendingCalls();
    const a = deferred();
    const b = deferred();
    p.add(1, a);
    p.add(2, b);
    p.handle({ id: 1, type: 'error', message: 'α の推定には 2 件以上の実績が必要です' });
    p.handle({ id: 2, type: 'error', message: 'RangeError: Invalid typed array length' });
    expect(a.reject.mock.calls[0]![0]).toBeInstanceOf(Error);
    expect(a.reject.mock.calls[0]![0].message).toBe('α の推定には 2 件以上の実績が必要です');
    expect(b.reject.mock.calls[0]![0].message).toBe(CALC_ERROR.failed);
    expect(p.size).toBe(0);
  });

  it('fatal（どの依頼か分からない失敗）は全件 reject', () => {
    const p = new PendingCalls();
    const a = deferred();
    const b = deferred();
    p.add(1, a);
    p.add(2, b);
    p.handle({ id: null, type: 'fatal', message: '計算の依頼を読み取れませんでした。' });
    expect(a.reject).toHaveBeenCalledOnce();
    expect(b.reject).toHaveBeenCalledOnce();
    expect(a.reject.mock.calls[0]![0].message).toBe('計算の依頼を読み取れませんでした。');
    expect(p.size).toBe(0);
  });

  it('知らない ID・重複した応答・壊れたメッセージは無視', () => {
    const p = new PendingCalls();
    const a = deferred();
    p.add(1, a);
    p.handle({ id: 99, type: 'result', result: 1 });
    p.handle(null);
    p.handle(undefined);
    p.handle('x' as never);
    p.handle({ id: 1, type: 'unknown' } as never);
    expect(a.resolve).not.toHaveBeenCalled();
    expect(a.reject).not.toHaveBeenCalled();
    p.handle({ id: 1, type: 'result', result: 2 });
    p.handle({ id: 1, type: 'result', result: 3 });
    p.handle({ id: 1, type: 'error', message: 'x' });
    expect(a.resolve).toHaveBeenCalledOnce();
    expect(a.reject).not.toHaveBeenCalled();
  });

  it('reject(id) は 1 件だけ、failAll は全件（その後に来た応答は無視）', () => {
    const p = new PendingCalls();
    const a = deferred();
    const b = deferred();
    const c = deferred();
    p.add(1, a);
    p.add(2, b);
    p.add(3, c);
    p.reject(1, new Error('送れません'));
    expect(a.reject).toHaveBeenCalledOnce();
    expect(p.size).toBe(2);
    p.failAll(new Error('停止'));
    expect(b.reject).toHaveBeenCalledOnce();
    expect(c.reject).toHaveBeenCalledOnce();
    p.handle({ id: 2, type: 'result', result: 1 });
    expect(b.resolve).not.toHaveBeenCalled();
    p.reject(2, new Error('again'));
    expect(b.reject).toHaveBeenCalledOnce();
  });

  it('resendable は req を持つ依頼だけを ID 順に返し、依頼は残す', () => {
    const p = new PendingCalls();
    p.add(3, { ...deferred(), req: { id: 3, type: 'levers' } });
    p.add(1, { ...deferred(), req: { id: 1, type: 'simulate' } });
    p.add(2, deferred());
    expect(p.resendable()).toEqual([
      { id: 1, req: { id: 1, type: 'simulate' } },
      { id: 3, req: { id: 3, type: 'levers' } },
    ]);
    expect(p.size).toBe(3);
    p.reject(1, abortError());
    expect(p.resendable().map((x) => x.id)).toEqual([3]);
    expect(new PendingCalls().resendable()).toEqual([]);
  });
});

describe('abortError / isAbortError', () => {
  it('AbortError は日本語の文言で、name で判定できる。理由は cause に残す', () => {
    const e = abortError('user');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('AbortError');
    expect(e.message).toBe(CALC_ERROR.aborted);
    expect(e.cause).toBe('user');
    expect(abortError().cause).toBeUndefined();
    expect(isAbortError(e)).toBe(true);
  });
  it('DOMException の AbortError も取りやめ扱い。それ以外の失敗は違う', () => {
    expect(isAbortError(new DOMException('aborted', 'AbortError'))).toBe(true);
    expect(isAbortError(toCalcError('x'))).toBe(false);
    expect(isAbortError(new Error(CALC_ERROR.aborted))).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
    expect(isAbortError('AbortError')).toBe(false);
  });
});
