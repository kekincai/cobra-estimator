import { describe, expect, it } from 'vitest';
import { fieldErrorsFromIssues, guardChange, lockReason, userUpdateSchema, validateNewUser } from './user-rules';

describe('validateNewUser（画面と API で同じ規則）', () => {
  const ok = { email: 'Tanaka@Example.co.jp', name: ' S. Tanaka ', role: 'estimator' };

  it('正しい入力は正規化して通す（前後空白除去・メールは小文字）', () => {
    expect(validateNewUser(ok)).toEqual({ ok: true, value: { email: 'tanaka@example.co.jp', name: 'S. Tanaka', role: 'estimator' } });
    expect(validateNewUser({ ...ok, email: '  a.b+c@sub.example.com ' })).toMatchObject({ ok: true, value: { email: 'a.b+c@sub.example.com' } });
  });

  it.each(['a@b', 'tanaka@corp', 'name', 'name@', '@example.com', 'a b@example.com', 'a@@example.com'])('不正なメールアドレス %s は拒否（ブラウザの type=email は a@b を通すが、ここでは通さない）', (email) => {
    const r = validateNewUser({ ...ok, email });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.email).toMatch(/メールアドレス/);
  });

  it('空・空白だけは「入力してください」', () => {
    for (const email of ['', '   ']) {
      const r = validateNewUser({ ...ok, email });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.email).toBe('メールアドレスを入力してください');
    }
    const r = validateNewUser({ ...ok, name: '  ' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.name).toBe('表示名を入力してください');
  });

  it('長さの上限（表示名 60・メール 254）', () => {
    expect(validateNewUser({ ...ok, name: 'あ'.repeat(60) }).ok).toBe(true);
    const long = validateNewUser({ ...ok, name: 'あ'.repeat(61) });
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.errors.name).toMatch('60 文字以内');
    const email = `${'a'.repeat(64)}@${'b'.repeat(186)}.com`; // 255 文字（254 を超える）
    expect(email.length).toBeGreaterThan(254);
    const r = validateNewUser({ ...ok, email });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.email).toMatch(/メールアドレス/);
  });

  it('権限は 3 種のみ・型違いも項目エラー（例外にしない）', () => {
    const r = validateNewUser({ ...ok, role: 'root' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.role).toBe('権限を選んでください');
    const r2 = validateNewUser({ email: 1, name: null, role: undefined });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(Object.keys(r2.errors).sort()).toEqual(['email', 'name', 'role']);
  });

  it('メッセージは日本語のみ（生の Zod 英語・正規表現を出さない）', () => {
    const r = validateNewUser({ email: 'a@b', name: '', role: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) for (const m of Object.values(r.errors)) expect(m).toMatch(/[぀-ヿ]/);
  });

  it('更新は項目単位（部分更新）', () => {
    expect(userUpdateSchema.parse({ role: 'pmo' })).toEqual({ role: 'pmo' });
    expect(userUpdateSchema.safeParse({ role: 'owner' }).success).toBe(false);
  });
});

describe('fieldErrorsFromIssues', () => {
  it('API の {path:"email"} と Zod の {path:["email"]} の両方を読む・項目ごとに最初の 1 件', () => {
    expect(
      fieldErrorsFromIssues([
        { path: 'email', message: 'A' },
        { path: ['email'], message: 'B' },
        { path: ['name'], message: 'C' },
        { path: 'role.x', message: 'D' },
        { path: '', message: 'E' },
        { path: ['other'], message: 'F' },
      ]),
    ).toEqual({ email: 'A', name: 'C', role: 'D' });
    expect(fieldErrorsFromIssues([])).toEqual({});
  });
});

const all = [
  { email: 'a@example.com', role: 'admin' as const },
  { email: 'b@example.com', role: 'estimator' as const },
];

describe('lockReason（画面で操作を止める理由。guardChange と同じ規則）', () => {
  it('自分自身の行', () => {
    expect(lockReason(all, 'b@example.com', 'b@example.com')).toMatch('自分自身');
  });
  it('最後のモデル管理者', () => {
    expect(lockReason(all, 'b@example.com', 'a@example.com')).toMatch('最後のモデル管理者');
    // 自分が登録されていない（ローカルの dev ユーザー）でも最後の管理者は守る
    expect(lockReason(all, 'dev@example.com', 'a@example.com')).toMatch('最後のモデル管理者');
    expect(lockReason(all, undefined, 'a@example.com')).toMatch('最後のモデル管理者');
  });
  it('管理者が 2 人いれば他の管理者は操作できる', () => {
    const two = [...all, { email: 'c@example.com', role: 'admin' as const }];
    expect(lockReason(two, 'c@example.com', 'a@example.com')).toBeNull();
    expect(lockReason(two, 'c@example.com', 'b@example.com')).toBeNull();
  });
  it('lockReason が null なら guardChange も削除・降格を許す（画面と API が食い違わない）', () => {
    const two = [...all, { email: 'c@example.com', role: 'admin' as const }];
    for (const actor of ['a@example.com', 'c@example.com', 'dev@example.com']) {
      for (const u of two) {
        const locked = lockReason(two, actor, u.email) !== null;
        const del = guardChange(two, actor, u.email, 'deleted') !== null;
        expect(del).toBe(locked);
      }
    }
  });
});
