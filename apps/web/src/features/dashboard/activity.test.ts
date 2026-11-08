import { describe, expect, it } from 'vitest';
import { describeAudit, describeFeed, type FeedCtx } from './activity';
import type { AuditEntry } from './useAudit';
import type { GenView } from './useDashboard';

const g3: GenView = {
  id: 'gen-3', label: 'G3', name: '案B (外部連携あり)', sizeFP: 1200, levels: {}, runs: 10000, seed: 1, alpha: 0.021, sigma: 0.1,
  expertMode: { kind: 'average' }, createdAt: null, stored: null,
};
const ctx: FeedCtx = {
  gens: [g3],
  sco: () => 0.68,
  versions: [{ id: 'v3', version: 3, mmre: 0.128 }],
  factors: [{ id: 'F03', no: 3, name: '開発者のスキル・経験' }],
};
const e = (action: string, detail: unknown = {}, actor = '蔡'): AuditEntry => ({ id: 1, at: '2026-11-06T06:20:00Z', actor, action, detail });
const d = (action: string, detail?: unknown) => describeAudit(e(action, detail), ctx, false);

// worker の audit(c, '…') / auditLog insert で使われている action の全種類
const ALL_ACTIONS = [
  'estimate.run', 'estimate.create', 'model.build', 'model.activate', 'factor.create', 'factor.update', 'factor.delete',
  'project.create', 'project.update', 'project.delete', 'transfer.import', 'transfer.export', 'transfer.submit', 'transfer.review',
  'user.add', 'user.update', 'user.remove', 'auth.login',
];

describe('describeAudit', () => {
  it('すべての action を日本語にし、英語の内部 key を出さない', () => {
    for (const a of ALL_ACTIONS) {
      const it = d(a, {});
      expect(it.title, a).not.toMatch(/[a-z]+\.[a-z]+/);
      expect(it.title, a).not.toBe('その他の操作');
      expect(it.sub, a).not.toContain(a);
      expect(it.actor).toBe('蔡');
    }
  });

  it('世代の実行は世代名・規模・ΣCO', () => {
    const it = describeAudit(e('estimate.run', { generation: 'gen-3' }), ctx, true);
    expect(it.title).toBe('G3 を実行');
    expect(it.sub).toBe('案B (外部連携あり)、規模 1,200 FP、ΣCO +68%');
    expect(it.tone).toBe('accent');
    expect(d('estimate.run', { generation: 'gone' }).title).toBe('見積りを実行');
  });

  it('モデル構築・採用', () => {
    expect(d('model.build', { version: 3, alpha: 0.02098 })).toMatchObject({ title: 'モデル v3 を構築', sub: 'α 0.0210、MMRE 12.8%' });
    expect(d('model.build', {}).title).toBe('モデルを構築');
    expect(d('model.activate', { id: 'v3' }).title).toBe('見積りに使うモデルを v3 に切替');
    expect(d('model.activate', { id: 'x' }).title).toBe('見積りに使うモデルを切替');
    expect(d('transfer.review', { status: 'approved', note: 'OK' }).title).toBe('アップロードを承認');
    expect(d('transfer.review', { status: 'rejected' }).title).toBe('アップロードを却下');
    expect(d('transfer.review', null).title).toBe('アップロードを確認');
  });

  it('要因・実績', () => {
    expect(d('factor.create', { name: '新要因' }).title).toBe('要因「新要因」を追加');
    expect(d('factor.update', { id: 'F03' })).toMatchObject({ title: '要因 03 を更新', sub: '開発者のスキル・経験' });
    expect(d('factor.delete', { id: 'F99', name: '消えた要因' })).toMatchObject({ title: '要因 を削除', sub: '消えた要因', tone: 'coral' });
    expect(d('project.create', { id: 'PJ-013' }).title).toBe('実績 PJ-013 を登録');
    expect(d('project.delete', {}).title).toBe('実績を削除');
  });

  it('利用者の追加・変更・削除', () => {
    expect(d('user.add', { name: '山田', role: 'estimator' })).toMatchObject({ title: '利用者「山田」を追加', sub: '見積り担当' });
    expect(d('user.update', { target: 'yamada', role: 'pmo' })).toMatchObject({ title: '利用者「yamada」を更新', sub: '権限をPMOに変更' });
    expect(d('user.update', { target: 'yamada', name: '山田 太郎' }).title).toBe('利用者「山田 太郎」を更新');
    expect(d('user.remove', { target: 'yamada' })).toMatchObject({ title: '利用者「yamada」を削除', tone: 'coral' });
    expect(d('user.add', { role: 'root' }).sub).toBe('');
  });

  it('取り込みは件数を添える', () => {
    expect(d('transfer.import', { factorsAdded: 2, projectsAdded: 3, factorsUpdated: 0 }).sub).toBe('要因 2 件追加、実績 3 件追加');
    expect(d('transfer.export').title).toBe('モデルパラメータを書き出し');
  });

  it('知らない action・壊れた detail でも安全に表示する', () => {
    expect(d('something.new', { x: 1 })).toMatchObject({ title: 'その他の操作', sub: '' });
    expect(d('', null).title).toBe('その他の操作');
    for (const bad of [null, undefined, 'str', 42, [1, 2]]) {
      for (const a of ALL_ACTIONS) expect(() => d(a, bad)).not.toThrow();
    }
    expect(describeAudit(e('user.add', {}, ''), ctx, false).actor).toBe('不明な利用者');
  });
});

describe('describeFeed', () => {
  it('ログインを除き、件数を絞り、最初の実行だけ強調する', () => {
    const entries: AuditEntry[] = [
      { ...e('auth.login'), id: 9 },
      { ...e('estimate.run', { generation: 'gen-3' }), id: 8 },
      { ...e('estimate.run', { generation: 'gen-3' }), id: 7 },
      { ...e('user.add', { name: 'A' }), id: 6 },
    ];
    const feed = describeFeed(entries, ctx, 2);
    expect(feed.map((x) => x.id)).toEqual([8, 7]);
    expect(feed[0]!.tone).toBe('accent');
    expect(feed[1]!.tone).toBe('info');
    expect(describeFeed([], ctx)).toEqual([]);
  });
});
