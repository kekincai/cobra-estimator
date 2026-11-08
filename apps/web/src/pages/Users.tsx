// /admin/users 利用者管理（モデル管理者だけ）。設計稿なし — 既存画面（実績データ・モデル構築）の部品と文体に合わせる。
// 本番は GitHub でログインし、確認済みメールアドレスがここに登録されている人だけが使える。
import { useState, type FormEvent } from 'react';
import type { Role } from '../../shared/types';
import { useMe } from '../data/api';
import { ROLE_OPTIONS, useUserMutations, useUsers, type UserRow } from '../features/users/queries';

const field = 'w-full rounded-[10px] border border-muted bg-bg px-3 py-[9px] text-[13px] text-text focus:border-accent focus:outline-none';
const roleLabel = (r: Role) => ROLE_OPTIONS.find((o) => o.value === r)?.label ?? r;

export default function UsersPage() {
  const me = useMe();
  const self = me.data?.user;
  const isAdmin = self?.role === 'admin';
  const list = useUsers(isAdmin);
  const { add, update, remove } = useUserMutations();

  const [draft, setDraft] = useState<UserRow>({ email: '', name: '', role: 'estimator' });
  const [confirming, setConfirming] = useState<string | null>(null);

  if (me.isPending) return <div className="p-8 text-[13px] text-sub">読み込み中…</div>;
  if (!isAdmin) return <div className="p-8"><div className="tile p-8 text-[13px] text-sub">利用者管理はモデル管理者だけが使えます。</div></div>;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate(draft, { onSuccess: () => setDraft({ email: '', name: '', role: draft.role }) });
  };
  const error = add.error ?? update.error ?? remove.error;
  const rows = list.data ?? [];

  return (
    <div className="flex min-w-0 flex-col gap-5 px-8 pt-6 pb-10">
      <header className="flex flex-col gap-1.5">
        <span className="inline-flex items-center gap-2 text-[11px] text-sub">
          <span className="size-1.5 rounded-full bg-teal" />
          管理
        </span>
        <h1 className="n m-0 text-[30px] leading-[1.1]">
          利用者 <span className="text-[16px] font-medium tracking-normal text-weak">{rows.length} 人</span>
        </h1>
        <span className="text-[12px] text-sub">
          GitHub でログインします。GitHub アカウントの確認済みメールアドレスがここに登録されている人だけが使えます。
        </span>
      </header>

      <section className="grid grid-cols-12 gap-4">
        <form onSubmit={submit} className="tile col-span-12 flex flex-col gap-3.5 px-[26px] py-[22px] xl:col-span-4">
          <span className="text-[13px] font-medium">利用者を追加</span>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="u-email" className="text-[11px] text-sub">メールアドレス (GitHub で確認済みのもの)</label>
            <input id="u-email" type="email" required autoComplete="off" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className={field} placeholder="name@example.com" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="u-name" className="text-[11px] text-sub">表示名</label>
            <input id="u-name" required maxLength={60} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={field} placeholder="例: S. Tanaka" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="u-role" className="text-[11px] text-sub">権限</label>
            <select id="u-role" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })} className={field}>
              {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <span className="text-[11px] text-weak">{ROLE_OPTIONS.find((o) => o.value === draft.role)?.note}</span>
          </div>
          <button type="submit" disabled={add.isPending} className="btn mt-1 min-h-10 cursor-pointer rounded-[10px] border-0 bg-accent px-4 text-[13px] font-bold text-bg disabled:opacity-60">
            {add.isPending ? '追加中…' : '追加する'}
          </button>
          <span className="text-[11px] leading-[1.6] text-weak">
            追加したら、相手に <span className="font-num text-sub">{location.origin}</span> を開いて GitHub でログインするよう伝えてください。
          </span>
        </form>

        <div className="tile col-span-12 flex min-w-0 flex-col gap-1 px-2.5 pt-2 pb-3 xl:col-span-8">
          {error && (
            <p role="alert" className="mx-3.5 my-2 rounded-[10px] bg-coral-bg px-3 py-2 text-[12px] text-coral-ink">
              保存できませんでした: {error.message}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0">
              <thead>
                <tr className="[&>th]:border-b [&>th]:border-line [&>th]:px-3.5 [&>th]:py-2.5 [&>th]:text-left [&>th]:text-[11px] [&>th]:font-medium [&>th]:tracking-[0.04em] [&>th]:whitespace-nowrap [&>th]:text-weak">
                  <th>表示名</th>
                  <th>メールアドレス</th>
                  <th>権限</th>
                  <th className="!text-right">操作</th>
                </tr>
              </thead>
              <tbody className="[&_td]:border-b [&_td]:border-line [&_td]:px-3.5 [&_td]:py-2.5 [&_td]:text-[13px]">
                {list.isPending && (
                  <tr><td colSpan={4} className="text-sub">読み込み中…</td></tr>
                )}
                {list.isError && (
                  <tr><td colSpan={4} className="text-coral-ink">読み込めませんでした: {list.error.message}</td></tr>
                )}
                {rows.map((u) => {
                  const isSelf = u.email === self.email;
                  return (
                    <tr key={u.email}>
                      <td className="font-medium whitespace-nowrap">
                        {u.name}
                        {isSelf && <span className="ml-1.5 text-[11px] font-normal text-weak">(あなた)</span>}
                      </td>
                      <td className="font-num text-sub">{u.email}</td>
                      <td>
                        {isSelf ? (
                          <span className="text-sub">{roleLabel(u.role)}</span>
                        ) : (
                          <select
                            aria-label={`${u.name} の権限`}
                            value={u.role}
                            disabled={update.isPending}
                            onChange={(e) => update.mutate({ email: u.email, role: e.target.value as Role })}
                            className="cursor-pointer rounded-full border-0 bg-raised px-2.5 py-1 font-[inherit] text-[12px] text-text"
                          >
                            {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        {!isSelf &&
                          (confirming === u.email ? (
                            <span className="inline-flex gap-2">
                              <button type="button" onClick={() => remove.mutate(u.email, { onSettled: () => setConfirming(null) })} disabled={remove.isPending} className="btn min-h-7 cursor-pointer rounded-full border-0 bg-coral-bg px-3 text-[12px] font-medium text-coral-ink">
                                削除する
                              </button>
                              <button type="button" onClick={() => setConfirming(null)} className="btn min-h-7 cursor-pointer rounded-full border border-muted bg-transparent px-3 text-[12px] text-sub">
                                やめる
                              </button>
                            </span>
                          ) : (
                            <button type="button" onClick={() => setConfirming(u.email)} className="btn min-h-7 cursor-pointer rounded-full border border-muted bg-transparent px-3 text-[12px] text-sub hover:text-text">
                              削除
                            </button>
                          ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
