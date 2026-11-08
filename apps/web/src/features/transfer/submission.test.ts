import { SEED_FACTORS, SEED_PROJECTS } from 'cobra-core/seed';
import { describe, expect, it } from 'vitest';
import type { FactorRow, ProjectRow } from '../../../shared/types';
import { backupFileName } from './backup';
import { buildExport, DEFAULT_EXPORT } from './exportModel';
import { summarizeSubmission } from './submission';

const factorRows: FactorRow[] = SEED_FACTORS.map((f) => ({ ...f, targetFactorId: f.targetFactorId ?? null, modelId: 'default', updatedAt: '' }));
const projectRows: ProjectRow[] = SEED_PROJECTS.map((p) => ({ ...p, modelId: 'default', updatedAt: '' }));
const bundle = {
  model: { id: 'default', name: '社内Web系開発 標準モデル', k: 0.225, units: { fpPerKloc: 100, fpPerScreen: 30, hoursPerMM: 160 }, createdAt: '' },
  factors: factorRows,
  groups: [{ id: 'A', modelId: 'default', name: 'Web 系' }],
  activeVersion: null,
};

describe('summarizeSubmission', () => {
  it('書き出した JSON を要約する', () => {
    const s = summarizeSubmission(buildExport(bundle, projectRows, DEFAULT_EXPORT, { exportedBy: 'x', forUpload: true }));
    expect(s).toMatchObject({ modelName: '社内Web系開発 標準モデル', version: null, factors: 8, triangles: 16, relations: 1, unknownFormat: false });
    expect(s.standard + s.custom).toBe(8);
    expect(s.experts).toHaveLength(2);
    expect(s.factorNames[0]).toMatch(/^01 /);
  });
  it('壊れた payload でも落ちない', () => {
    for (const p of [null, undefined, 1, 'x', [], { factors: 'x', model: 3, accuracy: [] }]) {
      const s = summarizeSubmission(p);
      expect(s.factors).toBe(0);
      expect(s.unknownFormat).toBe(true);
      expect(s.mmre).toBeNull();
    }
  });
  it('要因名は番号順で上限まで、名前が無ければ (名前なし)', () => {
    const s = summarizeSubmission({ format: 'estima-model/1', factors: [{ no: 2, name: 'B' }, { no: 1 }, { no: 3, name: 'C' }], accuracy: { mmre: 0.128, pred25: Number.NaN } }, 2);
    expect(s.factorNames).toEqual(['01 (名前なし)', '02 B']);
    expect(s.mmre).toBe(0.128);
    expect(s.pred25).toBeNull();
  });
});

describe('backupFileName', () => {
  it('版と日時（ゼロ埋め）を含む', () => {
    expect(backupFileName({ activeVersion: null }, new Date(2026, 0, 5, 9, 7))).toBe('estima-backup-v0-20260105-0907.json');
  });
});
