// /api/transfer のクエリとミューテーション
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuditRow, SubmissionRow } from '../../../shared/types';
import { apiGet, apiSend, qk } from '../../data/api';
import type { ImportRequest, ImportResponse } from './importPlan';

export const transferKeys = {
  history: ['transfer', 'history'] as const,
  submissions: ['transfer', 'submissions'] as const,
};

/** レビュー結果（コメントは監査ログから。worker/routes/transfer.ts の attachReviews） */
export interface SubmissionReview {
  status: 'approved' | 'rejected';
  note: string;
  at: string;
  by: string;
}
export type SubmissionWithReview = SubmissionRow & { review: SubmissionReview | null };

export const useTransferHistory = () => useQuery({ queryKey: transferKeys.history, queryFn: () => apiGet<AuditRow[]>('/transfer/history') });

/** 申請の一覧（管理者はすべて、それ以外は自分の申請だけがサーバーから返る） */
export const useSubmissions = (enabled: boolean) =>
  useQuery({ queryKey: transferKeys.submissions, queryFn: () => apiGet<SubmissionWithReview[]>('/transfer/submissions'), enabled });

export function useImportCommit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: ImportRequest) => apiSend<ImportResponse>('POST', '/transfer/import', req),
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

/** 申請の承認・却下（モデル管理者） */
export function useReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; status: 'approved' | 'rejected'; note?: string }) =>
      apiSend<{ ok: true; status: 'approved' | 'rejected' }>('PUT', `/transfer/submissions/${encodeURIComponent(id)}`, body),
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
