// 利用者管理のルール。画面（pages/Users.tsx）と API（worker/routes/users.ts）の両方で同じものを使う。
// - 入力検証（メールアドレス・表示名・権限）
// - 締め出し防止（自分自身は削除・権限変更できない／モデル管理者を 0 人にしない）
import { z } from 'zod';

export type UserRole = 'admin' | 'estimator' | 'pmo';
export const USER_ROLES = ['admin', 'estimator', 'pmo'] as const satisfies readonly UserRole[];

export const EMAIL_MAX = 254;
export const NAME_MAX = 60;

export const userEmailSchema = z
  .string({ error: 'メールアドレスを入力してください' })
  .trim()
  .toLowerCase()
  .min(1, { error: 'メールアドレスを入力してください' })
  .max(EMAIL_MAX, { error: `メールアドレスは ${EMAIL_MAX} 文字以内にしてください` })
  .email({ error: 'メールアドレスの形式が正しくありません（例: name@example.com）' });

export const userNameSchema = z
  .string({ error: '表示名を入力してください' })
  .trim()
  .min(1, { error: '表示名を入力してください' })
  .max(NAME_MAX, { error: `表示名は ${NAME_MAX} 文字以内にしてください` });

export const userRoleSchema = z.enum(USER_ROLES, { error: '権限を選んでください' });

/** POST /api/users の本文 */
export const userCreateSchema = z.object({ email: userEmailSchema, name: userNameSchema, role: userRoleSchema });
/** PUT /api/users/:email の本文 */
export const userUpdateSchema = z.object({ name: userNameSchema, role: userRoleSchema }).partial();

export type UserField = 'email' | 'name' | 'role';
export type UserFieldErrors = Partial<Record<UserField, string>>;

const isField = (k: unknown): k is UserField => k === 'email' || k === 'name' || k === 'role';

/** issues（Zod の issues、または API が返す {path, message}[]）を項目ごとの最初のメッセージにまとめる */
export function fieldErrorsFromIssues(issues: readonly { path: unknown; message: string }[]): UserFieldErrors {
  const out: UserFieldErrors = {};
  for (const i of issues) {
    const key = Array.isArray(i.path) ? i.path[0] : typeof i.path === 'string' ? i.path.split('.')[0] : undefined;
    if (isField(key) && !out[key]) out[key] = i.message;
  }
  return out;
}

/** 追加フォームの検証。正しければ正規化した値（前後空白除去・メールは小文字）を返す */
export function validateNewUser(input: { email: unknown; name: unknown; role: unknown }):
  | { ok: true; value: { email: string; name: string; role: UserRole } }
  | { ok: false; errors: UserFieldErrors } {
  const r = userCreateSchema.safeParse(input);
  return r.success ? { ok: true, value: r.data } : { ok: false, errors: fieldErrorsFromIssues(r.error.issues) };
}

/**
 * 変更してよいか。締め出しを防ぐ:
 * - 自分自身は削除・権限変更できない
 * - モデル管理者を 0 人にしない
 * 問題があればエラーメッセージ、なければ null。
 */
export function guardChange(all: readonly { email: string; role: UserRole }[], actor: string, target: string, next: UserRole | 'deleted'): string | null {
  const cur = all.find((u) => u.email === target);
  if (!cur) return 'この利用者は登録されていません';
  if (target === actor && next !== cur.role) return next === 'deleted' ? '自分自身は削除できません' : '自分自身の権限は変更できません';
  const admins = all.filter((u) => u.role === 'admin').length;
  if (cur.role === 'admin' && next !== 'admin' && admins <= 1) return 'モデル管理者が 1 人もいなくなるため変更できません';
  return null;
}

/** 行の操作を止める理由（自分自身・最後のモデル管理者）。操作できるなら null */
export function lockReason(all: readonly { email: string; role: UserRole }[], actor: string | undefined, target: string): string | null {
  const cur = all.find((u) => u.email === target);
  if (!cur) return null;
  if (actor && target === actor) return '自分自身の権限変更・削除はできません';
  if (cur.role === 'admin' && all.filter((u) => u.role === 'admin').length <= 1) return '最後のモデル管理者なので、権限変更・削除はできません';
  return null;
}
