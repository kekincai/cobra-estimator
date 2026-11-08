// 世代の選択を URL の ?gen=<label>（G1…G5）で表す（見積り・リスク・レポート共通の約束）。
import { useSearchParams } from 'react-router';
import type { GenerationRow } from '../../../shared/types';

export const GEN_PARAM = 'gen';

/** 「G2」「g2」「 G2 」を正規化。世代ラベルとして不正なら null */
export function normalizeGenLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase();
  return /^G[1-9]\d*$/.test(s) ? s : null;
}

/** ラベルに一致する世代。無ければ null（呼び出し側で既定の世代に戻す） */
export function resolveGen(gens: readonly GenerationRow[], label: string | null | undefined): GenerationRow | null {
  const l = normalizeGenLabel(label);
  if (!l) return null;
  return gens.find((g) => g.label === l) ?? null;
}

/** パスに ?gen= を付ける（label が無ければそのまま） */
export function withGen(path: string, label: string | null | undefined): string {
  const l = normalizeGenLabel(label);
  if (!l) return path;
  return `${path}${path.includes('?') ? '&' : '?'}${GEN_PARAM}=${encodeURIComponent(l)}`;
}

/** 見積り系画面の URL */
export const estimatePath = (id: string, tab: 'conditions' | 'risk' | 'report', label?: string | null) =>
  withGen(tab === 'conditions' ? `/estimate/${id}` : `/estimate/${id}/${tab}`, label);

/** 同じ見積りの「条件 / リスク / レポート」（下書きを保ったまま行き来できる範囲） */
export const isEstimateAreaPath = (id: string, pathname: string) => {
  const base = `/estimate/${id}`;
  const p = pathname.replace(/\/+$/, '');
  return p === base || p === `${base}/risk` || p === `${base}/report`;
};

/** 現在の ?gen=（正規化済み。無い・不正なら null） */
export function useGenParam(): string | null {
  const [params] = useSearchParams();
  return normalizeGenLabel(params.get(GEN_PARAM));
}
