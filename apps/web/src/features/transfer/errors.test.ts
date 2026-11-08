import { describe, expect, it } from 'vitest';
import { describeJsonSyntaxError, describePath, describeXmlSyntaxError, lineColAt, sniffFileKind, wrongFileForCsv, wrongFileForJson } from './errors';
import { parseModelJson, validateModelFile } from './schema';
import { parseLegacyXml } from './xml';

const factor = (no: number, name: string, extra: Record<string, unknown> = {}) => ({ no, name, category: 'プロダクト', kind: 'direct', origin: 'custom', definition: '', levels: ['a', 'b', 'c', 'd'], ...extra });
const file = (extra: Record<string, unknown> = {}) => ({ format: 'estima-model/1', model: { name: 'm' }, factors: [factor(1, '要件の安定性'), factor(2, '顧客の関与度')], ...extra });
const hasEnglishInternals = (s: string) => /factors\.\d|triangles\.\d|Invalid input|expected \w+|received|Unexpected token|is not valid JSON|position \d/.test(s);

describe('sniffFileKind', () => {
  it('中身を優先して JSON / XML / CSV を見分ける', () => {
    expect(sniffFileKind('a.json', '{"format":1}')).toBe('json');
    expect(sniffFileKind('a.csv', '﻿  [1,2]')).toBe('json');
    expect(sniffFileKind('a.txt', '<?xml version="1.0"?><CoBRAModel/>')).toBe('xml');
    expect(sniffFileKind('projects.json', 'name,fp,mm\nA,1,2')).toBe('csv');
    expect(sniffFileKind('x.tsv', 'name\tfp\nA\t1')).toBe('csv');
  });
  it('中身で決まらなければ拡張子、どちらも無ければ unknown', () => {
    expect(sniffFileKind('a.csv', 'name')).toBe('csv');
    expect(sniffFileKind('a.json', 'hello')).toBe('json');
    expect(sniffFileKind('readme', 'hello')).toBe('unknown');
    expect(sniffFileKind('empty.bin', '')).toBe('unknown');
  });
});

describe('タブ違いのファイル', () => {
  it('JSON タブに CSV → CSV タブへ案内', () => {
    const r = wrongFileForJson('projects.csv', 'name,fp,mm\nA,1,2');
    expect(r?.suggestTab).toBe('csv');
    expect(r?.errors[0]).toMatch(/CSV ファイルのようです（1 行目が「name,fp,mm」）/);
    expect(r?.hint).toMatch(/「CSV で実績を取り込む」タブで取り込んでください/);
  });
  it('JSON タブに JSON / XML は通す。正体不明は Estima のファイルを案内', () => {
    expect(wrongFileForJson('a.json', '{}')).toBeNull();
    expect(wrongFileForJson('a.xml', '<a/>')).toBeNull();
    const u = wrongFileForJson('memo', 'こんにちは');
    expect(u?.suggestTab).toBeUndefined();
    expect(u?.hint).toMatch(/JSON を書き出す/);
  });
  it('CSV タブに JSON / XML → JSON タブへ案内', () => {
    expect(wrongFileForCsv('estima-model-v3.json', '{"format":"estima-model/1"}')).toMatchObject({ suggestTab: 'json', errors: [expect.stringMatching(/^JSON ファイルのようです/)] });
    expect(wrongFileForCsv('legacy.xml', '<CoBRAModel/>')?.errors[0]).toMatch(/^XML ファイルのようです/);
    expect(wrongFileForCsv('a.csv', 'name,fp\nA,1')).toBeNull();
  });
});

describe('JSON の構文エラー', () => {
  it('位置から行・列を出し、英語の原文は出さない', () => {
    expect(lineColAt('ab\ncd', 0)).toEqual({ line: 1, col: 1 });
    expect(lineColAt('ab\ncd', 4)).toEqual({ line: 2, col: 2 });
    expect(lineColAt('ab', 99)).toEqual({ line: 1, col: 3 });
    expect(describeJsonSyntaxError(new SyntaxError("Expected property name or '}' in JSON at position 39 (line 1 column 40)"), '')).toBe('JSON として読めません — 形式が壊れています（1 行目 40 文字目付近）。');
    expect(describeJsonSyntaxError(new SyntaxError('Unexpected token } in JSON at position 4'), '{\n "a"}')).toMatch('2 行目 3 文字目付近');
    expect(describeJsonSyntaxError(new SyntaxError('Unexpected end of JSON input'), '{')).toMatch('途中で終わっています');
    expect(describeJsonSyntaxError(new SyntaxError("Unexpected token 'a', \"name\" is not valid JSON"), 'name')).toBe('JSON として読めません — 形式が壊れています。');
  });
  it('parseModelJson は直し方を付ける', () => {
    const r = parseModelJson('{ "format": ');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]).toMatch(/^JSON として読めません/);
    expect(hasEnglishInternals(r.errors.join())).toBe(false);
    expect(r.hint).toMatch(/閉じ忘れ/);
  });
});

