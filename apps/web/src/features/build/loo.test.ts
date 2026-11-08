import { buildModel, DEFAULT_SEED } from 'cobra-core';
import { SEED_MODEL, SEED_PROJECTS } from 'cobra-core/seed';
import { describe, expect, it } from 'vitest';
import { bandPct } from '../projects/bandFormat';
import { looOutIds } from './LooChart';

describe('LOO chart classification matches cobra-core PRED(25)', () => {
  const adopted = SEED_PROJECTS.filter((p) => p.adopted !== false);
  const r = buildModel(SEED_MODEL, adopted, { runs: 10_000, seed: DEFAULT_SEED });

  it('out-of-band count = n − PRED(25)·n', () => {
    expect(looOutIds(r.loo).length).toBe(r.n - Math.round(r.pred25 * r.n));
  });

  it('§6 sample: PJ-003 and PJ-010 are outside; PJ-003 is shown with a decimal', () => {
    expect(looOutIds(r.loo)).toEqual(['PJ-003', 'PJ-010']);
    const pj3 = r.loo.find((l) => l.projectId === 'PJ-003')!;
    expect(Math.round(pj3.error * 100)).toBe(25); // 整数表示だと「+25%」になってしまう値
    expect(bandPct(pj3.error)).toEqual({ out: true, text: `+${(Math.round(pj3.error * 1000) / 10).toFixed(1)}%` });
  });

  it('empty loo', () => {
    expect(looOutIds([])).toEqual([]);
  });
});
