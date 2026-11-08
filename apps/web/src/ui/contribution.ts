// 要因の寄与（上乗せの内訳）の正しい口径。全画面（ダッシュボード・工数見積り・リスク・レポート）で共用する。
//
// 口径: contribution_i = 名目 × E[CO_i × m_i]（IMPLEMENTATION_BRIEF §2.3）。
// §2.2「確定計算（表・寄与度）は期待値 (best + likely + worst) / 3」に従い、期待値を**解析的に**計算する
// （cobra-core の expectedCO.byFactor × 名目）。
// SimulationResult.contributions は同じ量のモンテカルロ推定（標本平均）で、10,000 回では ±0.5% 程度の乱数誤差がある。
// 例: G3 の「開発者のスキル・経験」は 期待値 1.0492 → 1.0、モンテカルロ 1.0541 → 1.1（四捨五入の境目 1.05 をまたぐ）。
// このため画面に出す寄与は、保存済みの results.contributions ではなく、必ずこの関数で計算する。
import { expectedCO, type Contribution, type Levels, type ModelSpec } from 'cobra-core';
import { roundTo } from './format';

/**
 * 寄与（人月）を期待値で計算する。直接要因だけ、大きい順（同値は要因の並び順）。
 * 戻り値の形は SimulationResult.contributions と同じ（そのまま差し替えられる）。
 * - mm = 名目 × CO_i × m_i（L0 の要因は 0 で含む）
 * - share = mm / Σmm（Σmm = 名目 × E[ΣCO]。0 なら share も 0）
 */
export function factorContributions(spec: ModelSpec, levels: Levels, nominal: number): Contribution[] {
  const { byFactor } = expectedCO(spec, levels);
  const n = Number.isFinite(nominal) ? nominal : 0;
  const rows = spec.factors
    .filter((f) => f.kind === 'direct')
    .map((f, i) => ({ i, factorId: f.id, mm: n * (byFactor[f.id] ?? 0) }));
  const total = rows.reduce((s, r) => s + r.mm, 0);
  return rows
    .sort((a, b) => b.mm - a.mm || a.i - b.i)
    .map(({ factorId, mm }) => ({ factorId, mm, share: total > 0 ? mm / total : 0 }));
}

/** 寄与の合計（= 名目 × E[ΣCO]、確定計算の上乗せ） */
export const contributionTotal = (cs: readonly Pick<Contribution, 'mm'>[]) => cs.reduce((s, c) => s + c.mm, 0);

/**
 * 表示用の寄与の値（小数 digits 桁）。各行を**それぞれ**表示精度に丸める（fmt1 と同じ丸め）。
 * 「その他 N 要因」のようにまとめる行は、丸めた値の和ではなく生の値の和を丸める（mergeRest を使う）。
 * 各行の和は合計の丸めと ±0.1 程度ずれることがある（G3: 行の和 18.6、合計 18.7）。
 * 合計と必ず一致させたい表（合計行のある表）だけ apportion を使う。
 */
export const displayContribution = (mm: number, digits = 1) => roundTo(mm, digits);

/**
 * 上位 top 件 + 「その他」にまとめる。rest は生の値の和（表示時に丸める）。
 * mm ≤ 0 の行（L0 の要因）は除く。
 */
export function topWithRest<T extends Contribution>(cs: readonly T[], top: number): { rows: T[]; rest: { count: number; mm: number; share: number } | null } {
  const pos = cs.filter((c) => c.mm > 0);
  const rows = pos.slice(0, Math.max(0, top));
  const others = pos.slice(Math.max(0, top));
  return {
    rows,
    rest: others.length ? { count: others.length, mm: contributionTotal(others), share: others.reduce((s, c) => s + c.share, 0) } : null,
  };
}

/**
 * 最大剰余法（Hamilton 方式）: 各値を digits 桁に丸め、その和が total（既定は値の和）を digits 桁に丸めた値と一致するように配分する。
 * 切り捨てた後、端数の大きい順に 1 単位ずつ足す（同じ端数なら元の値が大きい方、さらに同じなら先の行）。
 * 各行の誤差は 1 単位（0.1）未満。負の値・非有限値は 0 として扱う。
 * 例: G3 の寄与 [7.722, 4.659, 2.546, 1.847, 1.049, 0.490, 0.406]（和 18.718）→ [7.7, 4.7, 2.5, 1.8, 1.1, 0.5, 0.4]（和 18.7）
 */
export function apportion(values: readonly number[], digits = 1, total?: number): number[] {
  const scale = 10 ** digits;
  const xs = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const sum = xs.reduce((s, v) => s + v, 0);
  const target = total === undefined ? sum : Number.isFinite(total) && total > 0 ? total : 0;
  const units = Math.round(roundTo(target, digits) * scale);
  if (!(sum > 0) || units <= 0) return xs.map(() => 0);
  // 目標の単位数を値の比で配分（total = 和なら quota = 値 × 10^digits）
  const quotas = xs.map((v) => (v / sum) * units);
  const floors = quotas.map((q) => Math.floor(q + 1e-9));
  let left = units - floors.reduce((s, f) => s + f, 0);
  const order = quotas
    .map((q, i) => ({ i, frac: q - floors[i]!, v: xs[i]! }))
    .sort((a, b) => b.frac - a.frac || b.v - a.v || a.i - b.i);
  for (const o of order) {
    if (left <= 0) break;
    floors[o.i]!++;
    left--;
  }
  return floors.map((f) => roundTo(f / scale, digits));
}
