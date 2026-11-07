import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../data/api';

/** GET /api/audit の 1 行（actor はメールではなく表示名） */
export interface AuditEntry {
  id: number;
  at: string;
  actor: string;
  action: string;
  detail: unknown;
}

export const useAudit = (limit = 6) =>
  useQuery({ queryKey: ['audit', limit], queryFn: () => apiGet<AuditEntry[]>(`/audit?limit=${limit}`) });
