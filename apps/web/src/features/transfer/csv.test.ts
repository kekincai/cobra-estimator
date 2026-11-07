import { describe, expect, it } from 'vitest';
import { checkMapping, guessMapping, parseCsv, summarize, targetOptions, validateRows, type TargetKey } from './csv';

const factors = Array.from({ length: 8 }, (_, i) => ({ id: `F0${i + 1}`, no: i + 1, name: `要因${i + 1}` }));

describe('parseCsv', () => {
  it('handles quotes, embedded commas/newlines, CRLF, BOM and blank lines', () => {
    const rows = parseCsv('﻿name,note\r\n"PJ, 1","a ""b""\nc"\r\n\r\nPJ-2,\n');
    expect(rows).toEqual([['name', 'note'], ['PJ, 1', 'a "b"\nc'], ['PJ-2', '']]);
  });
  it('detects tab separated values', () => {
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('guessMapping', () => {
  it('maps the design headers', () => {
    const g = guessMapping(['name', 'fp', 'mm', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'note'], factors);
    expect(g.map).toEqual(['name', 'size', 'effort', ...factors.map((f) => `level:${f.id}`), 'note']);
    expect(g.sizeUnit).toBe('FP');
    expect(g.effortUnit).toBe('MM');
  });
  it('maps Japanese headers, units, factor names and skips unknown / duplicate columns', () => {
    const g = guessMapping(['プロジェクト名', '規模 (KLOC)', '工数（人時）', '要因01', '要因3', '要因8', 'L02', '担当', '名称'], factors);
    expect(g.map).toEqual(['name', 'size', 'effort', 'level:F01', 'level:F03', 'level:F08', 'level:F02', 'skip', 'skip']);
    expect(g.sizeUnit).toBe('KLOC');
    expect(g.effortUnit).toBe('hours');
  });
});

describe('checkMapping', () => {
  it('requires name / size / effort once each', () => {
    expect(checkMapping(['name', 'size', 'effort']).ok).toBe(true);
    expect(checkMapping(['name', 'size', 'skip']).missing).toEqual(['effort']);
    expect(checkMapping(['name', 'size', 'size', 'effort']).duplicates).toEqual(['size']);
  });
  it('lists the targets in design order', () => {
    const labels = targetOptions(factors).map((t) => t.label);
    expect(labels[0]).toBe('プロジェクト名');
    expect(labels[3]).toBe('要因 01 レベル');
    expect(labels.at(-1)).toBe('取り込まない');
  });
});

describe('validateRows', () => {
  const map: TargetKey[] = ['name', 'size', 'effort', ...factors.map((f) => `level:${f.id}` as TargetKey), 'note'];
  const rows = [
    ['PJ-2024-01', '860', '19.5', '2', '1', '1', '2', '1', '2', '1', '0', '保守移管あり'],
    ['PJ-2025-07', '1,180', '', '2', '1', '2', '1', '2', '2', '1', '1', ''],
    ['PJ-2025-09', '2050', '52.1', '3', '2', '1', '4', '2', '2', '1', '2', ''],
    ['予約受付 スマホ対応', '420', '8.2', '0', '0', '0', '0', '1', '0', '0', '0', ''],
    ['PJ-X', '100', '2', '', '0', '0', '0', '0', '0', '0', '0', ''],
    ['PJ-X', '100', '2', '0', '0', '0', '0', '0', '0', '0', '0', ''],
  ];
  const opts = { factors, sizeUnit: 'FP' as const, effortUnit: 'MM' as const, existing: [{ id: 'PJ-001', name: '予約受付 スマホ対応' }] };

  it('validates blanks, range, duplicates', () => {
    const r = validateRows(rows, map, opts);
    expect(r[0]).toMatchObject({ ok: true, name: 'PJ-2024-01', sizeFP: 860, effortMM: 19.5, note: '保守移管あり', line: 2 });
    expect(r[0]!.levels).toEqual({ F01: 2, F02: 1, F03: 1, F04: 2, F05: 1, F06: 2, F07: 1, F08: 0 });
    expect(r[1]!.issues.map((i) => i.message)).toEqual(['工数が空']);
    expect(r[1]!.sizeFP).toBe(1180);
    expect(r[2]!.issues.map((i) => i.message)).toEqual(['レベル値 4 は範囲外']);
    expect(r[3]!.issues[0]).toMatchObject({ code: 'dup-existing', existingId: 'PJ-001' });
    expect(r[4]!.issues.map((i) => i.code)).toEqual(['level-blank', 'dup-file']);
    const s = summarize(r);
    expect(s.ok).toHaveLength(1);
    expect(s.effortBlank).toHaveLength(1);
    expect(s.levelRange).toHaveLength(2);
    expect(s.duplicate).toHaveLength(3);
  });

  it('converts units (KLOC → FP, 人時 → 人月) and defaults unmapped factors to L0', () => {
    const r = validateRows([['A', '8.6', '3120']], ['name', 'size', 'effort'], { ...opts, sizeUnit: 'KLOC', effortUnit: 'hours' });
    expect(r[0]).toMatchObject({ ok: true, sizeFP: 860, effortMM: 19.5 });
    expect(Object.values(r[0]!.levels).every((v) => v === 0)).toBe(true);
    const sc = validateRows([['B', '10', '1']], ['name', 'size', 'effort'], { ...opts, sizeUnit: 'screen', units: { fpPerKloc: 100, fpPerScreen: 25, hoursPerMM: 150 } });
    expect(sc[0]!.sizeFP).toBe(250);
  });

  it('rejects non-numeric and non-positive size / effort', () => {
    const r = validateRows([['A', 'abc', '0']], ['name', 'size', 'effort'], opts);
    expect(r[0]!.issues.map((i) => i.code)).toEqual(['size-invalid', 'effort-invalid']);
  });
});
