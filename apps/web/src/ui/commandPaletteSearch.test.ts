import { describe, expect, it } from 'vitest';
import {
  GROUP_LABELS,
  estimateItems,
  factorItems,
  flattenSections,
  normalizeForSearch,
  projectItems,
  scoreItem,
  screenItems,
  searchPalette,
  tokenize,
  type PaletteItem,
} from './commandPaletteSearch';

const screens = screenItems({ estimateId: 'portal', isAdmin: true });
const estimates = estimateItems([
  { id: 'portal', name: '顧客ポータル刷新 — 案B (外部連携あり)' },
  { id: 'hr', name: '採用管理の改修' },
]);
const factors = factorItems([
  { id: 'F01', no: 1, name: '要件の安定性', category: 'プロダクト', kind: 'direct' },
  { id: 'F02', no: 2, name: '顧客の関与度', category: 'プロジェクト', kind: 'direct' },
  { id: 'F08', no: 8, name: 'チームの経験', category: '人', kind: 'indirect' },
]);
const projects = projectItems([
  { id: 'PJ-001', name: '予約受付 スマホ対応', groupId: 'A', adopted: true },
  { id: 'PJ-002', name: '採用管理 SaaS 連携', groupId: 'A', adopted: true },
  { id: 'PJ-010', name: 'ポータル改修', groupId: 'B', adopted: false },
]);
const all: PaletteItem[] = [...screens, ...estimates, ...factors, ...projects];

const labels = (q: string, limit?: number) => flattenSections(searchPalette(all, q, { limit })).map((i) => i.label);
const groupsOf = (q: string) => searchPalette(all, q).map((s) => s.label);

describe('normalizeForSearch', () => {
  it('全角英数字・記号を半角にし、小文字にそろえる', () => {
    expect(normalizeForSearch('ＰＪ－００１')).toBe('pj-001');
    expect(normalizeForSearch('ＣｏＢＲＡ')).toBe('cobra');
  });
  it('カタカナをひらがなにそろえる（半角カナも）', () => {
    expect(normalizeForSearch('ポータル')).toBe(normalizeForSearch('ぽーたる'));
    expect(normalizeForSearch('ﾎﾟｰﾀﾙ')).toBe(normalizeForSearch('ポータル'));
  });
  it('連続空白（全角含む）を 1 つにし、前後を詰める', () => {
    expect(normalizeForSearch('　要件　　安定  ')).toBe('要件 安定');
  });
  it('空文字は空文字', () => {
    expect(normalizeForSearch('')).toBe('');
  });
});

describe('tokenize', () => {
  it('空・空白だけなら []', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize(' 　 ')).toEqual([]);
  });
  it('全角スペースでも区切る', () => {
    expect(tokenize('顧客　ポータル')).toEqual(['顧客', 'ぽ-たる']);
  });
});

describe('scoreItem', () => {
  const item: PaletteItem = { key: 'x', group: 'project', label: '予約受付 スマホ対応', sub: 'PJ-001', to: '/', keywords: ['PJ-001'] };
  it('前方一致 < 部分一致 < 補助語一致', () => {
    expect(scoreItem(item, tokenize('予約'))).toEqual([0, 0]);
    expect(scoreItem(item, tokenize('スマホ'))).toEqual([1, 1]);
    expect(scoreItem(item, tokenize('pj-001'))).toEqual([2, 2]);
  });
  it('どれか 1 語でも外れたら null（AND）', () => {
    expect(scoreItem(item, tokenize('予約 存在しない'))).toBeNull();
  });
  it('複数語は最も弱い一致で順位が決まる', () => {
    expect(scoreItem(item, tokenize('予約 pj'))).toEqual([2, 2]);
  });
});

