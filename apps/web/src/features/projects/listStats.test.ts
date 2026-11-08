import { describe, expect, it } from 'vitest';
import type { ProjectRow } from '../../../shared/types';
import type { ProjectStat } from './calc';
import { nextSort, prodSummary, sizeBins, sortStats } from './listStats';

const stat = (id: string, sizeFP: number, effortMM: number, extra: Partial<ProjectRow> = {}): ProjectStat => {
  const row = { id, name: id, groupId: 'A', sizeFP, effortMM, adopted: true, levels: {}, note: '', excludedReason: null, ...extra } as unknown as ProjectRow;
  return { row, sco: 0, prod: effortMM / sizeFP, alphaJ: effortMM / sizeFP };
};

describe('prodSummary', () => {
  it('empty → null (no NaN / 0 conclusions)', () => {
    expect(prodSummary([])).toBeNull();
  });
  it('single element', () => {
    expect(prodSummary([stat('a', 500, 10)])).toEqual({ n: 1, avg: 0.02, min: 0.02, max: 0.02 });
  });
  it('mean and range', () => {
    const r = prodSummary([stat('a', 500, 10), stat('b', 1000, 30), stat('c', 400, 8)])!;
    expect(r.n).toBe(3);
    expect(r.avg).toBeCloseTo((0.02 + 0.03 + 0.02) / 3, 12);
    expect(r.min).toBeCloseTo(0.02);
    expect(r.max).toBeCloseTo(0.03);
  });
  it('ignores non-finite productivity (size 0)', () => {
    expect(prodSummary([stat('z', 0, 10)])).toBeNull();
  });
  it('§6 sample: 11 adopted projects', () => {
    const data: [number, number][] = [[420, 8.2], [560, 12.9], [680, 13.1], [760, 17.8], [900, 21.5], [980, 19.4], [1250, 31.2], [1400, 29.1], [1620, 41.3], [1880, 46.8], [2150, 55.2]];
    const r = prodSummary(data.map(([s, e], i) => stat(`PJ-${i}`, s, e)))!;
    expect(r.avg.toFixed(4)).toBe('0.0228');
  });
});

describe('sizeBins', () => {
  it('no projects: default axis, empty bins, no highlight, range unknown', () => {
    expect(sizeBins([], [], 1200)).toEqual({ xMax: 2000, bins: [0, 0, 0, 0, 0, 0], estBin: 3, estInRange: null });
  });
  it('estimate beyond the axis is not clamped into the last bin', () => {
    const r = sizeBins([300, 400], [300, 400], 1200);
    expect(r.xMax).toBe(500);
    expect(r.estBin).toBe(-1);
    expect(r.estInRange).toBe(false);
  });
  it('estimate exactly at xMax is in the last bin', () => {
    expect(sizeBins([500], [500], 500).estBin).toBe(5);
  });
  it('bins count adopted only; axis from all rows', () => {
    const r = sizeBins([420, 1100, 2150], [420, 2150], 1200);
    expect(r.xMax).toBe(2500);
    expect(r.bins).toEqual([0, 1, 0, 0, 0, 1]); // 420/2500×6 = 1.008 → 2 番目のビン
    expect(r.estBin).toBe(2);
    expect(r.estInRange).toBe(true);
  });
  it('null / negative estimate', () => {
    expect(sizeBins([420], [420], null).estBin).toBe(-1);
    expect(sizeBins([420], [420], -5).estBin).toBe(-1);
    expect(sizeBins([420], [420], null).estInRange).toBeNull();
  });
  it('estimate 0 is in the first bin', () => {
    expect(sizeBins([420], [420], 0).estBin).toBe(0);
  });
});

describe('sortStats', () => {
  const rows = [stat('PJ-010', 900, 20), stat('PJ-2', 900, 18), stat('PJ-001', 420, 8.2), stat('PJ-003', 680, 13.1)];
  it('numeric ascending / descending', () => {
    expect(sortStats(rows, 'size', 'asc').map((s) => s.row.id)).toEqual(['PJ-001', 'PJ-003', 'PJ-010', 'PJ-2']);
    expect(sortStats(rows, 'size', 'desc').map((s) => s.row.id)).toEqual(['PJ-010', 'PJ-2', 'PJ-003', 'PJ-001']);
  });
  it('is stable for ties in both directions', () => {
    const asc = sortStats(rows, 'size', 'asc').map((s) => s.row.id);
    const desc = sortStats(rows, 'size', 'desc').map((s) => s.row.id);
    expect(asc.indexOf('PJ-010')).toBeLessThan(asc.indexOf('PJ-2'));
    expect(desc.indexOf('PJ-010')).toBeLessThan(desc.indexOf('PJ-2'));
  });
  it('numeric, not lexicographic (900 > 1000 would be wrong)', () => {
    const r = sortStats([stat('a', 900, 1), stat('b', 1000, 1), stat('c', 99, 1)], 'size', 'asc');
    expect(r.map((s) => s.row.sizeFP)).toEqual([99, 900, 1000]);
  });
  it('productivity column', () => {
    expect(sortStats(rows, 'prod', 'desc')[0]!.row.id).toBe('PJ-010');
  });
  it('string ids use natural order', () => {
    expect(sortStats([stat('PJ-10', 1, 1), stat('PJ-2', 1, 1)], 'id', 'asc').map((s) => s.row.id)).toEqual(['PJ-2', 'PJ-10']);
  });
  it('NaN always last', () => {
    const r = sortStats([stat('x', 0, 0), stat('y', 100, 2)], 'prod', 'asc');
    expect(r.map((s) => s.row.id)).toEqual(['y', 'x']);
    expect(sortStats([stat('x', 0, 0), stat('y', 100, 2)], 'prod', 'desc').map((s) => s.row.id)).toEqual(['y', 'x']);
  });
  it('empty and does not mutate input', () => {
    expect(sortStats([], 'size', 'asc')).toEqual([]);
    const before = rows.map((s) => s.row.id);
    sortStats(rows, 'size', 'desc');
    expect(rows.map((s) => s.row.id)).toEqual(before);
  });
});

describe('nextSort', () => {
  it('toggles on same column; numeric columns start descending', () => {
    expect(nextSort(null, 'prod')).toEqual({ key: 'prod', dir: 'desc' });
    expect(nextSort({ key: 'prod', dir: 'desc' }, 'prod')).toEqual({ key: 'prod', dir: 'asc' });
    expect(nextSort({ key: 'prod', dir: 'asc' }, 'name')).toEqual({ key: 'name', dir: 'asc' });
  });
});
