// 示例 seed（IMPLEMENTATION_BRIEF.md §6）。DB seed とユニットテストで共用。
// 注意: 実績のレベル値は §6 の「ΣCO から逆算して合理的な値」の仮置き。
//       α = 0.0210 / MMRE 18.4% / PRED(25) 75% に合わせた調整は cobra-core の担当タスクで行う。

import { DEFAULT_K, type Factor, type ModelSpec, type ProjectRecord } from './index';

const L = (a: string, b: string, c: string, d: string): [string, string, string, string] => [a, b, c, d];
const tri = (st: [number, number, number], yt: [number, number, number]) => [
  { expert: 'S.T.', best: st[0], likely: st[1], worst: st[2] },
  { expert: 'Y.T.', best: yt[0], likely: yt[1], worst: yt[2] },
];

export const SEED_EXPERTS = ['S.T.', 'Y.T.'] as const;

export const SEED_FACTORS: Factor[] = [
  { id: 'F01', no: 1, name: '要件の安定性', category: 'プロダクト', kind: 'direct', definition: '着手時点で要件がどの程度確定しているか', levels: L('着手時に確定', '一部に変更の余地', '主要機能に未確定あり', '3 割以上が未確定'), origin: 'standard', triangles: tri([0.18, 0.26, 0.4], [0.15, 0.25, 0.36]) },
  { id: 'F02', no: 2, name: '顧客の関与度', category: 'プロダクト', kind: 'indirect', targetFactorId: 'F01', definition: '顧客の確認・意思決定の速さ', levels: L('即日で確認', '数日で確認', '数週間を要する', '意思決定者が不在'), origin: 'standard', triangles: tri([0.1, 0.2, 0.3], [0.12, 0.18, 0.28]) },
  { id: 'F03', no: 3, name: '開発者のスキル・経験', category: '人', kind: 'direct', definition: '同種システム・技術の経験者の割合', levels: L('全員が経験者', '半数が経験者', '一部に経験者', '経験者ほぼなし'), origin: 'standard', triangles: tri([0.06, 0.12, 0.22], [0.05, 0.1, 0.2]) },
  { id: 'F04', no: 4, name: 'チーム間のコミュニケーション', category: '人', kind: 'direct', definition: '関係する会社・拠点の数と距離', levels: L('1 社・1 拠点', '2 社', '3 社以上', '海外拠点を含む'), origin: 'standard', triangles: tri([0.05, 0.11, 0.18], [0.06, 0.1, 0.16]) },
  { id: 'F05', no: 5, name: '新規技術の割合', category: 'プロダクト', kind: 'direct', definition: '初めて使う技術・製品の範囲', levels: L('なし', '周辺に新規', '基盤に新規', '大半が新規'), origin: 'standard', triangles: tri([0.08, 0.15, 0.25], [0.07, 0.14, 0.22]) },
  { id: 'F06', no: 6, name: '外部システム連携数', category: 'プロダクト', kind: 'direct', definition: '連携する外部システムの数と仕様の確定度', levels: L('なし', '1〜2', '3〜5', '6 以上 / 仕様未確定'), origin: 'standard', triangles: tri([0.1, 0.18, 0.3], [0.09, 0.17, 0.27]) },
  { id: 'F07', no: 7, name: '開発プロセスの成熟度', category: 'プロセス', kind: 'direct', definition: '組織標準プロセスからの逸脱度', levels: L('標準どおり', '概ね標準', '一部逸脱', '独自プロセス'), origin: 'standard', triangles: tri([0.02, 0.06, 0.1], [0.03, 0.05, 0.09]) },
  { id: 'F08', no: 8, name: '納期の厳しさ', category: 'プロセス', kind: 'direct', definition: '標準工期に対する圧縮率', levels: L('妥当', '1 割圧縮', '2 割圧縮', '3 割以上圧縮'), origin: 'standard', triangles: tri([0.02, 0.05, 0.09], [0.01, 0.04, 0.08]) },
];

export const SEED_MODEL: ModelSpec = { factors: SEED_FACTORS, k: DEFAULT_K, expertMode: { kind: 'average' } };

