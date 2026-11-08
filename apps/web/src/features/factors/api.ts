// 要因 API の送信。400 の本文にある issues（欄ごとのエラー）を残したまま投げる。
import { ApiError } from '../../data/api';

export interface FieldIssue {
  /** name、levels.2、triangles.0.best など */
  path: string;
  message: string;
}

export class FactorApiError extends ApiError {
  constructor(status: number, message: string, public issues: FieldIssue[] = []) {
    super(status, message);
  }
}

export async function sendFactor<T = unknown>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: string; issues?: FieldIssue[] };
    throw new FactorApiError(res.status, b.error ?? res.statusText, Array.isArray(b.issues) ? b.issues : []);
  }
  return res.json() as Promise<T>;
}

export const issuesOf = (e: unknown): FieldIssue[] => (e instanceof FactorApiError ? e.issues : []);
