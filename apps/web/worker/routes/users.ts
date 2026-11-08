// 利用者管理（モデル管理者だけ）。本番は users 表にあるメールアドレスだけが GitHub でログインできる。
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { guardChange, userCreateSchema, userUpdateSchema } from '../../shared/user-rules';
import { audit } from '../audit';
import { requireRole } from '../auth';
import { users } from '../db/schema';
import type { AppEnv } from '../env';

// 入力検証と締め出し防止の規則は画面と共通（shared/user-rules.ts）。Zod の検証エラーは index.ts の onError が 400 + issues で返す。
export { guardChange };

export const usersRoute = new Hono<AppEnv>()
  .use('*', requireRole('admin'))
  .get('/', async (c) => c.json(await c.var.db.select().from(users).orderBy(users.name)))
  .post('/', async (c) => {
    const body = userCreateSchema.parse(await c.req.json());
    const db = c.var.db;
    if (await db.select().from(users).where(eq(users.email, body.email)).get()) return c.json({ error: 'このメールアドレスは登録済みです' }, 409);
    await db.insert(users).values(body);
    await audit(c, 'user.add', { name: body.name, role: body.role });
    return c.json(body, 201);
  })
  .put('/:email', async (c) => {
    const target = c.req.param('email').toLowerCase();
    const body = userUpdateSchema.parse(await c.req.json());
    const db = c.var.db;
    const all = await db.select().from(users);
    if (!all.some((u) => u.email === target)) return c.json({ error: 'この利用者は登録されていません' }, 404);
    if (body.role) {
      const err = guardChange(all, c.var.user!.email, target, body.role);
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
