import { describe, expect, it } from 'vitest';
import type { GenerationRow } from '../../../shared/types';
import { estimatePath, isEstimateAreaPath, normalizeGenLabel, resolveGen, withGen } from './genParam';

const g = (id: string, label: string) => ({ id, label }) as GenerationRow;
const gens = [g('a', 'G1'), g('b', 'G2'), g('c', 'G3')];

describe('normalizeGenLabel', () => {
  it('G1… を正規化する', () => {
    expect(normalizeGenLabel('G2')).toBe('G2');
    expect(normalizeGenLabel(' g12 ')).toBe('G12');
  });
  it('不正・空は null', () => {
    for (const v of [null, undefined, '', 'G', 'G0', 'G02', 'X2', '2', 'G2a', 'G-1']) expect(normalizeGenLabel(v)).toBeNull();
  });
});

describe('resolveGen', () => {
  it('ラベルで世代を探す', () => {
    expect(resolveGen(gens, 'G2')?.id).toBe('b');
    expect(resolveGen(gens, 'g3')?.id).toBe('c');
  });
  it('無い・不正・空配列は null（既定の世代に戻すのは呼び出し側）', () => {
    expect(resolveGen(gens, 'G5')).toBeNull();
    expect(resolveGen(gens, null)).toBeNull();
    expect(resolveGen([], 'G1')).toBeNull();
  });
});

describe('withGen / estimatePath', () => {
  it('?gen= を付ける（無ければそのまま）', () => {
    expect(withGen('/estimate/portal/risk', 'G2')).toBe('/estimate/portal/risk?gen=G2');
    expect(withGen('/x?a=1', 'g1')).toBe('/x?a=1&gen=G1');
    expect(withGen('/x', null)).toBe('/x');
    expect(withGen('/x', 'bad')).toBe('/x');
  });
  it('タブごとのパス', () => {
    expect(estimatePath('portal', 'conditions', 'G2')).toBe('/estimate/portal?gen=G2');
    expect(estimatePath('portal', 'risk')).toBe('/estimate/portal/risk');
    expect(estimatePath('portal', 'report', 'G3')).toBe('/estimate/portal/report?gen=G3');
  });
});

describe('isEstimateAreaPath', () => {
  it('同じ見積りの条件・リスク・レポートだけ', () => {
    expect(isEstimateAreaPath('portal', '/estimate/portal')).toBe(true);
    expect(isEstimateAreaPath('portal', '/estimate/portal/')).toBe(true);
    expect(isEstimateAreaPath('portal', '/estimate/portal/risk')).toBe(true);
    expect(isEstimateAreaPath('portal', '/estimate/portal/report')).toBe(true);
    expect(isEstimateAreaPath('portal', '/')).toBe(false);
    expect(isEstimateAreaPath('portal', '/estimate/other')).toBe(false);
    expect(isEstimateAreaPath('portal', '/estimate/portal2')).toBe(false);
    expect(isEstimateAreaPath('portal', '/model/build')).toBe(false);
  });
});
