import { describe, expect, it } from 'vitest';
import { safeNext, sessionEmail, signToken, verifyToken } from './session';

const SECRET = 'test-secret-0123456789abcdef0123456789abcdef';

describe('session', () => {
  it('署名したセッションから email を取り出せる', async () => {
    const t = await signToken({ email: 'a@example.com' }, 'session', SECRET, 60);
    expect(await sessionEmail(t, SECRET)).toBe('a@example.com');
  });

  it('秘密鍵違い・未設定・改ざん・期限切れは null', async () => {
    const t = await signToken({ email: 'a@example.com' }, 'session', SECRET, 60);
    expect(await sessionEmail(t, 'other-secret')).toBeNull();
    expect(await sessionEmail(t, '')).toBeNull();
    expect(await sessionEmail(t, undefined)).toBeNull();
    expect(await sessionEmail(undefined, SECRET)).toBeNull();
    const [h, , s] = t.split('.');
    const forged = `${h}.${btoa(JSON.stringify({ email: 'evil@example.com' })).replace(/=+$/, '')}.${s}`;
    expect(await sessionEmail(forged, SECRET)).toBeNull();
    expect(await sessionEmail(await signToken({ email: 'a@example.com' }, 'session', SECRET, -10), SECRET)).toBeNull();
  });

  it('OAuth の一時トークンはセッションとして通らない', async () => {
    const t = await signToken({ email: 'a@example.com', state: 'x' }, 'oauth', SECRET, 60);
    expect(await sessionEmail(t, SECRET)).toBeNull();
    expect((await verifyToken(t, 'oauth', SECRET))?.state).toBe('x');
  });

  it('戻り先は同一オリジンのパスだけ', () => {
    expect(safeNext('/estimate/portal/risk?x=1')).toBe('/estimate/portal/risk?x=1');
    expect(safeNext('https://evil.example.com')).toBe('/');
    expect(safeNext('//evil.example.com')).toBe('/');
    expect(safeNext('/\\evil.example.com')).toBe('/');
    expect(safeNext('/api/auth/logout')).toBe('/');
    expect(safeNext(undefined)).toBe('/');
  });
});