describe('searchPalette', () => {
  it('空の検索語では画面の一覧だけを（上限なしで）返す', () => {
    const s = searchPalette(all, '', { limit: 3 });
    expect(s).toHaveLength(1);
    expect(s[0]!.label).toBe('画面');
    expect(s[0]!.items).toHaveLength(screens.length);
    expect(s[0]!.items.map((i) => i.to)).toEqual(expect.arrayContaining(['/guide', '/guide/flow', '/admin/users']));
  });

  it('管理者でなければ「利用者」は出ない', () => {
    const s = screenItems({ estimateId: 'portal', isAdmin: false });
    expect(s.map((i) => i.to)).not.toContain('/admin/users');
    expect(s.map((i) => i.label)).toContain('CoBRA法の解説');
  });

  it('見積り系画面は指定の見積り ID へ', () => {
    const to = screenItems({ estimateId: 'a b', isAdmin: false }).map((i) => i.to);
    expect(to).toEqual(expect.arrayContaining(['/estimate/a%20b', '/estimate/a%20b/risk', '/estimate/a%20b/report']));
  });

  it('ID「PJ-001」でも全角「ＰＪ－００１」でも、区切りなし「pj001」でも実績が出る', () => {
    for (const q of ['PJ-001', 'ＰＪ－００１', 'pj001', 'pj-001']) {
      const s = searchPalette(all, q);
      expect(s.map((x) => x.label)).toEqual(['実績データ']);
      expect(s[0]!.items.map((i) => i.to)).toEqual(['/model/projects/PJ-001']);
    }
  });

  it('日本語の部分一致とひらがな/カタカナの互換', () => {
    expect(labels('ぽーたる')).toEqual(['顧客ポータル刷新 — 案B (外部連携あり)', 'ポータル改修']);
    expect(groupsOf('ぽーたる')).toEqual(['見積り', '実績データ']);
  });

  it('前方一致が部分一致より、部分一致が補助語一致より上に来る', () => {
    // 「採用管理の改修」は前方一致、「顧客ポータル…」は名前に含まない
    const est = searchPalette(estimateItems([{ id: 'x', name: '新・採用管理' }, { id: 'y', name: '採用管理の改修' }]), '採用');
    expect(est[0]!.items.map((i) => i.label)).toEqual(['採用管理の改修', '新・採用管理']);
    // 画面: 「要因を追加」(前方) > 「変動要因」(部分) > 「モデル構築」(補助語なし→不一致)
    const sc = searchPalette(screens, '要因')[0]!.items.map((i) => i.label);
    expect(sc.slice(0, 3)).toEqual(['要因を追加', '要因関係図', '変動要因']);
  });

  it('要因は ID・番号・分類でも引け、遷移先は要因を選んだ一覧', () => {
    expect(searchPalette(all, 'f08')[0]!.items[0]!.to).toBe('/model/factors?f=F08');
    expect(labels('ｆ０１')).toEqual(['要件の安定性']);
    expect(searchPalette(factors, '間接')[0]!.items.map((i) => i.label)).toEqual(['チームの経験']);
  });

  it('空白区切りは AND', () => {
    expect(labels('採用 連携')).toEqual(['採用管理 SaaS 連携']);
    expect(labels('採用 存在しない')).toEqual([]);
  });

  it('大文字小文字・全角英字を区別しない', () => {
    expect(labels('saas')).toEqual(['採用管理 SaaS 連携']);
    expect(labels('ＳＡＡＳ')).toEqual(['採用管理 SaaS 連携']);
  });

  it('英語名・読みで画面を引ける', () => {
    expect(labels('dashboard')).toEqual(['ダッシュボード']);
    expect(labels('りすく')).toEqual(['リスク']);
    expect(labels('csv')).toEqual(['取り込み / 書き出し']);
  });

  it('各グループは上限件数まで。total は切り捨て前の件数', () => {
    const many = projectItems(Array.from({ length: 20 }, (_, i) => ({ id: `PJ-${String(i).padStart(3, '0')}`, name: `案件 ${i}`, adopted: true })));
    const s = searchPalette(many, '案件', { limit: 5 });
    expect(s[0]!.items).toHaveLength(5);
    expect(s[0]!.total).toBe(20);
    // 同順位は元の並び順
    expect(s[0]!.items.map((i) => i.key)).toEqual(['project:PJ-000', 'project:PJ-001', 'project:PJ-002', 'project:PJ-003', 'project:PJ-004']);
  });

  it('上限の異常値（0・負・小数）でも最低 1 件', () => {
    expect(searchPalette(projects, 'pj', { limit: 0 })[0]!.items).toHaveLength(1);
    expect(searchPalette(projects, 'pj', { limit: -3 })[0]!.items).toHaveLength(1);
    expect(searchPalette(projects, 'pj', { limit: 2.9 })[0]!.items).toHaveLength(2);
  });

  it('グループ順は 画面 → 見積り → 変動要因 → 実績データ', () => {
    const s = searchPalette(all, 'a'); // 画面(英語名), 見積り(案B), 実績(グループ A/SaaS)
    const order = s.map((x) => x.label);
    const expected = Object.values(GROUP_LABELS).filter((l) => order.includes(l));
    expect(order).toEqual(expected);
  });

  it('一致なしは []、対象が空でも落ちない', () => {
    expect(searchPalette(all, 'zzzzzz')).toEqual([]);
    expect(searchPalette([], 'a')).toEqual([]);
    expect(searchPalette([], '')).toEqual([]);
  });

  it('除外した実績は補足に「除外」と出る', () => {
    expect(projects.find((p) => p.key === 'project:PJ-010')!.sub).toBe('PJ-010 ・ グループ B ・ 除外');
  });
});
