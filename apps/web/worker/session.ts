// ログイン セッション（GitHub OAuth のあと）。HS256 の JWT を HttpOnly クッキーに入れる。
// 秘密鍵は SESSION_SECRET（`wrangler secret put SESSION_SECRET`）。署名・検証は WebCrypto なので CPU は軽い。
import { SignJWT, jwtVerify } from 'jose';

/** __Host- 接頭辞: Secure・Path=/・Domain なしを強制（サブドメインから上書きできない） */
export const SESSION_COOKIE = '__Host-cobra_session';
export const OAUTH_COOKIE = '__Host-cobra_oauth';
export const SESSION_TTL_S = 7 * 24 * 60 * 60;
export const OAUTH_TTL_S = 10 * 60;

const ISSUER = 'cobra-estimator';
const key = (secret: string) => new TextEncoder().encode(secret);

/** 用途（aud）ごとに分けて、OAuth の一時クッキーをセッションとして使えないようにする */
type Purpose = 'session' | 'oauth';

export async function signToken(claims: Record<string, string>, purpose: Purpose, secret: string, ttlS: number): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(purpose)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlS)
    .sign(key(secret));
}

/** 検証できればクレームを返す。秘密鍵が未設定・署名不正・期限切れは null。 */
export async function verifyToken(token: string | undefined, purpose: Purpose, secret: string | undefined): Promise<Record<string, unknown> | null> {
  if (!token || !secret) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), { issuer: ISSUER, audience: purpose, algorithms: ['HS256'] });
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** セッション クッキーの email（小文字）。無効なら null。 */
export async function sessionEmail(token: string | undefined, secret: string | undefined): Promise<string | null> {
  const p = await verifyToken(token, 'session', secret);
  return typeof p?.email === 'string' && p.email ? p.email : null;
}

/** ログイン後の戻り先。同一オリジンのパスだけ許す（オープン リダイレクト防止）。 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || next.startsWith('/api/')) return '/';
  return next;
}
