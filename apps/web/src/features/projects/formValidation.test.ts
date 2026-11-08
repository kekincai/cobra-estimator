import { DEFAULT_UNITS, projectGap } from 'cobra-core';
import { SEED_MODEL, SEED_PROJECTS } from 'cobra-core/seed';
import { describe, expect, it } from 'vitest';
import { formGap, gapStatus, mapServerIssues, NAME_MAX, validateProjectForm, type FormInput } from './formValidation';

const base: FormInput = { name: '受発注', size: '1200', sizeUnit: 'FP', effort: '25.2', effUnit: 'MM', units: DEFAULT_UNITS };
const v = (p: Partial<FormInput>) => validateProjectForm({ ...base, ...p });

describe('validateProjectForm', () => {
  it('valid input converts and keeps values', () => {
    const r = v({});
    expect(r.errors).toEqual({});
    expect(r.sizeFP).toBe(1200);
    expect(r.effMM).toBe(25.2);
    expect(r.storedSizeFP).toBe(1200);
    expect(r.storedEffMM).toBe(25.2);
  });

  it('empty form: every required field has an error, values are null (not 0)', () => {
    const r = v({ name: '', size: '', effort: '' });
    expect(Object.keys(r.errors).sort()).toEqual(['effort', 'name', 'size']);
    expect(r.sizeFP).toBeNull();
    expect(r.effMM).toBeNull();
  });

  it('full-width digits and full-width minus are understood', () => {
    expect(v({ size: '１２００' }).storedSizeFP).toBe(1200);
    expect(v({ size: '－５００' }).errors.size).toMatch(/0 より大きい/);
  });

  it('negative and zero are field errors, not silently 0', () => {
    expect(v({ size: '-500' }).errors.size).toMatch(/0 より大きい/);
    expect(v({ effort: '0' }).errors.effort).toMatch(/0 より大きい/);
  });

  it('non-numeric input', () => {
    const r = v({ size: '12abc' });
    expect(r.errors.size).toMatch(/数値/);
    expect(r.sizeFP).toBeNull();
  });

  it('unit conversion matches cobra-core (KLOC ×100, 画面 ×30, 160 h = 1 人月)', () => {
    expect(v({ size: '12', sizeUnit: 'KLOC' }).storedSizeFP).toBe(1200);
    expect(v({ size: '40', sizeUnit: 'screen' }).storedSizeFP).toBe(1200);
    expect(v({ effort: '4032', effUnit: 'hours' }).storedEffMM).toBe(25.2);
  });

  it('stored values are rounded to 2 decimals (x.xx5 boundary)', () => {
    expect(v({ effort: '1.005' }).storedEffMM).toBe(Math.round(1.005 * 100) / 100);
    expect(v({ effort: '12.345' }).storedEffMM).toBe(12.35);
  });

  it('too small to store (rounds to 0) is an error', () => {
    expect(v({ effort: '0.001' }).errors.effort).toMatch(/小さすぎ/);
    expect(v({ effort: '1', effUnit: 'hours' }).storedEffMM).toBe(0.01);
    expect(v({ effort: '0.5', effUnit: 'hours' }).errors.effort).toMatch(/小さすぎ/);
  });

  it('name length limit', () => {
    expect(v({ name: 'あ'.repeat(NAME_MAX) }).errors.name).toBeUndefined();
    expect(v({ name: 'あ'.repeat(NAME_MAX + 1) }).errors.name).toMatch(/以内/);
    expect(v({ name: '   ' }).errors.name).toMatch(/入力/);
  });
});

describe('mapServerIssues', () => {
  it('maps zod paths to fields', () => {
    expect(mapServerIssues([{ path: 'sizeFP', message: 'x' }, { path: 'levels.f01', message: 'y' }, { path: 'name', message: 'z' }])).toEqual({
      size: '規模は 0 より大きい数値にしてください',
      levels: 'レベル値は L0〜L3 から選んでください',
      name: `プロジェクト名を確認してください（1〜${NAME_MAX} 文字）`,
    });
  });
  it('unknown / empty', () => {
    expect(mapServerIssues(undefined)).toEqual({});
    expect(mapServerIssues([{ path: '', message: 'x' }, { path: 'foo', message: 'y' }])).toEqual({});
  });
});

describe('formGap / gapStatus', () => {
  const alpha = 0.0210;
  const p = SEED_PROJECTS[0]!;
  it('same as cobra-core projectGap when inputs are valid', () => {
    expect(formGap(SEED_MODEL, alpha, p.sizeFP, p.effortMM, p.levels)).toBe(projectGap(SEED_MODEL, alpha, { ...p, id: 'new' }));
  });
  it('missing size / effort / alpha → null (pending), never 0', () => {
    expect(formGap(SEED_MODEL, alpha, null, 10, p.levels)).toBeNull();
    expect(formGap(SEED_MODEL, alpha, 100, null, p.levels)).toBeNull();
    expect(formGap(SEED_MODEL, alpha, 0, 10, p.levels)).toBeNull();
    expect(formGap(SEED_MODEL, alpha, -5, 10, p.levels)).toBeNull();
    expect(formGap(SEED_MODEL, null, 100, 10, p.levels)).toBeNull();
    expect(formGap(SEED_MODEL, 0, 100, 10, p.levels)).toBeNull();
    expect(gapStatus(null)).toBe('pending');
  });
  it('status boundaries follow cobra-core', () => {
    expect(gapStatus(0)).toBe('ok');
    expect(gapStatus(0.25)).toBe('ok');
    expect(gapStatus(-0.25)).toBe('ok');
    expect(gapStatus(0.2526)).toBe('out');
    expect(gapStatus(-0.26)).toBe('out');
  });
  it('PJ-007 (seed) is inconsistent with α 0.0210', () => {
    const pj7 = SEED_PROJECTS.find((x) => x.id === 'PJ-007')!;
    expect(gapStatus(formGap(SEED_MODEL, 0.02098, pj7.sizeFP, pj7.effortMM, pj7.levels))).toBe('out');
  });
});
