// 利用者管理の API フック（/api/users、モデル管理者だけ）
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fieldErrorsFromIssues, type UserFieldErrors } from '../../../shared/user-rules';
import type { Role } from '../../../shared/types';
import { ApiError, apiGet, apiSend } from '../../data/api';

export interface UserRow {
  email: string;
  name: string;
  role: Role;
}

export const ROLE_OPTIONS: { value: Role; label: string; note: string }[] = [
  { value: 'admin', label: 'モデル管理者', note: 'モデル構築・変動要因の変更・取り込みの承認・利用者管理' },
  { value: 'estimator', label: '見積り担当', note: '工数見積り・リスク・レポート' },
  { value: 'pmo', label: 'PMO', note: '実績データの登録・取り込み / 書き出し' },
];

export const roleLabel = (r: Role) => ROLE_OPTIONS.find((o) => o.value === r)?.label ?? r;

/** 項目ごとのエラーを持つ API エラー（400 の issues、409 の登録済みメールアドレス） */
export class UserInputError extends ApiError {
  constructor(status: number, message: string, public fields: UserFieldErrors) {
    super(status, message);
  }
}

const KEY = ['users'] as const;
const path = (email: string) => `/users/${encodeURIComponent(email)}`;

/** 追加。400 の issues と 409 を項目エラーに読み替えるため、apiSend ではなく直接 fetch する */
async function addUser(u: UserRow): Promise<unknown> {
  const res = await fetch('/api/users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(u) });
  const body = (await res.json().catch(() => ({}))) as { error?: string; issues?: { path: unknown; message: string }[] };
  if (res.ok) return body;
  const message = body.error ?? res.statusText;
  if (res.status === 400 && Array.isArray(body.issues)) throw new UserInputError(400, message, fieldErrorsFromIssues(body.issues));
  if (res.status === 409) throw new UserInputError(409, message, { email: message });
  throw new ApiError(res.status, message);
}

export const useUsers = (enabled: boolean) => useQuery({ queryKey: KEY, queryFn: () => apiGet<UserRow[]>('/users'), enabled });

export function useUserMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: KEY });
  return {
    add: useMutation({ mutationFn: addUser, onSuccess: done }),
    update: useMutation({ mutationFn: ({ email, ...rest }: Partial<UserRow> & { email: string }) => apiSend('PUT', path(email), rest), onSuccess: done }),
    remove: useMutation({ mutationFn: (email: string) => apiSend('DELETE', path(email)), onSuccess: done }),
  };
}
