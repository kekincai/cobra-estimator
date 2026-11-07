// /api/transfer のクエリとミューテーション
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuditRow, SubmissionRow, TransferImportRequest, TransferImportResponse } from '../../../shared/types';
import { apiGet, apiSend, qk } from '../../data/api';

export const transferKeys = {
  history: ['transfer', 'history'] as const,
  submissions: ['transfer', 'submissions'] as const,
};

export const useTransferHistory = () => useQuery({ queryKey: transferKeys.history, queryFn: () => apiGet<AuditRow[]>('/transfer/history') });

export const useSubmissions = (enabled: boolean) =>
  useQuery({ queryKey: transferKeys.submissions, queryFn: () => apiGet<SubmissionRow[]>('/transfer/submissions'), enabled });

export function useImportCommit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: TransferImportRequest) => apiSend<TransferImportResponse>('POST', '/transfer/import', req),
    onSuccess: () => {
      for (const key of [qk.model, qk.factors, qk.projects, transferKeys.history]) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

export function useSubmit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { modelVersionId: string; payload: unknown; note: string }) => apiSend<{ id: string }>('POST', '/transfer/submissions', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: transferKeys.submissions });
      void qc.invalidateQueries({ queryKey: transferKeys.history });
    },
  });
}

/** 書き出しの監査ログ（失敗しても書き出し自体は止めない） */
export function logExport(detail: unknown) {
  return apiSend('POST', '/transfer/audit', { action: 'export', detail }).catch(() => undefined);
}
