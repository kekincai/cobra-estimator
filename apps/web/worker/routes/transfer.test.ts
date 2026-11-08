import { describe, expect, it } from 'vitest';
import { attachReviews, importIssueMessage, importRequest, PROJECT_NAME_MAX, reviewBody, reviewGuard, triangle, visibleSubmissions } from './transfer';

describe('reviewGuard（申請のレビュー）', () => {
  it('レビュー待ちの申請は承認・却下できる', () => {
    expect(reviewGuard('pending', 'approved')).toBeNull();
    expect(reviewGuard('pending', 'rejected')).toBeNull();
  });
  it('存在しない申請は対象外', () => {
    expect(reviewGuard(undefined, 'approved')).toMatch('見つかりません');
  });
  it('同じ結果の二重レビューはできない', () => {
    expect(reviewGuard('approved', 'approved')).toMatch('すでに承認済み');
    expect(reviewGuard('rejected', 'rejected')).toMatch('すでに却下済み');
  });
  it('結果が出た申請は覆せない', () => {
    expect(reviewGuard('approved', 'rejected')).toMatch('すでに承認されています');
    expect(reviewGuard('rejected', 'approved')).toMatch('すでに却下されています');
  });
});

describe('reviewBody', () => {
  it('approved / rejected とコメントを受け付ける', () => {
    expect(reviewBody.parse({ status: 'approved' })).toEqual({ status: 'approved' });
    expect(reviewBody.parse({ status: 'rejected', note: '  要因 05 の定義を戻してください ' })).toEqual({ status: 'rejected', note: '要因 05 の定義を戻してください' });
  });
  it('pending や不明な値、長すぎるコメントは日本語のエラー', () => {
    const r = reviewBody.safeParse({ status: 'pending' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]!.message).toMatch('承認');
    const long = reviewBody.safeParse({ status: 'approved', note: 'あ'.repeat(2001) });
    expect(long.success).toBe(false);
    if (!long.success) expect(long.error.issues[0]!.message).toMatch('2,000 文字');
  });
});

describe('visibleSubmissions', () => {
  const rows = [
    { id: '1', submittedBy: 'a@example.com' },
    { id: '2', submittedBy: 'B@example.com' },
    { id: '3', submittedBy: 'c@example.com' },
  ];
  it('モデル管理者はすべて見える', () => {
    expect(visibleSubmissions(rows, { email: 'x@example.com', role: 'admin' })).toHaveLength(3);
  });
  it('それ以外は自分の申請だけ（大文字小文字は区別しない）', () => {
    expect(visibleSubmissions(rows, { email: 'b@example.com', role: 'pmo' }).map((r) => r.id)).toEqual(['2']);
    expect(visibleSubmissions(rows, { email: 'z@example.com', role: 'estimator' })).toEqual([]);
  });
});

describe('attachReviews', () => {
  it('監査ログの最新のレビューを付け、メールアドレスは出さない', () => {
    const logs = [
      { action: 'transfer.review', detail: { id: '1', status: 'rejected', note: '新しい' }, at: '2026-11-08T02:00:00Z', actor: 'admin@example.com' },
      { action: 'transfer.review', detail: { id: '1', status: 'approved', note: '古い' }, at: '2026-11-07T02:00:00Z', actor: 'admin@example.com' },
      { action: 'transfer.submit', detail: { id: '2' }, at: '2026-11-07T01:00:00Z', actor: 'b@example.com' },
      { action: 'transfer.review', detail: null, at: '2026-11-07T01:00:00Z', actor: 'admin@example.com' },
      { action: 'transfer.review', detail: { id: '3', status: 'pending' }, at: '2026-11-07T01:00:00Z', actor: 'admin@example.com' },
    ];
    const out = attachReviews([{ id: '1' }, { id: '2' }, { id: '3' }], logs);
    expect(out[0]!.review).toEqual({ status: 'rejected', note: '新しい', at: '2026-11-08T02:00:00Z', by: 'admin' });
    expect(out[1]!.review).toBeNull();
    expect(out[2]!.review).toBeNull();
  });
});

describe('importRequest（実績の更新）', () => {
  const base = { source: { kind: 'json', fileName: 'a.json' }, groups: [], factorsInsert: [], factorsUpdate: [], projects: [] };
  it('projectsUpdate は省略できる（従来の CSV / JSON 取り込みと互換）', () => {
    expect(importRequest.parse(base).projectsUpdate).toEqual([]);
  });
  it('更新する実績の値を検証する', () => {
    const ok = importRequest.safeParse({ ...base, projectsUpdate: [{ id: 'PJ-001', name: 'A', sizeFP: 900, effortMM: 20, levels: { F01: 2 }, note: '' }] });
    expect(ok.success).toBe(true);
    const bad = importRequest.safeParse({ ...base, projectsUpdate: [{ id: 'PJ-001', name: 'A', sizeFP: -1, effortMM: 20, levels: { F01: 4 }, note: '' }] });
    expect(bad.success).toBe(false);
  });
});

