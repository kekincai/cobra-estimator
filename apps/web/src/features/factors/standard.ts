// CoBRA 標準データ v2.1 の変動要因カタログ（design/FactorNew.dc.html の 14 要因）。
// tri は L3 のときの工数増加率（%）。モデルに入れるときは担当者「標準」の三角分布になる。
// modelCategory はモデル側の分類（プロダクト / 人 / プロセス）に合わせた値。

export interface StandardFactor {
  key: string;
  name: string;
  /** カタログ上の分類 */
  cat: '要件' | '人・体制' | '技術' | 'スケジュール';
  modelCategory: string;
  kind: 'direct' | 'indirect';
  def: string;
  levels: [string, string, string, string];
  tri: [number, number, number];
}

export const STANDARD_VERSION = 'v2.1';
export const STANDARD_EXPERT = '標準';
export const STANDARD_CATEGORIES = ['要件', '人・体制', '技術', 'スケジュール'] as const;

export const STANDARD_FACTORS: StandardFactor[] = [
  { key: 'req-stability', name: '要件の安定性', cat: '要件', modelCategory: 'プロダクト', kind: 'direct', def: 'プロジェクト期間中に要件がどの程度変更・追加されるか。', levels: ['要件が確定しており、変更はほぼない', '軽微な変更が数回ある', '設計に影響する変更が繰り返し発生する', '要件が未確定のまま開発が進む'], tri: [20, 40, 100] },
  { key: 'customer-involvement', name: '顧客の関与度', cat: '要件', modelCategory: 'プロダクト', kind: 'indirect', def: '顧客側の意思決定者がレビューや確認にどの程度関与するか。', levels: ['常時参加し即日回答', '週次で確認できる', '確認に数週間かかる', 'ほぼ関与がない'], tri: [5, 30, 60] },
  { key: 'doc-requirements', name: 'ドキュメント要求の厳しさ', cat: '要件', modelCategory: 'プロダクト', kind: 'direct', def: '顧客が求める設計書・手順書の分量と承認の厳しさ。', levels: ['最小限の文書で可', '標準的な設計書一式', '承認付きの詳細設計書', '監査対応レベルの文書と履歴'], tri: [5, 20, 55] },
  { key: 'quality', name: '品質要求の高さ', cat: '要件', modelCategory: 'プロダクト', kind: 'direct', def: '可用性・性能・セキュリティなど非機能要件の厳しさ。', levels: ['社内ツール相当', '一般的な業務システム', '基幹系・停止影響大', '人命・金融など厳格な基準'], tri: [10, 35, 90] },
  { key: 'skill', name: '開発者のスキル・経験', cat: '人・体制', modelCategory: '人', kind: 'direct', def: '同種のシステム・技術に対するチームの経験の深さ。', levels: ['主要メンバー全員が経験者', '半数が経験者', '経験者が少数', 'ほぼ全員が未経験'], tri: [10, 25, 80] },
  { key: 'communication', name: 'チーム間のコミュニケーション', cat: '人・体制', modelCategory: '人', kind: 'direct', def: '拠点・会社をまたぐ連絡や調整の負荷。', levels: ['同一拠点・同一会社', '複数拠点だが同一会社', '複数会社が関与', '海外拠点やオフショアを含む'], tri: [5, 15, 50] },
  { key: 'turnover', name: 'メンバーの入れ替わり', cat: '人・体制', modelCategory: '人', kind: 'direct', def: '期間中に主要メンバーが交代する見込み。', levels: ['交代なし', '補助メンバーの交代のみ', '主要メンバー 1 名が交代', '複数の主要メンバーが交代'], tri: [5, 20, 60] },
  { key: 'pm-experience', name: 'PM の経験', cat: '人・体制', modelCategory: '人', kind: 'indirect', def: '同規模プロジェクトを率いた経験。要因間の影響を増幅・緩和する。', levels: ['同規模を複数回', '同規模を 1 回', '小規模のみ', 'PM 経験なし'], tri: [0, 15, 40] },
  { key: 'process', name: '開発プロセスの成熟度', cat: '人・体制', modelCategory: 'プロセス', kind: 'direct', def: 'レビュー・テスト・構成管理などが定着しているか。', levels: ['標準プロセスが定着', '概ね定着', '一部が属人的', 'プロセスが未整備'], tri: [5, 20, 60] },
  { key: 'new-tech', name: '新規技術の割合', cat: '技術', modelCategory: 'プロダクト', kind: 'direct', def: '組織として初めて採用する言語・基盤・サービスの比率。', levels: ['既存技術のみ', '一部に新技術', '主要部分が新技術', '基盤から全て新技術'], tri: [10, 30, 90] },
  { key: 'integrations', name: '外部システム連携数', cat: '技術', modelCategory: 'プロダクト', kind: 'direct', def: '仕様調整が必要な外部システム・API の数。', levels: ['連携なし', '1〜2 システム', '3〜5 システム', '6 以上、または仕様が未確定'], tri: [10, 30, 85] },
  { key: 'legacy', name: '既存システムの複雑さ', cat: '技術', modelCategory: 'プロダクト', kind: 'direct', def: '改修対象となる既存コードの規模と可読性。', levels: ['新規開発', '整理された既存コード', '文書の乏しい既存コード', 'ブラックボックス化した既存コード'], tri: [10, 35, 100] },
  { key: 'tooling', name: '開発環境・ツールの整備', cat: '技術', modelCategory: 'プロセス', kind: 'direct', def: 'CI、テスト環境、検証データの準備状況。', levels: ['すべて整備済', '一部を整備が必要', '多くを整備が必要', 'ゼロから構築'], tri: [0, 15, 45] },
  { key: 'deadline', name: '納期の厳しさ', cat: 'スケジュール', modelCategory: 'プロセス', kind: 'direct', def: '適正工期に対する実際の納期の圧縮度合い。', levels: ['適正工期', '1 割程度の圧縮', '2〜3 割の圧縮', '4 割以上の圧縮'], tri: [5, 25, 70] },
];
