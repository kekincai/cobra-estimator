import { eq } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';
import { users } from './db/schema';
import type { AppEnv, Role } from './env';

/**
 * 認証。
 * - AUTH_MODE=dev（ローカル）: DEV_USER_EMAIL を admin として扱う
 * - 本番: Cloudflare Access の JWT を検証して email を得る（TODO: auth タスクで実装）。
 *   未実装・未設定のあいだは user=null となり、書き込み API は 401。
 */
export const authenticate = createMiddleware<AppEnv>(async (c, next) => {
  if (c.env.AUTH_MODE === 'dev') {
    const email = c.env.DEV_USER_EMAIL ?? 'dev@example.com';
    c.set('user', { email, name: 'K. Cai', role: 'admin' });
    return next();
  }
  // TODO(auth): Cf-Access-Jwt-Assertion を ACCESS_TEAM_DOMAIN の JWKS で検証し、aud = ACCESS_AUD を確認
  const email: string | null = null;
  if (!email) {
    c.set('user', null);
    return next();
  }
  const row = await c.var.db.select().from(users).where(eq(users.email, email)).get();
  c.set('user', row ?? { email, name: email, role: 'estimator' });
  return next();
});

/** 書き込みには認証が必要。roles を指定すればロールも確認する。 */
export const requireRole = (...roles: Role[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const u = c.var.user;
    if (!u) return c.json({ error: '読み取り専用モードです（ログインが必要）' }, 401);
    if (roles.length && !roles.includes(u.role) && u.role !== 'admin') return c.json({ error: '権限がありません' }, 403);
    return next();
  });
