// 実績データ一覧の集計・並べ替え（表示用の純粋関数）。数値の意味は以前の ProjectData.tsx と同じ。
import { ceilTo } from '../../ui/scale';
import type { ProjectStat } from './calc';

export interface ProdSummary {
  n: number;
  /** 採用分の生産性（工数 / 規模）の単純平均 */
  avg: number;
  min: number;
  max: number;
}

/** 採用分の生産性の平均・範囲。0 件なら null（0 や NaN を出さない） */
export function prodSummary(used: ProjectStat[]): ProdSummary | null {
  const xs = used.map((s) => s.prod).filter((v) => Number.isFinite(v));
  if (xs.length === 0) return null;
  return { n: xs.length, avg: xs.reduce((a, v) => a + v, 0) / xs.length, min: Math.min(...xs), max: Math.max(...xs) };
}

export interface SizeBins {
  /** 軸の最大（500 FP 単位で切り上げ。実績が無ければ 2,000） */
  xMax: number;
  /** 採用分の件数（ビンごと） */
  bins: number[];
  /** 見積り対象が入るビン。軸の範囲外・未指定なら -1 */
  estBin: number;
  /** 見積り対象が採用分の規模の範囲（最小〜最大）に入るか。採用 0 件・未指定なら null */
  estInRange: boolean | null;
}

/**
 * 規模の分布（採用分）。軸の最大はグループ内の全実績（除外も含む）の最大規模から決める。
 * 見積り対象が軸の外（xMax 超）のときはどのビンも強調しない（端のビンに寄せない）。
 */
export function sizeBins(allSizes: number[], usedSizes: number[], estSize: number | null, nBins = 6): SizeBins {
  const maxSize = Math.max(0, ...allSizes.filter(Number.isFinite));
  // ceilTo(0) は 500 を返すので、実績が無いときは明示的に既定の 2,000 にする
  const xMax = maxSize > 0 ? ceilTo(maxSize, 500) : 2000;
  const bins = new Array<number>(nBins).fill(0);
  const binOf = (v: number) => Math.min(nBins - 1, Math.floor((v / xMax) * nBins));
  for (const s of usedSizes) if (Number.isFinite(s) && s >= 0) bins[binOf(s)]!++;
  const okEst = estSize !== null && Number.isFinite(estSize) && estSize >= 0;
  const estBin = okEst && estSize <= xMax ? binOf(estSize) : -1;
  const used = usedSizes.filter(Number.isFinite);
  const estInRange = okEst && used.length > 0 ? estSize >= Math.min(...used) && estSize <= Math.max(...used) : null;
  return { xMax, bins, estBin, estInRange };
}

export type SortKey = 'id' | 'name' | 'group' | 'size' | 'effort' | 'prod';
export type SortDir = 'asc' | 'desc';

const VALUE: Record<SortKey, (s: ProjectStat) => string | number> = {
  id: (s) => s.row.id,
  name: (s) => s.row.name,
  group: (s) => s.row.groupId,
  size: (s) => s.row.sizeFP,
  effort: (s) => s.row.effortMM,
  prod: (s) => s.prod,
};

const collator = new Intl.Collator('ja', { numeric: true, sensitivity: 'base' });

/**
 * 安定ソート（同値は元の並び＝ID 順を保つ）。数値列は数値で比較し、NaN は常に末尾。
 * 文字列列は日本語ロケール・数字は数値として比較（PJ-2 < PJ-10）。
 */
export function sortStats(stats: ProjectStat[], key: SortKey, dir: SortDir): ProjectStat[] {
  const get = VALUE[key];
  const sign = dir === 'asc' ? 1 : -1;
  return stats
    .map((s, i) => ({ s, i, v: get(s) }))
    .sort((a, b) => {
      let c: number;
      if (typeof a.v === 'number' && typeof b.v === 'number') {
        const an = Number.isNaN(a.v), bn = Number.isNaN(b.v);
        if (an || bn) return an === bn ? a.i - b.i : an ? 1 : -1;
        c = (a.v - b.v) * sign;
      } else {
        c = collator.compare(String(a.v), String(b.v)) * sign;
      }
      return c !== 0 ? c : a.i - b.i;
    })
    .map((x) => x.s);
}

/** 列見出しを押したときの次の並び。同じ列なら昇順 ⇄ 降順、別の列は数値列なら降順から */
export function nextSort(cur: { key: SortKey; dir: SortDir } | null, key: SortKey): { key: SortKey; dir: SortDir } {
  if (cur?.key === key) return { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: key === 'size' || key === 'effort' || key === 'prod' ? 'desc' : 'asc' };
}
