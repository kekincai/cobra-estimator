import { describe, expect, it } from 'vitest';
import { availableTargets, checkFactorRules, type FactorRef } from './factor-rules';

const d = (id: string): FactorRef => ({ id, name: id, kind: 'direct', targetFactorId: null });
const ind = (id: string, t: string | null): FactorRef => ({ id, name: id, kind: 'indirect', targetFactorId: t });

describe('checkFactorRules', () => {
  it('accepts the seed shape (02 → 01)', () => {
    expect(checkFactorRules([d('01'), ind('02', '01'), d('03')])).toBeNull();
  });
  it('requires a target for indirect factors', () => {
    expect(checkFactorRules([d('01'), ind('02', null)])).toMatch('選んでください');
  });
  it('rejects indirect → indirect', () => {
    expect(checkFactorRules([d('01'), ind('02', '01'), ind('03', '02')])).toMatch('一段階まで');
  });
  it('rejects two indirect factors on one direct factor', () => {
    expect(checkFactorRules([d('01'), ind('02', '01'), ind('03', '01')])).toMatch('1 つまで');
  });
  it('rejects unknown and self targets', () => {
    expect(checkFactorRules([ind('02', 'x')])).toMatch('見つかりません');
    expect(checkFactorRules([ind('02', '02')])).toMatch('自分自身');
  });
});

describe('availableTargets', () => {
  it('excludes direct factors that already have an indirect, except my own target', () => {
    const all = [d('01'), ind('02', '01'), d('03')];
    expect(availableTargets(all).map((f) => f.id)).toEqual(['03']);
    expect(availableTargets(all, '02').map((f) => f.id)).toEqual(['01', '03']);
  });
});
