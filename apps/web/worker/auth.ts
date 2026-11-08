import { eq } from 'drizzle-orm';
import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { users } from './db/schema';
import type { AppEnv, Role } from './env';
import { SESSION_COOKIE, sessionEmail } from './session';

/**
 * 認証。
 * - AUTH_MODE=dev（ローカル）: DEV_USER_EMAIL を admin として扱う
 * - 本番: GitHub でログインしたセッション クッキー（worker/routes/auth.ts が発行）を検証し、
 *   users 表にあるメールアドレスならそのロールで扱う。それ以外は user=null。
 */
export const authenticate = createMiddleware<AppEnv>(async (c, next) => {
  if (c.env.AUTH_MODE === 'dev') {
    const email = c.env.DEV_USER_EMAIL ?? 'dev@example.com';
    c.set('user', { email, name: 'K. Cai', role: 'admin' });
    return next();
  }
  const email = await sessionEmail(getCookie(c, SESSION_COOKIE), c.env.SESSION_SECRET);
  const row = email ? await c.var.db.select().from(users).where(eq(users.email, email)).get() : undefined;
  c.set('user', row ?? null);
  return next();
});

/** 本番では API 全体（読み取りも）にログインが要る。/auth と /health は除く。 */
export const requireLogin = createMiddleware<AppEnv>(async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (c.var.user || path.startsWith('/api/auth/') || path === '/api/health') return next();
  return c.json({ error: 'ログインが必要です' }, 401);
});

/** 書き込みには認証が必要。roles を指定すればロールも確認する。 */
export const requireRole = (...roles: Role[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const u = c.var.user;
    if (!u) return c.json({ error: 'ログインが必要です' }, 401);
    if (roles.length && !roles.includes(u.role) && u.role !== 'admin') return c.json({ error: '権限がありません' }, 403);
    return next();
  });
