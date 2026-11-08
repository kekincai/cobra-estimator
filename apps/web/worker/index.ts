import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { parse } from 'hono/utils/cookie';
import { authenticate, requireLogin } from './auth';
import * as schema from './db/schema';
import type { AppEnv } from './env';
import { SESSION_COOKIE, sessionEmail } from './session';

const getCookie = (header: string | null, name: string) => (header ? parse(header, name)[name] : undefined);
import { auditRoute } from './routes/audit';
import { authRoute } from './routes/auth';
import { estimatesRoute } from './routes/estimates';
import { factorsRoute } from './routes/factors';
import { modelRoute } from './routes/model';
import { projectsRoute } from './routes/projects';
import { transferRoute } from './routes/transfer';

const app = new Hono<AppEnv>().basePath('/api');

app.use('*', async (c, next) => {
  c.set('db', drizzle(c.env.DB, { schema }));
  return next();
});
app.use('*', authenticate);
app.use('*', requireLogin);

app.get('/health', (c) => c.json({ ok: true }));
app.get('/me', (c) => c.json({ user: c.var.user }));

const routes = app
  .route('/auth', authRoute)
  .route('/model', modelRoute)
  .route('/factors', factorsRoute)
  .route('/projects', projectsRoute)
  .route('/estimates', estimatesRoute)
  .route('/transfer', transferRoute)
  .route('/audit', auditRoute);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

export type AppType = typeof routes;

/**
 * 入口。assets.run_worker_first = true なので静的ファイルもここを通る。
 * 本番はセッションが無ければ GitHub ログインへ回す（SPA・JS・CSS もログイン後だけ配る）。
 */
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return app.fetch(req, env, ctx);
    if (env.AUTH_MODE !== 'dev') {
      const token = getCookie(req.headers.get('cookie'), SESSION_COOKIE);
      if (!(await sessionEmail(token, env.SESSION_SECRET))) {
        // ページ遷移だけログインへ回す。favicon などのサブリソースで OAuth の一時クッキーを上書きしない
        if (req.headers.get('sec-fetch-mode') && req.headers.get('sec-fetch-mode') !== 'navigate') return new Response('Unauthorized', { status: 401 });
        const login = new URL('/api/auth/login', url.origin);
        login.searchParams.set('next', url.pathname + url.search);
        return Response.redirect(login.toString(), 302);
      }
    }
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