describe('Estima 以外の JSON', () => {
  it('package.json などは項目エラーを並べず 1 行で伝える', () => {
    const r = validateModelFile({ name: 'web', version: '1.0.0' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual(['Estima の書き出したモデルパラメータではありません（format の項目がありません）。']);
    expect(r.hint).toMatch(/JSON を書き出す/);
  });
  it('配列や別の format', () => {
    const a = validateModelFile([1, 2]);
    expect(!a.ok && a.errors[0]).toMatch(/format の項目がありません/);
    const b = validateModelFile({ format: 'estima-model/2' });
    expect(!b.ok && b.errors[0]).toMatch(/format が "estima-model\/2" です。"estima-model\/1" である必要があります/);
  });
});

describe('値のエラーを「何件目のどの項目か」で伝える', () => {
  it('要因は 1 から数え、番号と名前を添える', () => {
    const r = validateModelFile(file({ factors: [factor(1, '要件の安定性', { levels: ['a', 'b'] }), factor(2, '顧客の関与度', { kind: 'both' })] }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]).toBe('要因 1 件目（No.1 「要件の安定性」）のレベル定義: L0〜L3 の定義文を 4 つ並べた配列 ["…", "…", "…", "…"] にしてください');
    expect(r.errors[1]).toBe('要因 2 件目（No.2 「顧客の関与度」）の種類: "direct"（直接要因）か "indirect"（間接要因）を指定してください');
    expect(r.errors.some(hasEnglishInternals)).toBe(false);
    expect(r.hint).toMatch(/件目は 1 から数えます/);
  });
  it('zod 既定の英語メッセージを訳す（欠けている項目・型違い）', () => {
    const r = validateModelFile({ format: 'estima-model/1', factors: [{ ...factor(1, 'A'), name: 3 }] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toContain('モデル情報: ありません。追加してください');
    expect(r.errors).toContain('要因 1 件目（No.1）の名前: 文字列で指定してください');
    expect(r.errors.some(hasEnglishInternals)).toBe(false);
  });
  it('三角分布・実績・関係の場所', () => {
    const r = validateModelFile(
      file({
        triangles: [{ factorNo: 1, expert: 'S.T.', l3: [0.4, 0.2, 'x'] }],
        projects: [{ id: 'PJ-009', sizeFP: 0, effortMM: 2, levels: [1, 7] }],
      }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const msg = r.errors.join('\n');
    expect(msg).toMatch('三角分布 1 件目（要因 No.1・S.T.）の最悪値: 数値で指定してください');
    expect(msg).toMatch('実績 1 件目（PJ-009）の規模: 規模は正の数です');
    expect(msg).toMatch('実績 1 件目（PJ-009）の2 番目の要因のレベル値: レベル値は 0〜3 です');
    expect(hasEnglishInternals(msg)).toBe(false);
  });
  it('describePath の境界: 空・セクションのみ・未知のキー', () => {
    expect(describePath([], {})).toBe('');
    expect(describePath(['relations'], {})).toBe('要因間の関係');
    expect(describePath(['relations', 0, 'directNo'], { relations: [{ indirectNo: 2, directNo: 1 }] })).toBe('要因間の関係 1 件目（2 → 1）の直接要因の番号');
    expect(describePath(['model', 'ci95', 1], {})).toBe('モデル情報の95% 信頼区間の上限');
    expect(describePath(['factors', 0, 'levels', 3], { factors: [] })).toBe('要因 1 件目のL3 の定義文');
    expect(describePath(['foo', 2], null)).toBe('foo 3 件目');
  });
  it('9 件以上は「ほか N 件」にまとめる', () => {
    const fs = Array.from({ length: 10 }, (_, i) => factor(i + 1, `F${i + 1}`, { kind: 'x' }));
    const r = validateModelFile(file({ factors: fs }));
    expect(!r.ok && r.errors).toHaveLength(9);
    expect(!r.ok && r.errors.at(-1)).toBe('ほか 2 件');
  });
});

describe('旧 XML のエラー', () => {
  it('DOMParser の英語は行・列だけ残す', () => {
    expect(describeXmlSyntaxError('This page contains the following errors:error on line 1 at column 35: Opening and ending tag mismatch')).toMatch(/^XML として読めません — 形式が壊れています（1 行目 35 文字目付近）/);
    expect(describeXmlSyntaxError('broken')).not.toMatch(/broken/);
  });
  it('ルート違いは旧版の XML ではないと伝え、直し方を付ける', () => {
    const r = parseLegacyXml('<Model/>', { parseFromString: () => ({ getElementsByTagName: () => [], documentElement: { localName: 'Model' } }) as unknown as Document });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]).toMatch(/旧 Excel 版のモデル XML ではありません/);
    expect(r.hint).toMatch(/CoBRAModel/);
  });
});
