// cobra-core — CoBRA 法の計算。DOM / Node 依存なし（ブラウザ・Web Worker・Workers で共用）。
// 仕様: IMPLEMENTATION_BRIEF.md §2。

import {
  PERCENTILES,
  type BuildOptions,
  type BuildResult,
  type EstimateInput,
  type ExpertMode,
  type Factor,
  type Histogram,
  type Inconsistency,
  type Lever,
  type Levels,
  type LooPoint,
  type ModelSpec,
  type Percentile,
  type ProjectRecord,
  type SimOptions,
  type SimulationResult,
  type Triangle,
} from './types';

export * from './types';

export const DEFAULT_K = 0.225;
export const DEFAULT_RUNS = 10_000;
export const DEFAULT_SEED = 20261106;
export const INCONSISTENCY_THRESHOLD = 0.25;
export const HISTOGRAM_BINS = 24;

// ---------- 乱数 ----------

/** mulberry32: シード付き PRNG。[0, 1) を返す。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 標準正規分布の逆 CDF（Acklam の有理近似、相対誤差 < 1.2e-9）。u ∈ (0, 1)。
 * 1 試行で乱数を 1 個だけ消費するために Box–Muller ではなくこちらを使う（打ち手比較で系列を揃える）。
 */
export function normalInv(u: number): number {
  const p = Math.min(1 - 1e-12, Math.max(1e-12, u));
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  if (p > 1 - lo) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
}

// ---------- 三角分布 ----------

export function triMean(t: Triangle): number {
  return (t.best + t.likely + t.worst) / 3;
}

/** L3 の三角分布をレベル L に線形内挿: tri_L = tri_L3 × L / 3 */
export function scaleTriangle(t: Triangle, level: number): Triangle {
  const f = clampLevel(level) / 3;
  return { best: t.best * f, likely: t.likely * f, worst: t.worst * f };
}

/** 逆 CDF 法で三角分布から 1 点抽出。u ∈ [0, 1) */
export function sampleTriangle(t: Triangle, u: number): number {
  const { best: a, likely: c, worst: b } = t;
  if (b <= a) return a;
  const fc = (c - a) / (b - a);
  return u < fc ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c));
}

/** 専門家選択に応じた要因の三角分布（L3）。平均は各点の平均。 */
export function resolveTriangle(factor: Factor, mode: ExpertMode): Triangle {
  const ts = factor.triangles;
  if (ts.length === 0) return { best: 0, likely: 0, worst: 0 };
  if (mode.kind === 'expert') {
    const t = ts.find((x) => x.expert === mode.expert);
    if (t) return { best: t.best, likely: t.likely, worst: t.worst };
  }
  const n = ts.length;
  return {
    best: ts.reduce((s, t) => s + t.best, 0) / n,
    likely: ts.reduce((s, t) => s + t.likely, 0) / n,
    worst: ts.reduce((s, t) => s + t.worst, 0) / n,
  };
}

export function clampLevel(l: number | undefined): number {
  if (l === undefined || !Number.isFinite(l)) return 0;
  return Math.max(0, Math.min(3, Math.round(l)));
}

export function levelOf(levels: Levels, factorId: string): number {
  return clampLevel(levels[factorId]);
}

// ---------- CO ----------

export function directFactors(model: ModelSpec): Factor[] {
  return model.factors.filter((f) => f.kind === 'direct');
}

/** 直接要因 ID → 間接要因による倍率 m = 1 + k × L_indirect / 3 */
export function multipliers(model: ModelSpec, levels: Levels): Record<string, number> {
  const m: Record<string, number> = {};
  for (const f of model.factors) {
    if (f.kind !== 'indirect' || !f.targetFactorId) continue;
    m[f.targetFactorId] = 1 + model.k * (levelOf(levels, f.id) / 3);
  }
  return m;
}

/** 確定計算（期待値）: 直接要因ごとの CO_i × m_i と ΣCO */
export function expectedCO(model: ModelSpec, levels: Levels): { byFactor: Record<string, number>; sco: number } {
  const m = multipliers(model, levels);
  const byFactor: Record<string, number> = {};
  let sco = 0;
  for (const f of directFactors(model)) {
    const tri = scaleTriangle(resolveTriangle(f, model.expertMode), levelOf(levels, f.id));
    const v = triMean(tri) * (m[f.id] ?? 1);
    byFactor[f.id] = v;
    sco += v;
  }
  return { byFactor, sco };
}

// ---------- 分位点・超過確率 ----------

/** 昇順配列の分位点（線形補間）。p ∈ [0, 1] */
export function quantile(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const h = (n - 1) * Math.max(0, Math.min(1, p));
  const lo = Math.floor(h);
  const hi = Math.min(n - 1, lo + 1);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (h - lo);
}

/** P(effort > x)。昇順配列に対して二分探索。 */
export function exceedance(sorted: ArrayLike<number>, x: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid]! <= x) lo = mid + 1;
    else hi = mid;
  }
  return (n - lo) / n;
}

