import { describe, expect, it } from 'vitest';
import { estimateNavTarget, isFactorsArea } from './Layout';

describe('estimateNavTarget', () => {
  it('見積り画面では同じ見積りと ?gen を保つ', () => {
    expect(estimateNavTarget('/estimate/abc/risk', '?gen=G2', 'portal')).toEqual({
      estimate: '/estimate/abc?gen=G2',
      risk: '/estimate/abc/risk?gen=G2',
      report: '/estimate/abc/report?gen=G2',
    });
  });
  it('見積り画面以外では最近の見積りへ（?gen は付けない）', () => {
    expect(estimateNavTarget('/model/build', '?gen=G2', 'new-1').estimate).toBe('/estimate/new-1');
  });
  it('見積り一覧が未取得なら既定の見積り', () => {
    expect(estimateNavTarget('/', '', undefined).risk).toBe('/estimate/portal/risk');
  });
});

describe('isFactorsArea', () => {
  it('関係図・新規作成でも変動要因を選択中にする', () => {
    expect(isFactorsArea('/model/factors')).toBe(true);
    expect(isFactorsArea('/model/factors/new')).toBe(true);
    expect(isFactorsArea('/model/relations')).toBe(true);
    expect(isFactorsArea('/model/projects')).toBe(false);
  });
});
