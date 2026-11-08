// /admin/users 利用者管理（モデル管理者だけ）。設計稿なし — 既存画面（実績データ・モデル構築）の部品と文体に合わせる。
// 本番は GitHub でログインし、確認済みメールアドレスがここに登録されている人だけが使える。
// 入力検証と締め出し防止（自分自身・最後のモデル管理者）は API と同じ規則（shared/user-rules.ts）。
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { lockReason, validateNewUser, type UserField, type UserFieldErrors } from '../../shared/user-rules';
import type { Role } from '../../shared/types';
import { useMe } from '../data/api';
import { ROLE_OPTIONS, roleLabel, UserInputError, useUserMutations, useUsers, type UserRow } from '../features/users/queries';
import { describeApiError } from '../ui/apiError';
import { ConfirmDialog } from '../ui/ConfirmDialog';

const fieldCls = (invalid: boolean) =>
  `w-full min-w-0 rounded-[10px] border bg-bg px-3 py-[9px] text-[13px] text-text focus:outline-none ${invalid ? 'border-coral focus:border-coral' : 'border-muted focus:border-accent'}`;

const FIELD_ORDER: UserField[] = ['email', 'name', 'role'];

export default function UsersPage() {
  const me = useMe();
  const self = me.data?.user;
  const isAdmin = self?.role === 'admin';
  const list = useUsers(isAdmin);
  const { add, update, remove } = useUserMutations();

  const [draft, setDraft] = useState<UserRow>({ email: '', name: '', role: 'estimator' });
  const [errors, setErrors] = useState<UserFieldErrors>({});
  const [roleChange, setRoleChange] = useState<{ user: UserRow; next: Role } | null>(null);
  const [removing, setRemoving] = useState<UserRow | null>(null);
  const [notice, setNotice] = useState<{ email?: string; text: string } | null>(null);
  const inputs = useRef<Partial<Record<UserField, HTMLInputElement | HTMLSelectElement | null>>>({});
  const listRef = useRef<HTMLDivElement>(null);

  // 「追加しました」「変更しました」は数秒で消す（読み上げは role=status で 1 回）
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  if (me.isPending) return <div className="p-8 text-[13px] text-sub">読み込み中…</div>;
  if (!isAdmin) return <div className="p-4 sm:p-8"><div className="tile p-8 text-[13px] text-sub">利用者管理はモデル管理者だけが使えます。</div></div>;

  const rows = list.data ?? [];

  const showErrors = (errs: UserFieldErrors) => {
    setErrors(errs);
    const first = FIELD_ORDER.find((f) => errs[f]);
    if (first) inputs.current[first]?.focus();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.reset();
    const v = validateNewUser(draft);
    if (!v.ok) return showErrors(v.errors);
    setErrors({});
    add.mutate(v.value, {
      onSuccess: () => {
        setDraft({ email: '', name: '', role: draft.role });
        setNotice({ text: `${v.value.name} を追加しました` });
      },
      onError: (err) => {
        if (err instanceof UserInputError && Object.keys(err.fields).length) showErrors(err.fields);
      },
    });
  };

  const edit = (k: UserField, value: string) => {
    setDraft({ ...draft, [k]: value });
    if (errors[k]) setErrors({ ...errors, [k]: undefined });
  };

  // 項目に出せなかったエラーだけフォームの下に出す
  const addError = add.error && !(add.error instanceof UserInputError && Object.keys(add.error.fields).length) ? describeApiError(add.error, '追加できませんでした。時間をおいて再試行してください。') : null;

  const askRole = (user: UserRow, next: Role) => {
    if (next === user.role) return;
    update.reset();
    setRoleChange({ user, next });
  };
  const confirmRole = () => {
    if (!roleChange) return;
    const { user, next } = roleChange;
    update.mutate(
      { email: user.email, role: next },
      {
        onSuccess: () => {
          setRoleChange(null);
          setNotice({ email: user.email, text: `${roleLabel(next)} に変更しました` });
        },
      },
    );
  };
  const confirmRemove = () => {
    if (!removing) return;
    const u = removing;
    remove.mutate(u.email, {
      onSuccess: () => {
        setRemoving(null);
        setNotice({ text: `${u.name} を削除しました` });
        // 押したボタンの行が消えるので、フォーカスは一覧へ戻す
        requestAnimationFrame(() => listRef.current?.focus());
      },
    });
  };

  const demotingAdmin = roleChange?.user.role === 'admin' && roleChange.next !== 'admin';

  return (
    <div className="flex min-w-0 flex-col gap-5 px-4 pt-6 pb-10 sm:px-8">
      <header className="flex min-w-0 flex-col gap-1.5">
        <span className="inline-flex items-center gap-2 text-[11px] text-sub">
          <span className="size-1.5 rounded-full bg-teal" />
          管理
        </span>
        <h1 className="n m-0 text-[30px] leading-[1.1]">
          利用者 {list.isSuccess && <span className="text-[16px] font-medium tracking-normal text-sub">{rows.length} 人</span>}
        </h1>
        <span className="text-[12px] text-sub">
          GitHub でログインします。GitHub アカウントの確認済みメールアドレスがここに登録されている人だけが使えます。
        </span>
      </header>

      <section className="grid grid-cols-12 gap-4">
        <form onSubmit={submit} noValidate aria-labelledby="u-add-title" className="tile col-span-12 flex min-w-0 flex-col gap-3.5 px-5 py-[22px] sm:px-[26px] xl:col-span-4">
          <h2 id="u-add-title" className="m-0 text-[13px] font-medium">
            利用者を追加
          </h2>
          <Field id="u-email" label="メールアドレス (GitHub で確認済みのもの)" error={errors.email}>
            {(a11y) => (
              <input
                {...a11y}
                ref={(el) => {
                  inputs.current.email = el;
                }}
                type="email"
                inputMode="email"
                autoComplete="off"
                spellCheck={false}
                value={draft.email}
                onChange={(e) => edit('email', e.target.value)}
                className={fieldCls(!!errors.email)}
                placeholder="name@example.com"
              />
            )}
          </Field>
          <Field id="u-name" label="表示名" error={errors.name}>
            {(a11y) => (
              <input
                {...a11y}
                ref={(el) => {
                  inputs.current.name = el;
                }}
                maxLength={60}
                value={draft.name}
                onChange={(e) => edit('name', e.target.value)}
                className={fieldCls(!!errors.name)}
                placeholder="例: S. Tanaka"
              />
            )}
          </Field>
          <Field id="u-role" label="権限" error={errors.role} hint={ROLE_OPTIONS.find((o) => o.value === draft.role)?.note}>
            {(a11y) => (
              <select
                {...a11y}
                ref={(el) => {
                  inputs.current.role = el;
                }}
                value={draft.role}
                onChange={(e) => edit('role', e.target.value)}
                className={fieldCls(!!errors.role)}
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <button type="submit" disabled={add.isPending} className="btn mt-1 min-h-10 cursor-pointer rounded-[10px] border-0 bg-accent px-4 text-[13px] font-bold text-bg disabled:opacity-60">
            {add.isPending ? '追加中…' : '追加する'}
          </button>
          {addError && (
            <p role="alert" className="m-0 rounded-[10px] bg-coral-bg px-3 py-2 text-[12px] leading-[1.6] text-coral-ink">
              {addError}
            </p>
          )}
          <span className="text-[11px] leading-[1.6] break-words text-sub">
            追加したら、相手に <span className="font-num break-all text-text">{location.origin}</span> を開いて GitHub でログインするよう伝えてください。
          </span>
        </form>

        <div ref={listRef} tabIndex={-1} aria-label="利用者の一覧" role="region" className="tile col-span-12 flex min-w-0 flex-col gap-1 px-1.5 pt-2 pb-3 outline-none sm:px-2.5 xl:col-span-8">
          <p role="status" className="m-0 min-h-0 px-3.5 text-[12px] text-ok">
            {notice && !notice.email ? notice.text : ''}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0">
              <caption className="sr-only">登録されている利用者</caption>
              <thead>
                <tr className="[&>th]:border-b [&>th]:border-line [&>th]:px-3 [&>th]:py-2.5 [&>th]:text-left [&>th]:text-[11px] [&>th]:font-medium [&>th]:tracking-[0.04em] [&>th]:whitespace-nowrap [&>th]:text-sub sm:[&>th]:px-3.5">
                  <th scope="col">利用者</th>
                  <th scope="col">権限</th>
                  <th scope="col" className="w-[1%] !text-right">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="[&_td]:border-b [&_td]:border-line [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-middle [&_td]:text-[13px] sm:[&_td]:px-3.5">
                {list.isPending && (
                  <tr>
                    <td colSpan={3} className="text-sub">
                      読み込み中…
                    </td>
                  </tr>
                )}
                {list.isError && (
                  <tr>
                    <td colSpan={3}>
                      <span role="alert" className="flex flex-wrap items-center gap-3 text-coral-ink">
                        {describeApiError(list.error, '利用者の一覧を読み込めませんでした。')}
                        <button type="button" onClick={() => list.refetch()} className="btn min-h-8 cursor-pointer rounded-full border border-muted bg-transparent px-3 text-[12px] text-text">
                          再試行
                        </button>
                      </span>
                    </td>
                  </tr>
                )}
                {rows.map((u) => {
                  const isSelf = u.email === self.email;
                  const lock = lockReason(rows, self.email, u.email);
                  const rowNotice = notice?.email === u.email ? notice.text : '';
                  return (
                    <tr key={u.email}>
                      <td className="min-w-0">
                        <span className="block font-medium break-words">
                          {u.name}
                          {isSelf && <span className="ml-1.5 text-[11px] font-normal text-sub">(あなた)</span>}
                        </span>
                        <span className="font-num block text-[12px] break-all text-sub">{u.email}</span>
                      </td>
                      <td>
                        <div className="flex flex-col items-start gap-1">
                          {lock ? (
                            <>
                              <span className="text-sub">{roleLabel(u.role)}</span>
                              <span className="text-[11px] leading-[1.5] text-sub">{lock}</span>
                            </>
                          ) : (
                            <select
                              aria-label={`${u.name} の権限`}
                              value={u.role}
                              disabled={update.isPending}
                              onChange={(e) => askRole(u, e.target.value as Role)}
                              className="min-h-8 cursor-pointer rounded-full border-0 bg-raised px-2.5 py-1 font-[inherit] text-[12px] text-text"
                            >
                              {ROLE_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          )}
                          <span role="status" className="text-[11px] text-ok">
                            {rowNotice}
                          </span>
                        </div>
                      </td>
                      <td className="text-right">
                        {!lock && (
                          <button
                            type="button"
                            onClick={() => {
                              remove.reset();
                              setRemoving(u);
                            }}
                            aria-label={`${u.name} を削除`}
                            className="btn min-h-8 cursor-pointer rounded-full border border-muted bg-transparent px-3 text-[12px] whitespace-nowrap text-sub hover:text-text"
                          >
                            削除
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={!!roleChange}
        title="権限を変更しますか"
        confirmLabel="変更する"
        danger={demotingAdmin}
        busy={update.isPending}
        error={update.error ? describeApiError(update.error, '権限を変更できませんでした。') : null}
        onConfirm={confirmRole}
        onCancel={() => setRoleChange(null)}
      >
        {roleChange && (
          <>
            <p className="m-0">
              <span className="font-bold text-text">{roleChange.user.name}</span> の権限を「{roleLabel(roleChange.user.role)}」から「{roleLabel(roleChange.next)}」に変更します。
            </p>
            <p className="m-0 mt-2">
              {demotingAdmin
                ? 'モデル構築・変動要因の変更・利用者管理ができなくなります。'
                : `変更後にできること: ${ROLE_OPTIONS.find((o) => o.value === roleChange.next)?.note ?? ''}`}
            </p>
          </>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={!!removing}
        title="利用者を削除しますか"
        confirmLabel="削除する"
        danger
        busy={remove.isPending}
        error={remove.error ? describeApiError(remove.error, '削除できませんでした。') : null}
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      >
        {removing && (
          <>
            <p className="m-0">
              <span className="font-bold text-text">{removing.name}</span>（<span className="font-num break-all">{removing.email}</span>）を利用者から外します。
            </p>
            <p className="m-0 mt-2">この人はこのツールにログインできなくなります。必要になったら、同じメールアドレスでもう一度追加できます。</p>
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}

/** ラベル・説明・エラーを入力欄に結びつける（aria-invalid / aria-describedby） */
function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: (a11y: { id: string; 'aria-invalid'?: true; 'aria-describedby'?: string }) => ReactNode;
}) {
  const base = useId();
  const hintId = `${base}-hint`;
  const errId = `${base}-err`;
  const describedBy = [error ? errId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[11px] text-sub">
        {label}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {error && (
        <span id={errId} className="text-[12px] leading-[1.5] text-coral-soft">
          {error}
        </span>
      )}
      {hint && (
        <span id={hintId} className="text-[11px] text-sub">
          {hint}
        </span>
      )}
    </div>
  );
}
