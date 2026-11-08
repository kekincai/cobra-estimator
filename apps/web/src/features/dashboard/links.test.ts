import { describe, expect, it } from 'vitest';
import { estimateLinks, isGenLabel } from './links';

describe('estimateLinks', () => {
  it('世代 label を ?gen= で渡す', () => {
    expect(estimateLinks('portal', 'G2')).toEqual({
      conditions: '/estimate/portal?gen=G2',
      risk: '/estimate/portal/risk?gen=G2',
      report: '/estimate/portal/report?gen=G2',
    });
  });
  it('世代が無い（サンプル表示）ときは付けない', () => {
    expect(estimateLinks('portal', null).risk).toBe('/estimate/portal/risk');
    expect(estimateLinks('portal', undefined).report).toBe('/estimate/portal/report');
    expect(estimateLinks('portal', 'サンプル').conditions).toBe('/estimate/portal');
  });
  it('id はエンコードする', () => {
    expect(estimateLinks('a b/c', 'G1').risk).toBe('/estimate/a%20b%2Fc/risk?gen=G1');
  });
  it('isGenLabel', () => {
    expect(isGenLabel('G5')).toBe(true);
    expect(isGenLabel('')).toBe(false);
    expect(isGenLabel('G1&x=1')).toBe(false);
  });
});
