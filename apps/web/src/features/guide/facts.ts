// 解説に載せる「見本の数値」を実データ（現行モデルの版・見本の見積り）から作る純関数。
// 解説の文中に古い数値を書き込まない（構築し直すと食い違うため）。表示用の丸めもここで行う。

/** 精度カードに出す値。MMRE は小数 1 桁 %、PRED(25) は整数 %、内側の件数は round(PRED × n)（レポート画面と同じ丸め） */
export interface AccuracyFacts {
  version: number;
  n: number;
  /** 例 "12.8" */
  mmrePct: string | null;
  /** 例 "82" */
  predPct: string | null;
  /** PRED(25) の内側に入った件数 */
  predHits: number | null;
  /** 不整合として指摘され、除外されている実績 ID */
  excludedInconsistent: string[];
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function accuracyFacts(v: { version: number; n: number; mmre: number | null; pred25: number | null; inconsistencies?: unknown } | null | undefined): AccuracyFacts | null {
  if (!v || !finite(v.version) || !finite(v.n)) return null;
  const n = Math.max(0, Math.round(v.n));
  const mmre = finite(v.mmre) && v.mmre >= 0 ? v.mmre : null;
  const pred = finite(v.pred25) && v.pred25 >= 0 && v.pred25 <= 1 ? v.pred25 : null;
  const inc = Array.isArray(v.inconsistencies) ? v.inconsistencies : [];
  return {
    version: v.version,
    n,
    mmrePct: mmre === null ? null : (mmre * 100).toFixed(1),
    predPct: pred === null ? null : String(Math.round(pred * 100)),
    predHits: pred === null ? null : Math.round(pred * n),
    excludedInconsistent: inc
      .filter((x): x is { projectId: string; excluded?: boolean } => !!x && typeof (x as { projectId?: unknown }).projectId === 'string')
      .filter((x) => x.excluded === true)
      .map((x) => x.projectId),
  };
}

/** 保存済みの結果（generations.results）から読む分 */
export interface StoredResult {
  p50: number;
  scoExpected: number;
  /** P5〜P95 の工数（キーは P 値） */
  pct: { p: number; v: number }[];
}

/** generations.results（JSON）を安全に読む。足りなければ null */
export function readStoredResult(raw: unknown): StoredResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { p50?: unknown; scoExpected?: unknown; pct?: unknown };
  if (!finite(r.p50) || !finite(r.scoExpected) || !r.pct || typeof r.pct !== 'object') return null;
  const pct = Object.entries(r.pct as Record<string, unknown>)
    .map(([k, v]) => ({ p: Number(k), v }))
    .filter((x): x is { p: number; v: number } => Number.isFinite(x.p) && x.p > 0 && x.p < 100 && finite(x.v))
    .sort((a, b) => a.p - b.p);
  if (pct.length < 2) return null;
  return { p50: r.p50, scoExpected: r.scoExpected, pct };
}

/**
 * 工数 x の超過確率がどの範囲にあるか（%）。保存済みの P 値表だけから言える範囲で返す。
 * 例: P50 = 43.9、P60 = 45.6 なら x = 45 は「超過確率 40〜50%」。
 * 補間はしない（標本から求めるリスク画面の値と食い違わないように、確実に言える幅だけを出す）。
 * 表の端より外なら一方だけ（x < P5 → 95% より大きい: {lo: 95, hi: 100}）。
 */
export function exceedBracket(pct: readonly { p: number; v: number }[], x: number): { lo: number; hi: number } | null {
  if (!finite(x) || pct.length === 0) return null;
  const s = [...pct].sort((a, b) => a.p - b.p);
  const first = s[0]!;
  const last = s[s.length - 1]!;
  if (x < first.v) return { lo: 100 - first.p, hi: 100 };
  if (x >= last.v) return { lo: 0, hi: 100 - last.p };
  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i]!;
    const b = s[i + 1]!;
    if (x >= a.v && x < b.v) return { lo: 100 - b.p, hi: 100 - a.p };
  }
  return null;
}

/** 曲線の目盛り: lo〜hi を含むきりのよい間隔（10 人月単位を基本）。lo > hi なら入れ替える */
export function axisTicks(lo: number, hi: number, maxTicks = 5): number[] {
  if (!finite(lo) || !finite(hi)) return [];
  if (lo > hi) [lo, hi] = [hi, lo];
  const span = Math.max(hi - lo, 1e-9);
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  const step = steps.find((st) => Math.floor(hi / st) - Math.ceil(lo / st) + 1 <= maxTicks) ?? Math.ceil(span / maxTicks);
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(Math.round(t * 1e6) / 1e6);
  return out;
}

/** 算定式の初期値（スライダーの単位）: α は 1/10000 人月 / FP、ΣCO は %。範囲外は端に寄せる */
export function formulaStart(alpha: unknown, sizeFP: unknown, scoExpected: unknown): { a: number; size: number; sco: number } | null {
  if (!finite(alpha) || !finite(sizeFP) || !finite(scoExpected)) return null;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return {
    a: clamp(Math.round(alpha * 10000), 150, 300),
    size: clamp(Math.round(sizeFP / 50) * 50, 300, 2400),
    sco: clamp(Math.round(scoExpected * 100), 0, 150),
  };
}
