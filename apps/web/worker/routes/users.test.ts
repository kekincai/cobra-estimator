import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { users } from '../db/schema';
import type { AppEnv, User } from '../env';
import { guardChange, usersRoute } from './users';

const all = [
  { email: 'a@example.com', role: 'admin' as const },
  { email: 'b@example.com', role: 'estimator' as const },
];

describe('guardChange', () => {
  it('他の利用者の権限変更・削除はできる', () => {
    expect(guardChange(all, 'a@example.com', 'b@example.com', 'pmo')).toBeNull();
    expect(guardChange(all, 'a@example.com', 'b@example.com', 'deleted')).toBeNull();
  });
  it('自分自身は削除・権限変更できない', () => {
    expect(guardChange(all, 'a@example.com', 'a@example.com', 'deleted')).toMatch('自分自身');
    expect(guardChange(all, 'a@example.com', 'a@example.com', 'estimator')).toMatch('自分自身');
    expect(guardChange(all, 'a@example.com', 'a@example.com', 'admin')).toBeNull();
  });
  it('最後のモデル管理者は外せない', () => {
    expect(guardChange(all, 'x@example.com', 'a@example.com', 'pmo')).toMatch('1 人もいなくなる');
    expect(guardChange(all, 'x@example.com', 'a@example.com', 'deleted')).toMatch('1 人もいなくなる');
    const two = [...all, { email: 'c@example.com', role: 'admin' as const }];
    expect(guardChange(two, 'c@example.com', 'a@example.com', 'deleted')).toBeNull();
    expect(guardChange(two, 'c@example.com', 'a@example.com', 'estimator')).toBeNull();
  });
  it('管理者を管理者のままにする（変更なし）は許す', () => {
    expect(guardChange(all, 'x@example.com', 'a@example.com', 'admin')).toBeNull();
  });
  it('未登録は対象外', () => {
    expect(guardChange(all, 'a@example.com', 'z@example.com', 'deleted')).toMatch('登録されていません');
  });
});

// ---- ルート単位: D1 の代わりに users 表だけを持つ簡易 DB で API の応答を確かめる ----

type Row = User;
/** drizzle の eq(users.email, v) から v を取り出す（Param チャンクの value） */
const eqValue = (cond: unknown): string | undefined =>
  (cond as { queryChunks?: unknown[] }).queryChunks?.map((q) => (q as { value?: unknown })?.value).find((v): v is string => typeof v === 'string');

function fakeDb(rows: Row[]) {
  const done = <T>(v: T) => Promise.resolve(v);
  return {
    rows,
    select: () => ({
      from: () => {
        const p = done([...rows]) as Promise<Row[]> & Record<string, unknown>;
        p.orderBy = () => done([...rows].sort((x, y) => x.name.localeCompare(y.name)));
        p.where = (cond: unknown) => ({ get: () => done(rows.find((r) => r.email === eqValue(cond))) });
        return p;
      },
    }),
    insert: (t: unknown) => ({
      values: (v: Row) => {
        if (t === users) rows.push(v);
        return done(undefined);
      },
    }),
    update: () => ({
      set: (v: Partial<Row>) => ({
        where: (cond: unknown) => {
          const r = rows.find((x) => x.email === eqValue(cond));
          if (r) Object.assign(r, v);
          return done(undefined);
        },
      }),
    }),
    delete: () => ({
      where: (cond: unknown) => {
        const i = rows.findIndex((x) => x.email === eqValue(cond));
        if (i >= 0) rows.splice(i, 1);
        return done(undefined);
      },
    }),
  };
}

