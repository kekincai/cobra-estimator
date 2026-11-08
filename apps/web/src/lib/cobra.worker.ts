/// <reference lib="webworker" />
// モンテカルロ・モデル構築を UI スレッド外で実行する。処理本体は cobra-handler.ts（テストあり）。
import { handleRequest, type Post } from './cobra-handler';
import type { WorkerRequest } from './cobra-protocol';

const scope = self as DedicatedWorkerGlobalScope;
const post: Post = (m, transfer = []) => scope.postMessage(m, transfer);

scope.onmessage = (e: MessageEvent<WorkerRequest>) => handleRequest(e.data, post);

// 依頼を復元できない（どの依頼か分からない）→ 主スレッドで待っている依頼をすべて失敗にしてもらう
scope.onmessageerror = () => post({ id: null, type: 'fatal', message: '計算の依頼を読み取れませんでした。' });
