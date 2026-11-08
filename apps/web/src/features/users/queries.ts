// 利用者管理の API フック（/api/users、モデル管理者だけ）
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Role } from '../../../shared/types';
import { apiGet, apiSend } from '../../data/api';

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

const KEY = ['users'] as const;
const path = (email: string) => `/users/${encodeURIComponent(email)}`;

export const useUsers = (enabled: boolean) => useQuery({ queryKey: KEY, queryFn: () => apiGet<UserRow[]>('/users'), enabled });

export function useUserMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: KEY });
  return {
    add: useMutation({ mutationFn: (u: UserRow) => apiSend('POST', '/users', u), onSuccess: done }),
    update: useMutation({ mutationFn: ({ email, ...rest }: Partial<UserRow> & { email: string }) => apiSend('PUT', path(email), rest), onSuccess: done }),
    remove: useMutation({ mutationFn: (email: string) => apiSend('DELETE', path(email)), onSuccess: done }),
  };
}
