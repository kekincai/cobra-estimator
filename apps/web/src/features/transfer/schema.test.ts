import { describe, expect, it } from 'vitest';
import { parseModelJson, relationsOf, validateModelFile } from './schema';

const base = {
  format: 'estima-model/1',
  exportedAt: '2026-11-06T05:12:00Z',
  exportedBy: 'K. Cai',
  model: { name: '社内Web系開発 標準モデル', version: 3, alpha: 0.021, ci95: [0.0186, 0.0237] },
  factors: [
    { no: 1, name: '要件の安定性', category: 'プロダクト', kind: 'direct', origin: 'standard', definition: '…', levels: ['a', 'b', 'c', 'd'] },
    { no: 2, name: '顧客の関与度', category: 'プロダクト', kind: 'indirect', origin: 'standard', targetNo: 1, definition: '…', levels: ['a', 'b', 'c', 'd'] },
  ],
  triangles: [{ factorNo: 1, expert: 'S.T.', l3: [0.18, 0.26, 0.4] }],
  relations: [{ indirectNo: 2, directNo: 1, k: 0.225 }],
  projects: [{ id: 'PJ-001', sizeFP: 860, effortMM: 19.5, levels: [2, 1], groupId: 'A', note: '' }],
};

const clone = () => structuredClone(base) as Record<string, any>;

describe('estima-model/1 schema', () => {
  it('accepts the §3.1 example and fills defaults', () => {
    const r = validateModelFile({ ...clone(), relations: undefined, groups: undefined });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.relations).toEqual([]);
    expect(r.data.factors[0]!.origin).toBe('standard');
  });

  it('parses JSON text with a BOM', () => {
    expect(parseModelJson('﻿' + JSON.stringify(base)).ok).toBe(true);
  });

  it('rejects broken JSON and wrong format with Japanese messages', () => {
    const bad = parseModelJson('{ "format": ');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0]).toMatch(/JSON として読めません/);
    const wrong = validateModelFile({ ...clone(), format: 'estima-model/2' });
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.errors.join()).toMatch(/format/);
  });

  it('checks triangle order, level range and references', () => {
    const f = clone();
    f.triangles = [{ factorNo: 1, expert: 'S.T.', l3: [0.4, 0.26, 0.18] }, { factorNo: 9, expert: 'S.T.', l3: [0, 0, 0] }];
    f.projects[0].levels = [4, 1];
    const r = validateModelFile(f);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const msg = r.errors.join('\n');
    expect(msg).toMatch(/最良 ≤ 最頻 ≤ 最悪/);
    expect(msg).toMatch(/要因番号 9/);
    expect(msg).toMatch(/0〜3/);
  });

  it('rejects duplicate names / numbers and invalid relations', () => {
    const f = clone();
    f.factors.push({ ...f.factors[0], no: 3, kind: 'indirect' });
    f.relations.push({ indirectNo: 3, directNo: 1 });
    const r = validateModelFile(f);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const msg = r.errors.join('\n');
    expect(msg).toMatch(/要因名「要件の安定性」が重複/);
    expect(msg).toMatch(/間接要因が 2 つ/);
  });

  it('rejects indirect → indirect', () => {
    const f = clone();
    f.relations = [{ indirectNo: 2, directNo: 2 }];
    const r = validateModelFile(f);
    expect(r.ok).toBe(false);
  });

  it('merges relations and factors[].targetNo', () => {
    const r = validateModelFile({ ...clone(), relations: [] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(relationsOf(r.data)).toEqual([{ indirectNo: 2, directNo: 1 }]);
  });
});
