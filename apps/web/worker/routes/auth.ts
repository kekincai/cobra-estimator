// GitHub OAuth でログインする。利用できるのは users 表にメールアドレスがある人だけ。
//   GET /api/auth/login?next=/path → GitHub の認可画面へ
//   GET /api/auth/callback          → GitHub から戻る。検証してセッション クッキーを発行
//   GET /api/auth/logout            → セッション クッキーを消す
import { inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { audit } from '../audit';
import { users } from '../db/schema';
import type { AppEnv } from '../env';
import { OAUTH_COOKIE, OAUTH_TTL_S, SESSION_COOKIE, SESSION_TTL_S, safeNext, signToken, verifyToken } from '../session';

const UA = 'cobra-estimator';

const page = (title: string, body: string, status: 401 | 403 | 500 | 200 = 200) =>
  new Response(
    `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
      `<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d12;color:#f2f4f8;font-family:system-ui,sans-serif">` +
      `<main style="max-width:420px;padding:24px;text-align:center"><h1 style="font-size:18px">${title}</h1><p style="color:#8b93a5;font-size:13px;line-height:1.7">${body}</p>` +
      `<p><a href="/api/auth/login" style="color:#d4ff4f">GitHub でログイン</a></p></main></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );

const callbackUrl = (reqUrl: string) => `${new URL(reqUrl).origin}/api/auth/callback`;

export const authRoute = new Hono<AppEnv>()
  .get('/login', async (c) => {
    const clientId: string = c.env.GITHUB_CLIENT_ID;
    if (!clientId || !c.env.SESSION_SECRET || !c.env.GITHUB_CLIENT_SECRET) {
      return page('ログインの設定が未完了です', 'GitHub OAuth App と SESSION_SECRET を設定してください。', 500);
    }
    const state = crypto.randomUUID();
    const next = safeNext(c.req.query('next'));
    setCookie(c, OAUTH_COOKIE, await signToken({ state, next }, 'oauth', c.env.SESSION_SECRET, OAUTH_TTL_S), {
      path: '/', secure: true, httpOnly: true, sameSite: 'Lax', maxAge: OAUTH_TTL_S,
    });
    const u = new URL('https://github.com/login/oauth/authorize');
    u.searchParams.set('client_id', clientId);
    u.searchParams.set('redirect_uri', callbackUrl(c.req.url));
    u.searchParams.set('scope', 'user:email');
    u.searchParams.set('state', state);
    u.searchParams.set('allow_signup', 'false');
    return c.redirect(u.toString(), 302);
  })
  .get('/callback', async (c) => {
    const oauth = await verifyToken(getCookie(c, OAUTH_COOKIE), 'oauth', c.env.SESSION_SECRET);
    deleteCookie(c, OAUTH_COOKIE, { path: '/', secure: true });
    const code = c.req.query('code');
    if (!oauth || !code || c.req.query('state') !== oauth.state) {
      return page('ログインできませんでした', '時間が経ちすぎたか、別のタブでログインした可能性があります。もう一度お試しください。', 401);
    }

    // code → アクセストークン
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': UA },
      body: JSON.stringify({ client_id: c.env.GITHUB_CLIENT_ID, client_secret: c.env.GITHUB_CLIENT_SECRET, code, redirect_uri: callbackUrl(c.req.url) }),
    });
    const tok = (await tokenRes.json().catch(() => ({}))) as { access_token?: string };
    if (!tok.access_token) return page('ログインできませんでした', 'GitHub からトークンを受け取れませんでした。', 401);

    // 確認済みの主メールアドレス
    const emailsRes = await fetch('https://api.github.com/user/emails', {
      headers: { authorization: `Bearer ${tok.access_token}`, accept: 'application/vnd.github+json', 'user-agent': UA },
    });
    const emailsText = await emailsRes.text();
    let emails: unknown = null;
    try {
      emails = JSON.parse(emailsText);
    } catch {
      /* 下でログに出す */
    }
    // 主メールが未確認のこともあるので、確認済みのアドレスすべてを候補にする（主メールを優先）
    const verified = Array.isArray(emails)
      ? (emails as { email: string; primary: boolean; verified: boolean }[])
          .filter((e) => e.verified && typeof e.email === 'string')
          .sort((a, b) => Number(b.primary) - Number(a.primary))
          .map((e) => e.email.toLowerCase())
      : [];
    if (!verified.length) {
      console.error('github /user/emails: no verified email', emailsRes.status, emailsRes.headers.get('x-oauth-scopes'));
      return page('ログインできませんでした', 'GitHub アカウントに確認済みのメールアドレスがありません。', 403);
    }

    const rows = await c.var.db.select().from(users).where(inArray(users.email, verified));
    const row = verified.map((e) => rows.find((r) => r.email === e)).find(Boolean);
    if (!row) return page('利用権限がありません', 'この GitHub アカウントのメールアドレスは利用者として登録されていません。管理者に登録を依頼してください。', 403);

    setCookie(c, SESSION_COOKIE, await signToken({ email: row.email }, 'session', c.env.SESSION_SECRET, SESSION_TTL_S), {
      path: '/', secure: true, httpOnly: true, sameSite: 'Lax', maxAge: SESSION_TTL_S,
    });
    c.set('user', row);
    await audit(c, 'auth.login', { via: 'github' });
    return c.redirect(safeNext(typeof oauth.next === 'string' ? oauth.next : '/'), 302);
  })
  .get('/logout', (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: '/', secure: true });
    return page('ログアウトしました', 'GitHub 側のログインは残っているため、次にログインするとそのまま入れます。');
  });