describe('三角分布の順序（サーバー側の検証）', () => {
  const tri = (best: number, likely: number, worst: number) => ({ expert: 'S.T.', best, likely, worst });
  const factor = (triangles: unknown[]) => ({
    id: 'N1', no: 9, name: '帳票の数', category: '', kind: 'direct', targetFactorId: null, definition: '', levels: ['a', 'b', 'c', 'd'], origin: 'custom', triangles,
  });
  const body = (triangles: unknown[], key: 'factorsInsert' | 'factorsUpdate' = 'factorsInsert') => ({
    source: { kind: 'json', fileName: 'a.json' }, groups: [], factorsInsert: [], factorsUpdate: [], projects: [], [key]: [factor(triangles)],
  });

  it('最良 ≤ 最頻 ≤ 最悪 なら通す（等しい値・負の値・0 も可）', () => {
    expect(triangle.safeParse(tri(0.1, 0.2, 0.3)).success).toBe(true);
    expect(triangle.safeParse(tri(0, 0, 0)).success).toBe(true);
    expect(triangle.safeParse(tri(-0.1, 0.2, 0.2)).success).toBe(true);
    expect(importRequest.safeParse(body([tri(0.05, 0.1, 0.2)])).success).toBe(true);
  });
  it('順序が逆なら日本語で拒否する（追加・上書きの両方）', () => {
    for (const t of [tri(0.3, 0.2, 0.4), tri(0.1, 0.5, 0.4), tri(0.4, 0.2, 0.1)]) {
      const r = triangle.safeParse(t);
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0]!.message).toBe('三角分布は 最良 ≤ 最頻 ≤ 最悪 の順にしてください');
    }
    expect(importRequest.safeParse(body([tri(0.4, 0.2, 0.1)], 'factorsUpdate')).success).toBe(false);
  });
  it('エラー文に要因名と専門家を入れる', () => {
    const raw = body([tri(0.1, 0.2, 0.3), tri(0.4, 0.2, 0.1)]);
    const r = importRequest.safeParse(raw);
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(importIssueMessage(r.error.issues[0], raw)).toBe('取り込み内容が不正です（要因「帳票の数」の三角分布（S.T.））: 三角分布は 最良 ≤ 最頻 ≤ 最悪 の順にしてください');
  });
  it('importIssueMessage の境界: 問題なし・英語メッセージ・実績', () => {
    expect(importIssueMessage(undefined, {})).toBe('取り込み内容が不正です');
    const raw = { projects: [{ id: 'PJ-1' }] };
    expect(importIssueMessage({ code: 'custom', path: ['projects', 0, 'sizeFP'], message: 'Too small', input: 0 } as never, raw)).toBe('取り込み内容が不正です（実績 PJ-1）: 値が正しくありません');
  });
});

describe('プロジェクト名の上限（取り込み経路でも 100 文字）', () => {
  const pj = (name: string) => ({ id: 'PJ-9', groupId: 'A', name, sizeFP: 1, effortMM: 1, levels: {}, note: '', adopted: true, excludedReason: null });
  const body = (key: 'projects' | 'projectsUpdate', name: string) => ({
    source: { kind: 'csv', fileName: 'a.csv' }, groups: [], factorsInsert: [], factorsUpdate: [], projects: [],
    [key]: [key === 'projects' ? pj(name) : { id: 'PJ-9', name, sizeFP: 1, effortMM: 1, levels: {}, note: '' }],
  });
  it('追加・更新とも 100 文字は通し、101 文字は日本語で拒否する', () => {
    for (const key of ['projects', 'projectsUpdate'] as const) {
      expect(importRequest.safeParse(body(key, 'あ'.repeat(PROJECT_NAME_MAX))).success).toBe(true);
      const raw = body(key, 'あ'.repeat(PROJECT_NAME_MAX + 1));
      const r = importRequest.safeParse(raw);
      expect(r.success).toBe(false);
      if (!r.success) expect(importIssueMessage(r.error.issues[0], raw)).toBe('取り込み内容が不正です（実績 PJ-9）: プロジェクト名は 100 文字までです');
    }
  });
});
