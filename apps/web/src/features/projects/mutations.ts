import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ProjectRow } from '../../../shared/types';
import { apiSend, qk } from '../../data/api';

export interface ProjectInput {
  groupId: string;
  name: string;
  sizeFP: number;
  effortMM: number;
  levels: Record<string, number>;
  note: string;
  adopted: boolean;
  excludedReason: string | null;
}

/** 採用スイッチ: 一覧を楽観的に書き換えてから PUT。失敗したら戻す。 */
export function useToggleAdopted() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, adopted }: { id: string; adopted: boolean }) =>
      apiSend('PUT', `/projects/${encodeURIComponent(id)}`, { adopted }),
    onMutate: async ({ id, adopted }) => {
      await qc.cancelQueries({ queryKey: qk.projects });
      const prev = qc.getQueryData<ProjectRow[]>(qk.projects);
      qc.setQueryData<ProjectRow[]>(qk.projects, (rows) => rows?.map((r) => (r.id === id ? { ...r, adopted } : r)));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.projects, ctx.prev);
    },
    onSettled: (_d, _e, { id }) => {
      void qc.invalidateQueries({ queryKey: qk.projects, exact: true });
      void qc.invalidateQueries({ queryKey: qk.project(id) });
    },
  });
}

export function useSaveProject(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProjectInput) =>
      id
        ? apiSend<{ ok: true }>('PUT', `/projects/${encodeURIComponent(id)}`, body).then(() => ({ id }))
        : apiSend<{ id: string }>('POST', '/projects', body),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: qk.projects });
      await qc.invalidateQueries({ queryKey: qk.model });
      return res;
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiSend('DELETE', `/projects/${encodeURIComponent(id)}`),
    // 一覧だけ更新する。詳細（qk.project(id)）を再取得すると 404 で編集画面が先に消え、遷移できなくなる。
    // 詳細のキャッシュは遷移後に捨てる（setTimeout で編集画面のアンマウントを待つ）。
    onSuccess: (_d, id) => {
      void qc.invalidateQueries({ queryKey: qk.projects, exact: true });
      setTimeout(() => qc.removeQueries({ queryKey: qk.project(id) }), 0);
    },
  });
}
