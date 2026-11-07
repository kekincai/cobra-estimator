// CSV 実績取り込み（IMPLEMENTATION_BRIEF.md §3.2）: 解析・見出しからの列推定・行の検証。
import { DEFAULT_UNITS, toFP, toMM, type UnitFactors } from 'cobra-core';
import { factorNo } from '../../ui/format';

/** RFC 4180 風の CSV 解析（"…" 内のカンマ・改行・"" に対応）。区切りは , またはタブ（1 行目で判定）。空行は捨てる。 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const delim = firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export interface CsvFactor {
  id: string;
  no: number;
  name: string;
}

/** 登録する項目。level:<要因ID> は要因ごと。 */
export type TargetKey = 'name' | 'size' | 'effort' | `level:${string}` | 'note' | 'skip';
export const REQUIRED: TargetKey[] = ['name', 'size', 'effort'];

export function targetOptions(factors: CsvFactor[]): { key: TargetKey; label: string }[] {
  return [
    { key: 'name', label: 'プロジェクト名' },
    { key: 'size', label: '規模' },
    { key: 'effort', label: '工数' },
    ...factors.map((f) => ({ key: `level:${f.id}` as TargetKey, label: `要因 ${factorNo(f.no)} レベル` })),
    { key: 'note', label: '備考' },
    { key: 'skip', label: '取り込まない' },
  ];
}

export type SizeUnit = 'FP' | 'KLOC' | 'screen';
export type EffortUnit = 'MM' | 'hours';

const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s_\-()[\]（）・.:：]/g, '');

/** 見出し名から列の対応を推定する。単位が見出しに書かれていれば単位も返す。 */
export function guessMapping(headers: string[], factors: CsvFactor[]): { map: TargetKey[]; sizeUnit?: SizeUnit; effortUnit?: EffortUnit } {
  const used = new Set<TargetKey>();
  let sizeUnit: SizeUnit | undefined;
  let effortUnit: EffortUnit | undefined;
  const byName = new Map(factors.map((f) => [norm(f.name), f]));
  const byNo = new Map(factors.map((f) => [f.no, f]));
  const pick = (h: string): TargetKey => {
    const n = norm(h);
    if (/^(name|projectname|project|pj|pjname|プロジェクト名?|案件名?|名称|名前|件名)$/.test(n)) return 'name';
    if (/kloc/.test(n)) return (sizeUnit = 'KLOC'), 'size';
    if (/画面/.test(n)) return (sizeUnit = 'screen'), 'size';
    if (/^(fp|size|sizefp|規模|規模fp|ファンクションポイント)$/.test(n)) return (sizeUnit = 'FP'), 'size';
    if (/(人時|時間|hours?|^h$|^mh$)/.test(n)) return (effortUnit = 'hours'), 'effort';
    if (/^(mm|effort|effortmm|工数|工数人月|人月|実績工数)$/.test(n)) return (effortUnit = 'MM'), 'effort';
    if (/^(note|notes|備考|メモ|comment|コメント)$/.test(n)) return 'note';
    const m = /^(?:f|l|factor|要因|level|レベル)(\d{1,2})(?:レベル|level)?$/.exec(n);
    if (m) {
      const f = byNo.get(Number(m[1]));
      if (f) return `level:${f.id}`;
    }
    const f = byName.get(n);
    if (f) return `level:${f.id}`;
    return 'skip';
  };
  const map = headers.map((h) => {
    const k = pick(h);
    if (k === 'skip' || used.has(k)) return 'skip';
    used.add(k);
    return k;
  });
  return { map, sizeUnit, effortUnit };
}

export interface MappingCheck {
  missing: TargetKey[];
  duplicates: TargetKey[];
  ok: boolean;
}

export function checkMapping(map: TargetKey[]): MappingCheck {
  const seen = new Map<TargetKey, number>();
  for (const k of map) if (k !== 'skip') seen.set(k, (seen.get(k) ?? 0) + 1);
  const missing = REQUIRED.filter((k) => !seen.has(k));
  const duplicates = [...seen].filter(([, n]) => n > 1).map(([k]) => k);
  return { missing, duplicates, ok: missing.length === 0 && duplicates.length === 0 };
}

export type IssueCode = 'name-blank' | 'size-blank' | 'size-invalid' | 'effort-blank' | 'effort-invalid' | 'level-blank' | 'level-range' | 'dup-existing' | 'dup-file';

export interface RowIssue {
  code: IssueCode;
  message: string;
  /** レベル値の不正値など */
  value?: string;
  /** dup-existing のとき既存プロジェクトの ID */
  existingId?: string;
}

