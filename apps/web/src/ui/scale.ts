// SVG チャート用の小さなスケール関数。

/** 線形スケール: [d0, d1] → [r0, r1]。clamp=true なら範囲外を端に寄せる。 */
export function linear(d0: number, d1: number, r0: number, r1: number, clamp = false) {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (v: number) => {
    const x = clamp ? Math.max(Math.min(d0, d1), Math.min(Math.max(d0, d1), v)) : v;
    return r0 + (x - d0) * k;
  };
}

/** step 単位で切り上げ（軸の最大値）。0 以下なら step を返す。 */
export function ceilTo(v: number, step: number): number {
  if (!(v > 0)) return step;
  return Math.ceil(v / step) * step;
}

/** 値の大きさに合わせたキリのよい刻み（1, 2, 5 × 10^k）で切り上げ。 */
export function niceCeil(v: number): number {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10]) if (v <= m * p + 1e-9) return m * p;
  return 10 * p;
}
