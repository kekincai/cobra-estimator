// コマンドパレットの検索ロジック（純関数）。表示は ui/CommandPalette.tsx。
// - 正規化: NFKC → toHalfWidth（全角英数・各種ダッシュを半角へ）→ 小文字 → カタカナをひらがなへ
// - 空白区切りの語はすべて含まれること（AND）
// - 並び: 名前の前方一致 > 名前に含む > 読み・ID・分類などの補助語に一致。同順位は元の並び順。
// - 各グループは最大 N 件。空の検索語では画面の一覧だけを返す。
import { toHalfWidth } from './numberInput';

export type PaletteGroup = 'screen' | 'estimate' | 'factor' | 'project';

export const GROUP_ORDER: readonly PaletteGroup[] = ['screen', 'estimate', 'factor', 'project'];

export const GROUP_LABELS: Record<PaletteGroup, string> = {
  screen: '画面',
  estimate: '見積り',
  factor: '変動要因',
  project: '実績データ',
};

export interface PaletteItem {
  /** グループ内で一意 */
  key: string;
  group: PaletteGroup;
  /** 表示名（前方一致・部分一致の対象） */
  label: string;
  /** 補足（ID・分類など。表示用） */
  sub?: string;
  /** 遷移先 */
  to: string;
  /** 読み・ID・別名など（補助一致の対象。表示はしない） */
  keywords?: readonly string[];
}

export interface PaletteSection {
  group: PaletteGroup;
  label: string;
  items: PaletteItem[];
  /** 上限で切り捨てる前の件数 */
  total: number;
}

/** 検索用の正規化。全角/半角・大小文字・ひらがな/カタカナの違いを吸収する。 */
export function normalizeForSearch(s: string): string {
  return toHalfWidth(String(s).normalize('NFKC'))
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/\s+/g, ' ')
    .trim();
}

/** 検索語を空白で分割（全角スペースも区切り）。空なら []。 */
export function tokenize(query: string): string[] {
  const n = normalizeForSearch(query);
  return n === '' ? [] : n.split(' ');
}

/** 一致の強さ。小さいほど上位。 */
export const MatchTier = { prefix: 0, contains: 1, keyword: 2 } as const;
export type MatchTier = (typeof MatchTier)[keyof typeof MatchTier];

/** 区切り（空白・記号）を無視した比較用。「PJ001」で「PJ-001」に当てる。 */
const compact = (s: string) => s.replace(/[\s\-_・/／()（）.]/g, '');

function tierOf(token: string, label: string, keywords: readonly string[]): MatchTier | null {
  if (label.startsWith(token)) return MatchTier.prefix;
  if (label.includes(token)) return MatchTier.contains;
  const ct = compact(token);
  if (ct !== '' && compact(label).includes(ct)) return MatchTier.contains;
  for (const k of keywords) {
    if (k.includes(token)) return MatchTier.keyword;
    if (ct !== '' && compact(k).includes(ct)) return MatchTier.keyword;
  }
  return null;
}

/**
 * 1 件の一致度。全語が当たらなければ null。
 * 返り値は [最も弱い語の順位, 各語の順位の合計]（辞書順で小さいほど上位）。
 */
export function scoreItem(item: PaletteItem, tokens: readonly string[]): [number, number] | null {
  const label = normalizeForSearch(item.label);
  const keywords = [item.sub ?? '', ...(item.keywords ?? [])].map(normalizeForSearch).filter(Boolean);
  let worst = 0;
  let sum = 0;
  for (const t of tokens) {
    const tier = tierOf(t, label, keywords);
    if (tier === null) return null;
    worst = Math.max(worst, tier);
    sum += tier;
  }
  return [worst, sum];
}

export interface SearchOptions {
  /** 各グループの上限（既定 6） */
  limit?: number;
}

/** パレットの検索本体。グループ順（画面 → 見積り → 変動要因 → 実績データ）に並べ、空のグループは省く。 */
export function searchPalette(items: readonly PaletteItem[], query: string, opts: SearchOptions = {}): PaletteSection[] {
  const limit = Math.max(1, Math.floor(opts.limit ?? 6));
  const tokens = tokenize(query);

  const byGroup = new Map<PaletteGroup, { item: PaletteItem; score: [number, number]; i: number }[]>();
  items.forEach((item, i) => {
    if (tokens.length === 0 && item.group !== 'screen') return;
    const score = tokens.length === 0 ? ([0, 0] as [number, number]) : scoreItem(item, tokens);
    if (!score) return;
    const list = byGroup.get(item.group) ?? [];
    list.push({ item, score, i });
    byGroup.set(item.group, list);
  });

  const out: PaletteSection[] = [];
  for (const g of GROUP_ORDER) {
    const list = byGroup.get(g);
    if (!list?.length) continue;
    list.sort((a, b) => a.score[0] - b.score[0] || a.score[1] - b.score[1] || a.i - b.i);
    // 空の検索語では画面をすべて出す（一覧として使う）
    const cap = tokens.length === 0 ? list.length : limit;
    out.push({ group: g, label: GROUP_LABELS[g], items: list.slice(0, cap).map((x) => x.item), total: list.length });
  }
  return out;
}