/** 超過確率 p となる工数（例: p = 0.2 → P80） */
export function effortAtExceedance(sorted: ArrayLike<number>, p: number): number {
  return quantile(sorted, 1 - p);
}

export function histogram(sorted: ArrayLike<number>, bins = HISTOGRAM_BINS): Histogram {
  const n = sorted.length;
  const lo = n ? sorted[0]! : 0;
  const hi = n ? sorted[n - 1]! : 0;
  const width = (hi - lo) / bins || 1;
  const counts = new Array<number>(bins).fill(0);
  for (let i = 0; i < n; i++) {
    const b = Math.min(bins - 1, Math.floor((sorted[i]! - lo) / width));
    counts[b]!++;
  }
  return { lo, hi, width, counts };
}

// ---------- モンテカルロ見積り ----------

/**
 * effort_r = α × 規模 × (1 + ΣCO_r) × exp(σ × z_r)。
 * ΣCO_r は各直接要因の三角分布から抽出（§2.2）。σ > 0 のとき、モデル誤差 z_r ~ N(0,1) を掛ける（§2.3）。
 * exp(σz) の中央値は 1 なので、P50 ≈ α × 規模 × (1 + E[ΣCO]) は σ に依らない。
 */
export function simulate(model: ModelSpec, input: EstimateInput, opts: SimOptions): SimulationResult {
  const runs = Math.max(1, Math.floor(opts.runs));
  const rand = mulberry32(opts.seed);
  const nominal = input.alpha * input.sizeFP;
  const sigma = input.sigma !== undefined && Number.isFinite(input.sigma) && input.sigma > 0 ? input.sigma : 0;
  const m = multipliers(model, input.levels);
  const items = directFactors(model).map((f) => ({
    id: f.id,
    tri: scaleTriangle(resolveTriangle(f, model.expertMode), levelOf(input.levels, f.id)),
    m: m[f.id] ?? 1,
  }));
  const sums = new Float64Array(items.length);
  const samples = new Float64Array(runs);
  const chunk = Math.max(1, Math.floor(runs / 20));

  for (let r = 0; r < runs; r++) {
    let sco = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      // L0 でも乱数は消費して、レベル変更時に他要因の系列がずれないようにする
      const u = rand();
      const v = sampleTriangle(it.tri, u) * it.m;
      sums[i]! += v;
      sco += v;
    }
    // モデル誤差: 要因の乱数の後に 1 個だけ消費する（σ = 0 なら消費しない = 従来の系列と同じ）
    samples[r] = sigma > 0 ? nominal * (1 + sco) * Math.exp(sigma * normalInv(rand())) : nominal * (1 + sco);
    if (opts.onProgress && (r + 1) % chunk === 0) opts.onProgress((r + 1) / runs);
  }
  samples.sort();

  const pct = {} as Record<Percentile, number>;
  for (const p of PERCENTILES) pct[p] = quantile(samples, p / 100);
  let total = 0;
  for (let i = 0; i < samples.length; i++) total += samples[i]!;
  const mean = total / runs;

  const contribRaw = items.map((it, i) => ({ factorId: it.id, mm: (nominal * sums[i]!) / runs }));
  const overheadMean = contribRaw.reduce((s, c) => s + c.mm, 0);
  const contributions = contribRaw
    .map((c) => ({ ...c, share: overheadMean > 0 ? c.mm / overheadMean : 0 }))
    .sort((a, b) => b.mm - a.mm);

  opts.onProgress?.(1);
  const p50 = pct[50];
  return {
    runs,
    seed: opts.seed,
    nominal,
    scoExpected: expectedCO(model, input.levels).sco,
    p50,
    mean,
    overhead: p50 - nominal,
    pct,
    histogram: histogram(samples),
    contributions,
    samples,
  };
}

// ---------- モデル構築（α 推定・交差検証） ----------

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN;
}

/** α_j = effort_j / (size_j × (1 + ΣCO_j))（ΣCO は期待値） */
export function projectAlpha(model: ModelSpec, p: ProjectRecord): number {
  return p.effortMM / (p.sizeFP * (1 + expectedCO(model, p.levels).sco));
}

/** gap = α_j / α − 1。|gap| > 0.25 で不整合（§2.4）。実績の編集画面の偏差表示にも使う。 */
export function projectGap(model: ModelSpec, alpha: number, p: ProjectRecord): number {
  return projectAlpha(model, p) / alpha - 1;
}

export function isInconsistent(gap: number): boolean {
  return Math.abs(gap) > INCONSISTENCY_THRESHOLD;
}

/**
 * 予測のモデル誤差 σ = sqrt(mean(ln(actual_j / predicted_j)²))（LOO 残差の対数 RMS）。
 * 保存済みの ModelVersion.loo からも同じ値を再計算できる。
 */
