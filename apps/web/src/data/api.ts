// API クライアント + TanStack Query フック。画面はここ経由でデータを読む。
// 画面固有のミューテーションは各画面の features/ 側で useMutation(apiSend(...)) を書けばよい。
import { useQuery } from '@tanstack/react-query';
import type { EstimateRow, EstimateWithGenerations, FactorRow, Me, ModelBundle, ProjectRow } from '../../shared/types';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export const apiGet = <T>(path: string) => fetch(`/api${path}`).then((r) => handle<T>(r));

export const apiSend = <T = unknown>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown) =>
  fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then((r) => handle<T>(r));

export const qk = {
  me: ['me'] as const,
  model: ['model'] as const,
  factors: ['factors'] as const,
  projects: ['projects'] as const,
  project: (id: string) => ['projects', id] as const,
  estimates: ['estimates'] as const,
  estimate: (id: string) => ['estimates', id] as const,
};

export const useMe = () => useQuery({ queryKey: qk.me, queryFn: () => apiGet<Me>('/me'), staleTime: 60_000 });
export const useModel = () => useQuery({ queryKey: qk.model, queryFn: () => apiGet<ModelBundle>('/model') });
export const useFactors = () => useQuery({ queryKey: qk.factors, queryFn: () => apiGet<FactorRow[]>('/factors') });
export const useProjects = () => useQuery({ queryKey: qk.projects, queryFn: () => apiGet<ProjectRow[]>('/projects') });
export const useProject = (id: string | undefined) =>
  useQuery({ queryKey: qk.project(id ?? ''), queryFn: () => apiGet<ProjectRow>(`/projects/${id}`), enabled: !!id });
export const useEstimates = () => useQuery({ queryKey: qk.estimates, queryFn: () => apiGet<EstimateRow[]>('/estimates') });
export const useEstimate = (id: string | undefined) =>
  useQuery({ queryKey: qk.estimate(id ?? ''), queryFn: () => apiGet<EstimateWithGenerations>(`/estimates/${id}`), enabled: !!id });
