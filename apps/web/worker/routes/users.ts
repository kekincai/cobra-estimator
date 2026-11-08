// 利用者管理（モデル管理者だけ）。本番は users 表にあるメールアドレスだけが GitHub でログインできる。
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { audit } from '../audit';
import { requireRole } from '../auth';
import { users } from '../db/schema';
import type { AppEnv, Role, User } from '../env';

const role = z.enum(['admin', 'estimator', 'pmo']);
const email = z.string().trim().toLowerCase().email().max(254);
const name = z.string().trim().min(1).max(60);

/**
 * 変更してよいか。締め出しを防ぐ:
 * - 自分自身は削除・権限変更できない
 * - モデル管理者を 0 人にしない
 * 問題があればエラーメッセージ、なければ null。
 */
export function guardChange(all: Pick<User, 'email' | 'role'>[], actor: string, target: string, next: Role | 'deleted'): string | null {
  const cur = all.find((u) => u.email === target);
  if (!cur) return 'この利用者は登録されていません';
  if (target === actor && next !== cur.role) return next === 'deleted' ? '自分自身は削除できません' : '自分自身の権限は変更できません';
  const admins = all.filter((u) => u.role === 'admin').length;
  if (cur.role === 'admin' && next !== 'admin' && admins <= 1) return 'モデル管理者が 1 人もいなくなるため変更できません';
  return null;
}

export const usersRoute = new Hono<AppEnv>()
  .use('*', requireRole('admin'))
  .get('/', async (c) => c.json(await c.var.db.select().from(users).orderBy(users.name)))
  .post('/', async (c) => {
    const body = z.object({ email, name, role }).parse(await c.req.json());
    const db = c.var.db;
    if (await db.select().from(users).where(eq(users.email, body.email)).get()) return c.json({ error: 'このメールアドレスは登録済みです' }, 409);
    await db.insert(users).values(body);
    await audit(c, 'user.add', { name: body.name, role: body.role });
    return c.json(body, 201);
  })
  .put('/:email', async (c) => {
    const target = c.req.param('email').toLowerCase();
    const body = z.object({ name, role }).partial().parse(await c.req.json());
    const db = c.var.db;
    if (body.role) {
      const err = guardChange(await db.select().from(users), c.var.user!.email, target, body.role);
      if (err) return c.json({ error: err }, 409);
    }
    await db.update(users).set(body).where(eq(users.email, target));
    await audit(c, 'user.update', { target: target.split('@')[0], ...body });
    return c.json({ ok: true });
  })
  .delete('/:email', async (c) => {
    const target = c.req.param('email').toLowerCase();
    const db = c.var.db;
    const err = guardChange(await db.select().from(users), c.var.user!.email, target, 'deleted');
    if (err) return c.json({ error: err }, 409);
    await db.delete(users).where(eq(users.email, target));
    await audit(c, 'user.remove', { target: target.split('@')[0] });
    return c.json({ ok: true });
  });