export function predictiveSigma(loo: Pick<LooPoint, 'actual' | 'predicted'>[]): number {
  const xs = loo.filter((l) => l.actual > 0 && l.predicted > 0).map((l) => Math.log(l.actual / l.predicted) ** 2);
  return xs.length ? Math.sqrt(mean(xs)) : 0;
}

/**
 * α = mean(α_j), α_j = effort_j / (size_j × (1 + ΣCO_j))（ΣCO は期待値）。
 * 95% CI はブートストラップ（runs 回の再標本の平均の 2.5 / 97.5 パーセンタイル）。
 * σ（予測のモデル誤差）は LOO 残差の対数 RMS。
 */
export function buildModel(model: ModelSpec, projects: ProjectRecord[], opts: BuildOptions): BuildResult {
  const n = projects.length;
  if (n < 2) throw new Error('α の推定には 2 件以上の実績が必要です');
  const report = opts.onProgress;

  // 1. α 推定
  const alphas = projects.map((p, j) => {
    const sco = expectedCO(model, p.levels).sco;
    report?.('alpha', j + 1, n);
    return { projectId: p.id, sco, alpha: p.effortMM / (p.sizeFP * (1 + sco)) };
  });
  const alpha = mean(alphas.map((a) => a.alpha));

  // 2. ブートストラップ
  const runs = Math.max(1, Math.floor(opts.runs));
  const rand = mulberry32(opts.seed);
  const boots = new Float64Array(runs);
  const chunk = Math.max(1, Math.floor(runs / 20));
  for (let r = 0; r < runs; r++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += alphas[Math.floor(rand() * n)]!.alpha;
    boots[r] = s / n;
    if (report && (r + 1) % chunk === 0) report('montecarlo', r + 1, runs);
  }
  boots.sort();
  const ci95: [number, number] = [quantile(boots, 0.025), quantile(boots, 0.975)];

  // 3. 1 件抜き交差検証
  const sumAlpha = alphas.reduce((s, a) => s + a.alpha, 0);
  const loo = projects.map((p, j) => {
    const a = alphas[j]!;
    const alphaMinus = (sumAlpha - a.alpha) / (n - 1);
    const predicted = alphaMinus * p.sizeFP * (1 + a.sco);
    const error = (predicted - p.effortMM) / p.effortMM;
    report?.('loo', j + 1, n);
    return { projectId: p.id, actual: p.effortMM, predicted, error, mre: Math.abs(error) };
  });
  const mmre = mean(loo.map((l) => l.mre));
  const pred25 = loo.filter((l) => l.mre <= 0.25).length / n;

  const inconsistencies: Inconsistency[] = alphas
    .map((a) => ({ projectId: a.projectId, gap: a.alpha / alpha - 1 }))
    .filter((x) => isInconsistent(x.gap));
  for (const p of opts.excluded ?? []) {
    const gap = projectGap(model, alpha, p);
    if (isInconsistent(gap)) inconsistencies.push({ projectId: p.id, gap, excluded: true });
  }

  return { n, alpha, ci95, alphas, loo, mmre, pred25, inconsistencies, sigma: predictiveSigma(loo) };
}

// ---------- 効く打ち手 ----------

/** L ≥ 1 の直接要因を 1 段下げたときの P50 差と予算超過確率。削減の大きい順に top 件。 */
export function levers(
  model: ModelSpec,
  input: EstimateInput,
  opts: SimOptions & { budget?: number; top?: number },
): Lever[] {
  const base = simulate(model, input, { runs: opts.runs, seed: opts.seed });
  const out: Lever[] = [];
  for (const f of directFactors(model)) {
    const l = levelOf(input.levels, f.id);
    if (l < 1) continue;
    const r = simulate(model, { ...input, levels: { ...input.levels, [f.id]: l - 1 } }, { runs: opts.runs, seed: opts.seed });
    out.push({
      factorId: f.id,
      fromLevel: l,
      toLevel: l - 1,
      p50: r.p50,
      deltaP50: r.p50 - base.p50,
      exceedance: opts.budget === undefined ? null : exceedance(r.samples, opts.budget),
    });
  }
  return out.sort((a, b) => a.deltaP50 - b.deltaP50).slice(0, opts.top ?? 3);
}

// ---------- 単位換算 ----------

export interface UnitFactors {
  fpPerKloc: number;
  fpPerScreen: number;
  hoursPerMM: number;
}

export const DEFAULT_UNITS: UnitFactors = { fpPerKloc: 100, fpPerScreen: 30, hoursPerMM: 160 };

export function toFP(value: number, unit: 'FP' | 'KLOC' | 'screen', u: UnitFactors = DEFAULT_UNITS): number {
  return unit === 'FP' ? value : unit === 'KLOC' ? value * u.fpPerKloc : value * u.fpPerScreen;
}

export function toMM(value: number, unit: 'MM' | 'hours', u: UnitFactors = DEFAULT_UNITS): number {
  return unit === 'MM' ? value : value / u.hoursPerMM;
}
