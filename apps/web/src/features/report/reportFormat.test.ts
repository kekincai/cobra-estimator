import { describe, expect, it } from 'vitest';
import type { GenerationRow } from '../../../shared/types';
import { EXCEED_NOTE, exceedLabel, exceedPct, exceedWithP } from '../../ui/percentile';
import { displayDelta, fmtSigned } from '../../ui/format';
import { exceedRow, fmtBudget, pOfExceed, pct0, reportTitle, resolveReportGen } from './reportFormat';

// テストに必要な列だけ持つ世代（GenerationRow として扱う）
const gens = [
  { id: 'g1', label: 'G1', name: '初回' },
  { id: 'g2', label: 'G2', name: '案A' },
  { id: 'g3', label: 'G3', name: '案B (外部連携あり)' },
] as unknown as GenerationRow[];

describe('resolveReportGen', () => {
  it('?gen が無ければ reportGenerationId の世代', () => {
    expect(resolveReportGen(gens, null, 'g2')).toEqual({ gen: gens[1], missing: false });
    expect(resolveReportGen(gens, '', 'g2')).toEqual({ gen: gens[1], missing: false });
  });
  it('reportGenerationId も無ければ最新', () => {
    expect(resolveReportGen(gens, undefined, null).gen).toBe(gens[2]);
    expect(resolveReportGen(gens, undefined, 'gone').gen).toBe(gens[2]);
  });
  it('?gen=G2 は label で選ぶ（大小文字・前後空白は無視）', () => {
    expect(resolveReportGen(gens, 'G2', 'g3')).toEqual({ gen: gens[1], missing: false });
    expect(resolveReportGen(gens, ' g1 ', 'g3')).toEqual({ gen: gens[0], missing: false });
  });
  it('見つからない label は既定に戻して missing', () => {
    expect(resolveReportGen(gens, 'G9', 'g1')).toEqual({ gen: gens[0], missing: true });
    expect(resolveReportGen(gens, 'abc', 'g1')).toEqual({ gen: gens[0], missing: true });
  });
  it('世代 0 件', () => {
    expect(resolveReportGen([], 'G1', null)).toEqual({ gen: null, missing: true });
    expect(resolveReportGen([], null, null)).toEqual({ gen: null, missing: false });
  });
});

describe('reportTitle', () => {
  it('見積り名の前半 + 世代名', () => {
    expect(reportTitle('顧客ポータル刷新 — 案B (外部連携あり)', '案A')).toEqual({ base: '顧客ポータル刷新', variant: '案A' });
    expect(reportTitle('顧客ポータル刷新 — 案B (外部連携あり)', '案B (外部連携あり)')).toEqual({
      base: '顧客ポータル刷新',
      variant: '案B (外部連携あり)',
    });
  });
  it('ダッシュが無い見積り名', () => {
    expect(reportTitle('新規見積り', '初回')).toEqual({ base: '新規見積り', variant: '初回' });
  });
  it('世代名が空なら見積り名そのまま', () => {
    expect(reportTitle('顧客ポータル刷新 — 案B', '')).toEqual({ base: '顧客ポータル刷新 — 案B', variant: null });
    expect(reportTitle('顧客ポータル刷新 — 案B', '  ')).toEqual({ base: '顧客ポータル刷新 — 案B', variant: null });
    expect(reportTitle('顧客ポータル刷新', null)).toEqual({ base: '顧客ポータル刷新', variant: null });
  });
  it('見積り名の前半が空なら世代名だけ', () => {
    expect(reportTitle(' — 旧名', '案A')).toEqual({ base: '案A', variant: null });
  });
});

describe('レポートの差分表示（ui/format の displayDelta + fmtSigned）', () => {
  // レポートの「予算 45 との差」列と推奨文は表示値どうしの差を出す
  it('予算との差（49.94 vs 45 → 49.9 − 45 = +4.9）', () => {
    expect(fmtSigned(displayDelta(49.94, 45))).toBe('+4.9');
    expect(fmtSigned(displayDelta(43.86, 45))).toBe('−1.1');
    expect(fmtSigned(displayDelta(45.04, 45))).toBe('±0.0');
  });
  it('生の差を丸めた値とは違う場合（43.94 − 33.46 → +10.4）', () => {
    expect(fmtSigned(displayDelta(43.94, 33.46))).toBe('+10.4');
    expect((43.94 - 33.46).toFixed(1)).toBe('10.5');
  });
  it('予算が端数（45.55 は表示 45.5 / 45.6 のどちらとも整合）', () => {
    expect(fmtBudget(45.55)).toBe(Number((45.55).toFixed(1)).toString());
    expect(fmtSigned(displayDelta(49.9, 45.55))).toBe(`+${(49.9 - Number((45.55).toFixed(1))).toFixed(1)}`);
  });
});

describe('fmtBudget', () => {
  it('整数は小数点なし、端数は 1 桁', () => {
    expect(fmtBudget(45)).toBe('45');
    expect(fmtBudget(45.5)).toBe('45.5');
    expect(fmtBudget(45.04)).toBe('45');
    expect(fmtBudget(0)).toBe('0');
  });
});

describe('P 値と超過確率の対応', () => {
  it('P80 ↔ 超過確率 20%（percentile.ts）', () => {
    expect(exceedPct(80)).toBe(20);
    expect(exceedPct(50)).toBe(50);
    expect(exceedPct(95)).toBe(5);
    expect(exceedPct(5)).toBe(95);
    expect(exceedLabel(80)).toBe('超過確率 20%');
    expect(exceedWithP(80)).toBe('超過確率 20%・P80');
    expect(EXCEED_NOTE).toContain('P80（超過確率 20%）');
  });
  it('超過確率 → P 値は逆写像', () => {
    for (const q of [5, 10, 20, 30, 50, 80, 95]) {
      expect(pOfExceed(q)).toBe(100 - q);
      expect(exceedPct(pOfExceed(q))).toBe(q);
    }
    expect(pOfExceed(0)).toBe(100);
    expect(pOfExceed(100)).toBe(0);
  });
  it('表の行ラベル', () => {
    expect(exceedRow(20)).toEqual({ main: '20%', p: 'P80' });
    expect(exceedRow(50)).toEqual({ main: '50%', p: 'P50' });
    expect(exceedRow(5)).toEqual({ main: '5%', p: 'P95' });
  });
});

describe('pct0', () => {
  it('確率 → 整数 %', () => {
    expect(pct0(0.434)).toBe(43);
    expect(pct0(0.435)).toBe(44);
    expect(pct0(0)).toBe(0);
    expect(pct0(1)).toBe(100);
    expect(pct0(Number.NaN)).toBeNull();
  });
});
