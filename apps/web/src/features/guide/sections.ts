/**
 * 解説ページ（/guide）の節 ID。各画面の「?」ボタンはここから `/guide#<id>` へリンクする。
 * ID は URL に残るので変更しないこと（追加は可）。
 *
 * | ID         | No | 節                    | 主にリンクする画面                    |
 * |------------|----|-----------------------|---------------------------------------|
 * | about      | 01 | CoBRA 法とは          | ダッシュボード                        |
 * | formula    | 02 | 工数算定式            | 工数見積り（名目・上乗せ）、レポート  |
 * | factors    | 03 | 変動要因と三角分布    | 変動要因、要因を追加、要因関係図      |
 * | build      | 04 | モデル構築と精度      | モデル構築、実績データ、実績の編集    |
 * | estimate   | 05 | 見積りと世代          | 工数見積り、シミュレーション設定      |
 * | risk       | 06 | リスクアセスメント    | リスク                                |
 * | usage      | 07 | このツールの使い方    | 取り込み / 書き出し、業務フロー       |
 * | glossary   | 08 | 用語集                | どこからでも                          |
 *
 * 使い方: `import { guideHref } from '../features/guide/sections'` → `<Link to={guideHref('risk')}>?</Link>`
 * または `ui/HelpLink` の `<HelpLink section="risk" />`。
 */
export const GUIDE_SECTIONS = [
  { id: 'about', no: '01', kicker: '概要', title: 'CoBRA 法とは' },
  { id: 'formula', no: '02', kicker: '数式', title: '工数算定式' },
  { id: 'factors', no: '03', kicker: '要因', title: '変動要因と三角分布' },
  { id: 'build', no: '04', kicker: '構築', title: 'モデル構築と精度' },
  { id: 'estimate', no: '05', kicker: '見積り', title: '見積りと世代' },
  { id: 'risk', no: '06', kicker: 'リスク', title: 'リスクアセスメント' },
  { id: 'usage', no: '07', kicker: '使い方', title: 'このツールの使い方' },
  { id: 'glossary', no: '08', kicker: '用語', title: '用語集' },
] as const;

export type GuideSectionId = (typeof GUIDE_SECTIONS)[number]['id'];

export const isGuideSectionId = (v: string): v is GuideSectionId => GUIDE_SECTIONS.some((s) => s.id === v);

export const guideHref = (id: GuideSectionId) => `/guide#${id}`;

/** 業務フロー図 */
export const GUIDE_FLOW_HREF = '/guide/flow';
