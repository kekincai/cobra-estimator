// P 値（パーセンタイル）の表記を全画面で揃える。
// 主表記は「超過確率」（その工数を超える確率）、P 値は補助として併記する。
//   P80 → 「超過確率 20%」／併記「超過確率 20%・P80」
//   P50 → 「中央値（超過確率 50%）」

/** P 値 → 超過確率（%）。P80 → 20 */
export const exceedPct = (p: number) => Math.round(100 - p);

/** 「超過確率 20%」 */
export const exceedLabel = (p: number) => `超過確率 ${exceedPct(p)}%`;

/** 「超過確率 20%・P80」— 主表記 + P 値の補助 */
export const exceedWithP = (p: number) => `${exceedLabel(p)}・P${p}`;

/** 初出に置く一行説明 */
export const EXCEED_NOTE = '超過確率 = 実際の工数がこの値を超える確率。P80（超過確率 20%）なら 5 回に 4 回はこの工数に収まります。';
