// 主スレッド側: Web Worker に出した依頼の待ち合わせ（純粋なロジック。Worker 本体は cobra-client.ts）。
// - result / error を依頼 ID で振り分ける
// - Worker が落ちた・応答を受け取れないときは、待っている依頼をすべて日本語のエラーで reject する
import type { BuildStage } from 'cobra-core';
import type { WorkerResponse } from './cobra-protocol';

export type Progress = (stage: BuildStage, done: number, total: number) => void;

interface Entry {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  onProgress?: Progress;
}

/** 画面に出す日本語のエラー文言 */
export const CALC_ERROR = {
  /** Worker 内で日本語でない例外が出たとき（詳細は cause） */
  failed: '計算中にエラーが発生しました。入力内容を確認して、もう一度実行してください。',
  /** Worker が起動できない・停止した（onerror） */
  crashed: '計算処理が停止しました。ページを再読み込みしてから、もう一度実行してください。',
  /** Worker からの応答を復元できない（onmessageerror） */
  unreadable: '計算結果を受け取れませんでした。もう一度実行してください。',
  /** 依頼を Worker に送れない（postMessage の複製失敗など） */
  unsendable: '計算の依頼を送れませんでした。入力内容を確認して、もう一度実行してください。',
} as const;

const JA = /[぀-ヿ㐀-鿿＀-￯]/;

/**
 * 例外・メッセージを画面に出せる Error にする。日本語のメッセージ（cobra-core の検証エラーなど）はそのまま、
 * それ以外（英語の内部エラー、空）は fallback の日本語にして、元の内容は cause に残す。
 */
export function toCalcError(err: unknown, fallback: string = CALC_ERROR.failed): Error {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : err == null ? '' : String(err);
  const e = new Error(raw && JA.test(raw) ? raw : fallback, { cause: err });
  e.name = 'CalcError';
  return e;
}

export class PendingCalls {
  private readonly map = new Map<number, Entry>();

  get size(): number {
    return this.map.size;
  }

  has(id: number): boolean {
    return this.map.has(id);
  }

  add(id: number, entry: Entry): void {
    this.map.set(id, entry);
  }

  /** Worker からのメッセージを振り分ける。知らない ID・壊れたメッセージは無視する（fatal は全件失敗） */
  handle(m: WorkerResponse | null | undefined): void {
    if (!m || typeof m !== 'object') return;
    if (m.type === 'fatal') {
      this.failAll(toCalcError(m.message));
      return;
    }
    const p = this.map.get(m.id);
    if (!p) return;
    if (m.type === 'progress') {
      try {
        p.onProgress?.(m.stage, m.done, m.total);
      } catch {
        // 進捗表示の失敗で計算結果を失わない
      }
    } else if (m.type === 'result') {
      this.map.delete(m.id);
      p.resolve(m.result);
    } else if (m.type === 'error') {
      this.map.delete(m.id);
      p.reject(toCalcError(m.message));
    }
  }

  /** 1 件だけ失敗にする（送信失敗など） */
  reject(id: number, err: Error): void {
    const p = this.map.get(id);
    if (!p) return;
    this.map.delete(id);
    p.reject(err);
  }

  /** 待っている依頼をすべて失敗にする（Worker の停止・応答の破損） */
  failAll(err: Error): void {
    const all = [...this.map.values()];
    this.map.clear();
    for (const p of all) p.reject(err);
  }
}
