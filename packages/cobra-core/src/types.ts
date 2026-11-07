// CoBRA 法のドメイン型。UI・API・計算で共通に使う。
// 単位: 規模は FP、工数は人月。CO は割合（0.26 = +26%）。

/** 変動要因のレベル L0〜L3 */
export type Level = 0 | 1 | 2 | 3;

/** 要因 ID → レベル。キーが無い要因は L0 とみなす。 */
export type Levels = Record<string, number>;

/** 三角分布（L3 のときの工数増加率） */
export interface Triangle {
  best: number;
  likely: number;
  worst: number;
}

/** 専門家（担当者）ごとの三角分布 */
export interface ExpertTriangle extends Triangle {
  expert: string;
}

export type FactorKind = 'direct' | 'indirect';

export interface Factor {
  id: string;
  /** 表示番号 01, 02 … */
  no: number;
  name: string;
  category: string;
  kind: FactorKind;
  /** kind = indirect のとき、強める直接要因の ID */
  targetFactorId?: string | null;
  definition: string;
  /** L0〜L3 の定義文 */
  levels: [string, string, string, string];
  origin: 'standard' | 'custom';
  triangles: ExpertTriangle[];
}

export type ExpertMode = { kind: 'average' } | { kind: 'expert'; expert: string };

/** 計算に必要なモデル定義 */
export interface ModelSpec {
  factors: Factor[];
  /** 間接要因の倍率係数: m = 1 + k × L/3 */
  k: number;
  expertMode: ExpertMode;
}

/** 実績 1 件（α 推定の入力） */
export interface ProjectRecord {
  id: string;
  sizeFP: number;
  effortMM: number;
  levels: Levels;
}

export interface EstimateInput {
  /** 人月 / FP */
  alpha: number;
  sizeFP: number;
  levels: Levels;
  /**
   * モデル誤差（対数スケールの標準偏差）。各試行で工数に exp(σ·z), z ~ N(0,1) を掛ける。
   * 構築結果の `BuildResult.sigma`（= `predictiveSigma(loo)`）を渡す。未指定・0 なら CO のばらつきだけ。
   */
  sigma?: number;
}

export interface SimOptions {
  /** 試行回数（既定 10,000） */
  runs: number;
  /** 乱数シード（同じシード・同じ入力 → 同じ結果） */
  seed: number;
  /** 0〜1 の進捗 */
  onProgress?: (fraction: number) => void;
}

export const PERCENTILES = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95] as const;
export type Percentile = (typeof PERCENTILES)[number];

export interface Contribution {
  factorId: string;
  /** 寄与（人月）= nominal × E[CO_i × m_i] */
  mm: number;
  /** 上乗せ全体に対する割合 0〜1 */
  share: number;
}

export interface Histogram {
  lo: number;
  hi: number;
  width: number;
  counts: number[];
}

export interface SimulationResult {
  runs: number;
  seed: number;
  /** α × 規模 */
  nominal: number;
  /** ΣCO の期待値（確定計算） */
  scoExpected: number;
  /** 推定値 = P50 */
  p50: number;
  mean: number;
  /** 上乗せ = P50 − 名目 */
  overhead: number;
  pct: Record<Percentile, number>;
  histogram: Histogram;
  /** 寄与の大きい順 */
  contributions: Contribution[];
  /** 昇順に並べた工数サンプル（超過確率の計算用） */
  samples: Float64Array;
}

export interface AlphaPoint {
  projectId: string;
  sco: number;
  alpha: number;
}

export interface LooPoint {
  projectId: string;
  actual: number;
  predicted: number;
  /** 符号付き誤差 (予測 − 実績) / 実績 */
  error: number;
  /** |error| */
  mre: number;
}

export interface Inconsistency {
  projectId: string;
  /** α_j / α − 1 */
  gap: number;
  /** 不採用（除外中）の実績に対する判定なら true（`BuildOptions.excluded` から） */
  excluded?: boolean;
}

export type BuildStage = 'alpha' | 'montecarlo' | 'loo';

export interface BuildOptions {
  /** ブートストラップの再標本数 */
  runs: number;
  seed: number;
  onProgress?: (stage: BuildStage, done: number, total: number) => void;
  /** 不採用の実績。α 推定には使わず、不整合の判定だけ行う（結果は excluded: true） */
  excluded?: ProjectRecord[];
}

export interface BuildResult {
  n: number;
  alpha: number;
  ci95: [number, number];
  alphas: AlphaPoint[];
  loo: LooPoint[];
  mmre: number;
  pred25: number;
  inconsistencies: Inconsistency[];
  /** 予測のモデル誤差 σ（LOO 残差の対数 RMS）。見積りの `EstimateInput.sigma` に渡す。buildModel は常に設定する */
  sigma?: number;
}

export interface Lever {
  factorId: string;
  fromLevel: number;
  toLevel: number;
  p50: number;
  /** 新しい P50 − 現在の P50（負なら削減） */
  deltaP50: number;
  /** 予算超過確率（予算指定時） */
  exceedance: number | null;
}