export interface CsvRow {
  /** CSV 上の行番号（見出し = 1） */
  line: number;
  name: string;
  sizeRaw: string;
  effortRaw: string;
  sizeFP: number | null;
  effortMM: number | null;
  /** 要因 ID → レベル（正しく読めたもののみ） */
  levels: Record<string, number>;
  /** 要因順（factors の順）の生の値。列が無い要因は '' */
  levelsRaw: string[];
  note: string;
  issues: RowIssue[];
  ok: boolean;
}

export interface ValidateOptions {
  factors: CsvFactor[];
  sizeUnit: SizeUnit;
  effortUnit: EffortUnit;
  units?: UnitFactors;
  existing: { id: string; name: string }[];
}

const parseNum = (s: string): number | null => {
  const t = s.normalize('NFKC').replace(/[,\s]/g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

/** 見出し行を除いたデータ行を検証する。列が無い要因は L0。 */
export function validateRows(rows: string[][], map: TargetKey[], o: ValidateOptions): CsvRow[] {
  const col = (k: TargetKey) => map.indexOf(k);
  const iName = col('name');
  const iSize = col('size');
  const iEff = col('effort');
  const iNote = col('note');
  const units = o.units ?? DEFAULT_UNITS;
  const existing = new Map(o.existing.map((p) => [p.name.trim(), p.id]));
  const nameCount = new Map<string, number>();
  for (const r of rows) {
    const n = (r[iName] ?? '').trim();
    if (n) nameCount.set(n, (nameCount.get(n) ?? 0) + 1);
  }

  return rows.map((r, idx) => {
    const issues: RowIssue[] = [];
    const get = (i: number) => (i < 0 ? '' : (r[i] ?? '').trim());
    const name = get(iName);
    if (!name) issues.push({ code: 'name-blank', message: '名前が空' });

    const sizeRaw = get(iSize);
    const sv = parseNum(sizeRaw);
    let sizeFP: number | null = null;
    if (sv == null) issues.push({ code: 'size-blank', message: '規模が空' });
    else if (Number.isNaN(sv) || sv <= 0) issues.push({ code: 'size-invalid', message: `規模 ${sizeRaw} が不正`, value: sizeRaw });
    else sizeFP = toFP(sv, o.sizeUnit, units);

    const effortRaw = get(iEff);
    const ev = parseNum(effortRaw);
    let effortMM: number | null = null;
    if (ev == null) issues.push({ code: 'effort-blank', message: '工数が空' });
    else if (Number.isNaN(ev) || ev <= 0) issues.push({ code: 'effort-invalid', message: `工数 ${effortRaw} が不正`, value: effortRaw });
    else effortMM = toMM(ev, o.effortUnit === 'hours' ? 'hours' : 'MM', units);

    const levels: Record<string, number> = {};
    const levelsRaw = o.factors.map((f) => {
      const i = col(`level:${f.id}`);
      if (i < 0) {
        levels[f.id] = 0;
        return '';
      }
      const raw = get(i);
      const t = raw.normalize('NFKC').replace(/^l/i, '');
      if (t === '') issues.push({ code: 'level-blank', message: `要因 ${factorNo(f.no)} のレベル値が空` });
      else if (!/^-?\d+$/.test(t) || Number(t) < 0 || Number(t) > 3) issues.push({ code: 'level-range', message: `レベル値 ${raw} は範囲外`, value: raw });
      else levels[f.id] = Number(t);
      return raw;
    });

    if (name) {
      const ex = existing.get(name);
      if (ex) issues.push({ code: 'dup-existing', message: '既存と同名', existingId: ex });
      else if ((nameCount.get(name) ?? 0) > 1) issues.push({ code: 'dup-file', message: 'CSV 内で同名' });
    }

    return { line: idx + 2, name, sizeRaw, effortRaw, sizeFP, effortMM, levels, levelsRaw, note: get(iNote), issues, ok: issues.length === 0 };
  });
}

/** 問題の種類ごとの件数（右側の集計用） */
export function summarize(rows: CsvRow[]) {
  const by = (codes: IssueCode[]) => rows.filter((r) => r.issues.some((i) => codes.includes(i.code)));
  return {
    ok: rows.filter((r) => r.ok),
    effortBlank: by(['effort-blank', 'effort-invalid']),
    levelRange: by(['level-range', 'level-blank']),
    duplicate: by(['dup-existing', 'dup-file']),
    other: by(['name-blank', 'size-blank', 'size-invalid']),
  };
}