/** セクションを平らにした表示順（↑↓ 移動用） */
export const flattenSections = (sections: readonly PaletteSection[]): PaletteItem[] => sections.flatMap((s) => s.items);

// ---- 検索対象の組み立て ----------------------------------------------------

export interface ScreenOptions {
  /** 見積り系画面の遷移先に使う見積り ID */
  estimateId: string;
  /** 利用者（管理者専用）を含めるか */
  isAdmin: boolean;
}

/** 画面の一覧（サイドバーと同じ名前。読み・英語名でも引ける）。 */
export function screenItems({ estimateId, isAdmin }: ScreenOptions): PaletteItem[] {
  const e = encodeURIComponent(estimateId);
  const list: (Omit<PaletteItem, 'group'> & { admin?: boolean })[] = [
    { key: 'dash', label: 'ダッシュボード', to: '/', keywords: ['だっしゅぼーど', 'ホーム', '概要', 'dashboard', 'home'] },
    { key: 'factors', label: '変動要因', to: '/model/factors', keywords: ['へんどうよういん', 'よういん', 'factor', 'モデル'] },
    { key: 'factor-new', label: '要因を追加', sub: '変動要因', to: '/model/factors/new', keywords: ['よういんをついか', '標準要因', '新規', 'new factor'] },
    { key: 'relations', label: '要因関係図', sub: '変動要因', to: '/model/relations', keywords: ['よういんかんけいず', '関係', '間接', 'relations'] },
    { key: 'projects', label: '実績データ', to: '/model/projects', keywords: ['じっせきでーた', 'プロジェクト', 'project', 'data'] },
    { key: 'project-new', label: 'プロジェクト実績を追加', sub: '実績データ', to: '/model/projects/new', keywords: ['じっせきをついか', '新規', 'new project'] },
    { key: 'build', label: 'モデル構築', to: '/model/build', keywords: ['もでるこうちく', 'α', '交差検証', 'loo', 'mmre', 'build'] },
    { key: 'transfer', label: '取り込み / 書き出し', to: '/transfer', keywords: ['とりこみ', 'かきだし', 'インポート', 'エクスポート', 'csv', 'xml', 'json', 'import', 'export'] },
    { key: 'estimate', label: '工数見積り', to: `/estimate/${e}`, keywords: ['こうすうみつもり', '見積もり', '世代', 'estimate'] },
    { key: 'risk', label: 'リスク', to: `/estimate/${e}/risk`, keywords: ['りすく', '超過確率', '予算', 'risk'] },
    { key: 'report', label: 'レポート', to: `/estimate/${e}/report`, keywords: ['れぽーと', '報告', '印刷', 'report', 'pdf'] },
    { key: 'users', label: '利用者', to: '/admin/users', keywords: ['りようしゃ', 'ユーザー', '権限', 'users', 'admin'], admin: true },
    { key: 'guide', label: 'CoBRA法の解説', to: '/guide', keywords: ['かいせつ', 'ヘルプ', '使い方', 'help', 'guide'] },
    { key: 'flow', label: '業務フロー図', sub: 'CoBRA法の解説', to: '/guide/flow', keywords: ['ぎょうむふろーず', 'フロー', '流れ', 'flow'] },
  ];
  return list
    .filter((s) => isAdmin || !s.admin)
    .map(({ admin: _admin, ...s }) => ({ ...s, key: `screen:${s.key}`, group: 'screen' as const }));
}

export interface EstimateLike {
  id: string;
  name: string;
}
export const estimateItems = (rows: readonly EstimateLike[]): PaletteItem[] =>
  rows.map((r) => ({ key: `estimate:${r.id}`, group: 'estimate', label: r.name, to: `/estimate/${encodeURIComponent(r.id)}`, keywords: [r.id] }));

export interface FactorLike {
  id: string;
  no: number;
  name: string;
  category: string;
  kind: string;
}
export const factorItems = (rows: readonly FactorLike[]): PaletteItem[] =>
  rows.map((r) => ({
    key: `factor:${r.id}`,
    group: 'factor',
    label: r.name,
    sub: `${r.id} ・ ${r.category} ・ ${r.kind === 'indirect' ? '間接' : '直接'}`,
    to: `/model/factors?f=${encodeURIComponent(r.id)}`,
    keywords: [r.id, String(r.no).padStart(2, '0')],
  }));

export interface ProjectLike {
  id: string;
  name: string;
  groupId?: string | null;
  adopted: boolean;
}
export const projectItems = (rows: readonly ProjectLike[]): PaletteItem[] =>
  rows.map((r) => ({
    key: `project:${r.id}`,
    group: 'project',
    label: r.name,
    sub: `${r.id}${r.groupId ? ` ・ グループ ${r.groupId}` : ''}${r.adopted ? '' : ' ・ 除外'}`,
    to: `/model/projects/${encodeURIComponent(r.id)}`,
    keywords: [r.id],
  }));
