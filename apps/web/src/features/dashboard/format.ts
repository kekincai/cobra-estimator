/** ISO 日時 → "11/6 15:20"（ローカル時刻） */
export function fmtMDHM(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** ISO 日時 → "11/5" */
export function fmtMD(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 0.68 → "+68%" */
export const fmtSco = (v: number) => `+${Math.round(v * 100)}%`;

/** 見積り名 "顧客ポータル刷新 — 案B (外部連携あり)" → "顧客ポータル刷新" */
export const estimateTitle = (name: string) => name.split(/\s+[—–-]\s+/)[0] ?? name;
