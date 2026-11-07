export const fmtInt = (v: number) => Math.round(v).toLocaleString('en-US');
export const fmt1 = (v: number) => v.toFixed(1);
export const fmtPct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`;
export const fmtSignedPct = (v: number, digits = 0) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(digits)}%`;
export const factorNo = (no: number) => String(no).padStart(2, '0');
