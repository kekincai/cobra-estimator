import { describe, expect, it } from 'vitest';
import { inconsistencyText } from './inconsistency';

describe('inconsistencyText', () => {
  it('negative gap → ΣCO が高いのに工数が少ない', () => {
    expect(inconsistencyText([{ projectId: 'PJ-007', gap: -0.26 }])).toBe(
      'PJ-007（−26%）は ΣCO が高いのに工数が少なく、実績生産性が食い違っています。',
    );
  });
  it('positive gap → ΣCO が低いのに工数が多い', () => {
    expect(inconsistencyText([{ projectId: 'PJ-007', gap: 0.31 }])).toContain('ΣCO が低いのに工数が多く');
  });
  it('mixed signs produce both sentences', () => {
    const t = inconsistencyText([
      { projectId: 'PJ-003', gap: 0.3 },
      { projectId: 'PJ-007', gap: -0.26 },
    ]);
    expect(t).toContain('PJ-003（+30%）は ΣCO が低い');
    expect(t).toContain('PJ-007（−26%）は ΣCO が高い');
  });
});