function setup(actor: User, rows: Row[]) {
  const db = fakeDb(rows.map((r) => ({ ...r })));
  const app = new Hono<AppEnv>()
    .use('*', async (c, next) => {
      c.set('db', db as never);
      c.set('user', actor);
      await next();
    })
    .route('/users', usersRoute);
  // worker/index.ts の onError と同じ扱い（Zod の検証エラーは 400 + issues）
  app.onError((err, c) => {
    if (err instanceof ZodError) return c.json({ error: '入力内容に誤りがあります', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, 400);
    return c.json({ error: 'サーバーでエラーが発生しました' }, 500);
  });
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(path, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: (await res.json()) as { error?: string; issues?: { path: string; message: string }[] } };
  };
  return { db, call };
}

const admin: User = { email: 'admin@example.com', name: 'K. Cai', role: 'admin' };
const seed: Row[] = [admin, { email: 'tanaka@example.com', name: 'S. Tanaka', role: 'estimator' }];

describe('usersRoute', () => {
  it('a@b は 400・項目 email の日本語メッセージ（生の Zod JSON を返さない）', async () => {
    const { call, db } = setup(admin, seed);
    const r = await call('POST', '/users', { email: 'a@b', name: 'A', role: 'pmo' });
    expect(r.status).toBe(400);
    expect(r.body.issues).toEqual([{ path: 'email', message: expect.stringMatching(/^メールアドレスの形式が正しくありません/) }]);
    expect(db.rows).toHaveLength(2);
  });

  it('正しい追加は 201・メールは小文字に正規化、同じアドレスは 409', async () => {
    const { call, db } = setup(admin, seed);
    expect((await call('POST', '/users', { email: ' Sato@Example.COM ', name: ' 佐藤 ', role: 'pmo' })).status).toBe(201);
    expect(db.rows.at(-1)).toEqual({ email: 'sato@example.com', name: '佐藤', role: 'pmo' });
    const dup = await call('POST', '/users', { email: 'sato@example.com', name: '佐藤', role: 'pmo' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('このメールアドレスは登録済みです');
  });

  it('自分自身の削除・降格は 409', async () => {
    const { call, db } = setup(admin, [...seed, { email: 'b2@example.com', name: 'B', role: 'admin' }]);
    expect((await call('DELETE', '/users/admin%40example.com')).status).toBe(409);
    const r = await call('PUT', '/users/admin%40example.com', { role: 'estimator' });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch('自分自身');
    expect(db.rows.find((u) => u.email === admin.email)?.role).toBe('admin');
  });

  it('最後のモデル管理者の削除・降格は 409（操作者が表にいない場合も）', async () => {
    const dev: User = { email: 'dev@example.com', name: 'dev', role: 'admin' };
    const { call, db } = setup(dev, seed);
    expect((await call('PUT', '/users/admin%40example.com', { role: 'pmo' })).body.error).toMatch('1 人もいなくなる');
    expect((await call('DELETE', '/users/admin%40example.com')).status).toBe(409);
    expect(db.rows).toHaveLength(2);
  });

  it('管理者が 2 人なら他方の降格・削除はできる', async () => {
    const { call, db } = setup(admin, [...seed, { email: 'b2@example.com', name: 'B', role: 'admin' }]);
    expect((await call('PUT', '/users/b2%40example.com', { role: 'estimator' })).status).toBe(200);
    expect(db.rows.find((u) => u.email === 'b2@example.com')?.role).toBe('estimator');
    expect((await call('DELETE', '/users/b2%40example.com')).status).toBe(200);
    expect(db.rows.some((u) => u.email === 'b2@example.com')).toBe(false);
  });

  it('未登録の利用者の更新は 404、不正な権限は 400', async () => {
    const { call } = setup(admin, seed);
    expect((await call('PUT', '/users/nobody%40example.com', { name: 'X' })).status).toBe(404);
    expect((await call('PUT', '/users/tanaka%40example.com', { role: 'owner' })).status).toBe(400);
  });

  it('モデル管理者以外は 403', async () => {
    const { call } = setup({ email: 'tanaka@example.com', name: 'S. Tanaka', role: 'estimator' }, seed);
    expect((await call('GET', '/users')).status).toBe(403);
  });
});