const lv = (a: number[]) => Object.fromEntries(a.map((v, i) => [`F0${i + 1}`, v]));

export interface SeedProject extends ProjectRecord {
  name: string;
  groupId: string;
  note: string;
  adopted: boolean;
  excludedReason: string | null;
}

export const SEED_PROJECTS: SeedProject[] = [
  { id: 'PJ-001', name: '予約受付 スマホ対応', sizeFP: 420, effortMM: 8.2, levels: lv([0, 0, 0, 0, 1, 0, 0, 0]) },
  { id: 'PJ-002', name: '採用管理 SaaS 連携', sizeFP: 560, effortMM: 12.9, levels: lv([1, 1, 0, 1, 1, 2, 0, 0]) },
  { id: 'PJ-003', name: '勤怠管理 クラウド移行', sizeFP: 680, effortMM: 13.1, levels: lv([0, 0, 1, 0, 1, 0, 0, 0]) },
  { id: 'PJ-004', name: '販売分析ダッシュボード', sizeFP: 760, effortMM: 17.8, levels: lv([1, 1, 2, 0, 2, 1, 0, 0]) },
  { id: 'PJ-005', name: '在庫照会 API', sizeFP: 900, effortMM: 21.5, levels: lv([1, 1, 1, 1, 1, 2, 0, 0]) },
  { id: 'PJ-006', name: '契約書ワークフロー', sizeFP: 980, effortMM: 19.4, levels: lv([1, 0, 1, 0, 1, 1, 0, 1]) },
  { id: 'PJ-007', name: '物流追跡 API 基盤', sizeFP: 1100, effortMM: 26.9, levels: lv([0, 0, 1, 0, 1, 0, 0, 0]), note: 'ΣCO が低いのに工数が多い — レベル値を再確認', adopted: false, excludedReason: 'ΣCO と生産性の不整合' },
  { id: 'PJ-008', name: '会員サイト リニューアル', sizeFP: 1250, effortMM: 31.2, levels: lv([1, 0, 1, 1, 1, 0, 0, 1]) },
  { id: 'PJ-009', name: '社内ポータル刷新', sizeFP: 1400, effortMM: 29.1, levels: lv([2, 1, 1, 2, 1, 1, 1, 1]) },
  { id: 'PJ-010', name: '請求書電子化 (法対応)', sizeFP: 1620, effortMM: 41.3, levels: lv([3, 2, 1, 1, 2, 1, 1, 0]), note: '法改正で要件が流動' },
  { id: 'PJ-011', name: '経費精算 モバイル', sizeFP: 1880, effortMM: 46.8, levels: lv([0, 0, 1, 0, 2, 0, 0, 0]) },
  { id: 'PJ-012', name: '受発注システム更改', sizeFP: 2150, effortMM: 55.2, levels: lv([2, 1, 1, 0, 2, 1, 0, 1]), note: 'サブシステム3本' },
].map((p) => ({ groupId: 'A', note: '', adopted: true, excludedReason: null, ...p }));

/** §6 の示例見積り G3 */
export const SEED_G3 = {
  name: '顧客ポータル刷新 — 案B (外部連携あり)',
  sizeFP: 1200,
  levels: lv([3, 2, 1, 2, 2, 3, 1, 1]),
  budget: 45,
  /** 期待値（テストの目標、±1%） */
  expected: { sco: 0.68, nominal: 25.2, overhead: 17.1, p50: 42.3, p80: 49.1, p5: 31.4, p95: 56.9, exceedAtBudget: 0.34 },
} as const;

export const SEED_VERSIONS = [
  { version: 1, expert: 'S.T.', alpha: 0.0232, mmre: 0.241, builtAt: '2026-10-14', n: 9, active: false },
  { version: 2, expert: 'Y.T.', alpha: 0.0198, mmre: 0.198, builtAt: '2026-10-28', n: 11, active: false },
  { version: 3, expert: '平均', alpha: 0.021, mmre: 0.184, pred25: 0.75, ci95: [0.0186, 0.0237] as [number, number], builtAt: '2026-11-05', n: 11, active: true },
] as const;
