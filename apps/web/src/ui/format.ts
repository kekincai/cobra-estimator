// 表示用の数値フォーマット。丸めは toFixed（= 画面に出る文字列）に揃える。
// 非有限値（NaN・±Infinity）は「—」、丸めた結果の −0 は 0 として表示する（「-0.0」「-0%」を出さない）。

const DASH = '—';
/** toFixed の結果から負のゼロ（"-0.0" など）の符号を落とす */
const unsignZero = (s: string) => (/^-0(\.0+)?$/.test(s) ? s.slice(1) : s);

export const fmtInt = (v: number) => (Number.isFinite(v) ? (Math.round(v) || 0).toLocaleString('en-US') : DASH);
export const fmt1 = (v: number) => (Number.isFinite(v) ? unsignZero(v.toFixed(1)) : DASH);
export const fmtPct = (v: number, digits = 0) => (Number.isFinite(v) ? `${unsignZero((v * 100).toFixed(digits))}%` : DASH);
/** 符号付き %（ΣCO の「+74%」など）。丸めて 0 になる値は「+0%」、負は U+2212「−」 */
export const fmtSignedPct = (v: number, digits = 0) => {
  if (!Number.isFinite(v)) return DASH;
  const r = roundTo(v * 100, digits);
  return `${r >= 0 ? '+' : '−'}${Math.abs(r).toFixed(digits)}%`;
};
export const factorNo = (no: number) => String(no).padStart(2, '0');

/**
 * 表示精度（小数 digits 桁）に丸めた数値。toFixed と同じ丸めなので、fmt1 などで表示した文字列と必ず一致する。
 * −0 は 0 に、非有限値はそのまま返す。digits は 0〜100。
 * 例: roundTo(43.928, 1) = 43.9、roundTo(1.05, 1) = 1.1（1.05 は 2 進で 1.0500…04）、roundTo(-0.04, 1) = 0
 */
export function roundTo(x: number, digits = 1): number {
  if (!Number.isFinite(x)) return x;
  const r = Number(x.toFixed(digits));
  return r === 0 ? 0 : r;
}

/**
 * 表示用の差 a − b。**両方を表示精度に丸めてから引き**、浮動小数の尾（10.399999…）も丸めて消す。
 * 画面に並ぶ 2 つの数値から暗算した差と必ず一致する。
 * 例: displayDelta(43.9286, 33.4761) = 43.9 − 33.5 = 10.4（生の差 10.45 を丸めた 10.5 にはしない）
 */
export function displayDelta(a: number, b: number, digits = 1): number {
  return roundTo(roundTo(a, digits) - roundTo(b, digits), digits);
}

/**
 * 符号付き表示（+10.4 / −3.6 / ±0.0）。負は U+2212「−」。
 * 差の表示は fmtSigned(displayDelta(a, b)) のように、丸めた値どうしの差を渡す。
 */
export function fmtSigned(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return DASH;
  const r = roundTo(v, digits);
  if (r === 0) return `±${(0).toFixed(digits)}`;
  return `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(digits)}`;
}
