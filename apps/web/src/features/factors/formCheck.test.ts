import { describe, expect, it } from 'vitest';
import { SEED_FACTORS } from 'cobra-core/seed';
import type { FactorRow } from '../../../shared/types';
import { checkDraft, draftFromRow, isDraftDirty, patchFromDraft, triOf, AVERAGE } from './draft';
import { checkNewFactor, errorsFromIssues, fieldOfIssuePath, type NewFactorDraft } from './formCheck';

const existing = [
  { id: 'F01', name: '要件の安定性', no: 1 },
  { id: 'F03', name: '開発者のスキル', no: 3 },
];

const valid = (): NewFactorDraft => ({
  name: '新しい要因',
  cat: 'プロダクト',
  def: '何を測るか',
  levels: ['a', 'b', 'c', 'd'],
  kind: 'direct',
  targetFactorId: '',
  experts: [
    { name: 'S.T.', best: '10', likely: '30', worst: '80' },
    { name: 'Y.T.', best: '10', likely: '25', worst: '70' },
  ],
});

describe('checkNewFactor', () => {
  it('すべて埋まっていれば ok', () => {
    const c = checkNewFactor(valid(), existing);
    expect(c.ok).toBe(true);
    expect(c.first).toBeNull();
    expect(c.checks.every((x) => x.state === 'ok')).toBe(true);
  });
  it('全角数字は正しい値として通る', () => {
    const f = valid();
    f.experts[0] = { name: 'S.T.', best: '１０', likely: '２０', worst: '３０' };
    expect(checkNewFactor(f, existing).ok).toBe(true);
  });
  it('名称の重複は名称欄のエラーで、番号を含む', () => {
    const f = { ...valid(), name: ' 開発者のスキル ' };
    const c = checkNewFactor(f, existing);
    expect(c.ok).toBe(false);
    expect(c.first).toBe('name');
    expect(c.errors.name).toContain('同じ名称');
    expect(c.errors.name).toContain('03');
    expect(c.duplicateOf).toBe('開発者のスキル');
    expect(c.checks.find((x) => x.key === 'name')!.state).toBe('error');
  });
  it('未入力は画面の並び順で最初の欄を返す', () => {
    const f = { ...valid(), def: '', levels: ['a', '', 'c', ''] as NewFactorDraft['levels'] };
    const c = checkNewFactor(f, existing);
    expect(c.first).toBe('def');
    expect(Object.keys(c.errors)).toEqual(['def', 'level-1', 'level-3']);
    expect(c.checks.find((x) => x.key === 'levels')!.field).toBe('level-1');
  });
  it('三角分布: 負・非数値・空・順序をそれぞれの欄へ', () => {
    const f = valid();
    f.experts = [
      { name: 'S.T.', best: '-10', likely: 'abc', worst: '１００' },
      { name: 'Y.T.', best: '50', likely: '20', worst: '60' },
      { name: 'Z', best: '', likely: '', worst: '' },
    ];
    const c = checkNewFactor(f, existing);
    expect(c.errors['exp-0-b']).toContain('0 以上');
    expect(c.errors['exp-0-l']).toContain('数値');
    expect(c.errors['exp-0-w']).toBeUndefined();
    expect(c.errors['exp-1-row']).toContain('Y.T.: 最良 (50) が 最頻 (20)');
    expect(c.errors['exp-2-b']).toBe('値を入力してください');
    expect(c.first).toBe('exp-0-b');
    expect(c.checks.find((x) => x.key === 'tri')!.state).toBe('error');
  });
  it('担当者名の空・重複', () => {
    const f = valid();
    f.experts[1]!.name = 'S.T.';
    expect(checkNewFactor(f, existing).errors['exp-1-name']).toContain('同じ担当者名');
    f.experts[1]!.name = ' ';
    expect(checkNewFactor(f, existing).errors['exp-1-name']).toContain('入力');
  });
  it('担当者 0 人はエラー', () => {
    const c = checkNewFactor({ ...valid(), experts: [] }, existing);
    expect(c.ok).toBe(false);
    expect(c.errors.experts).toBeDefined();
  });
  it('間接要因は対象が必要。選択肢がないときはエラー', () => {
    const f = { ...valid(), kind: 'indirect' as const };
    expect(checkNewFactor(f, existing).errors.target).toContain('選んで');
    expect(checkNewFactor(f, existing, 0).errors.target).toContain('ありません');
    expect(checkNewFactor({ ...f, targetFactorId: 'F01' }, existing).ok).toBe(true);
  });
});

describe('サーバーの issues → 欄', () => {
  it('path を欄 ID に対応させる', () => {
    expect(fieldOfIssuePath('name')).toBe('name');
    expect(fieldOfIssuePath('definition')).toBe('def');
    expect(fieldOfIssuePath('levels.2')).toBe('level-2');
    expect(fieldOfIssuePath('triangles.1.best')).toBe('exp-1-b');
    expect(fieldOfIssuePath('triangles.0.likely')).toBe('exp-0-l');
    expect(fieldOfIssuePath('triangles.3.worst')).toBe('exp-3-w');
    expect(fieldOfIssuePath('triangles.1.expert')).toBe('exp-1-name');
    expect(fieldOfIssuePath('targetFactorId')).toBe('target');
    expect(fieldOfIssuePath('category')).toBeNull();
  });
  it('英語の文は日本語の一般文に置き換える。最初の 1 件だけ残す', () => {
    const e = errorsFromIssues([
      { path: 'name', message: '「A」は既にモデルにあります。' },
      { path: 'name', message: 'second' },
      { path: 'levels.0', message: 'Too small: expected string' },
      { path: 'unknown', message: 'x' },
    ]);
    expect(e).toEqual({ name: '「A」は既にモデルにあります。', 'level-0': 'この項目の値を確認してください' });
  });
});

const row = (i: number) => SEED_FACTORS[i]! as unknown as FactorRow;

describe('詳細の下書き', () => {
  it('保存値から作った下書きは未保存扱いにならない（全 seed 要因）', () => {
    for (const f of SEED_FACTORS) expect(isDraftDirty(draftFromRow(f as unknown as FactorRow), f as unknown as FactorRow)).toBe(false);
    expect(isDraftDirty(undefined, row(0))).toBe(false);
  });
  it('変更すると未保存、元に戻すと未保存でない', () => {
    const d = draftFromRow(row(0));
    d.tris[0]!.b = '11';
    expect(isDraftDirty(d, row(0))).toBe(true);
    d.tris[0]!.b = draftFromRow(row(0)).tris[0]!.b;
    expect(isDraftDirty(d, row(0))).toBe(false);
    expect(isDraftDirty({ ...d, definition: 'x' }, row(0))).toBe(true);
  });
  it('定義だけ変えて保存しても三角分布の値は 1 ビットも変わらない（全 seed 要因）', () => {
    for (const f of SEED_FACTORS) {
      const r = f as unknown as FactorRow;
      const p = patchFromDraft({ ...draftFromRow(r), definition: 'x' }, r, f.kind === 'indirect')!;
      expect(p.triangles).toEqual(f.triangles);
    }
  });
  it('0.1% 未満の桁を持つ値も、触らなければそのまま送る', () => {
    const r = { ...row(0), triangles: [{ expert: 'A', best: 0.12345, likely: 0.2, worst: 0.33333 }] };
    const p = patchFromDraft(draftFromRow(r), r, false)!;
    expect(p.triangles[0]).toEqual({ expert: 'A', best: 0.12345, likely: 0.2, worst: 0.33333 });
  });
  it('全角で入れ直した値は数値として送る', () => {
    const r = row(0);
    const d = draftFromRow(r);
    d.tris[0] = { ...d.tris[0]!, b: '５', l: '１５．５', w: '４０' };
    const p = patchFromDraft(d, r, false)!;
    expect(p.triangles[0]).toMatchObject({ best: 0.05, likely: 0.155, worst: 0.4 });
  });
  it('不正な入力があれば送らない（null）、エラーは欄ごと', () => {
    const r = row(0);
    const d = draftFromRow(r);
    d.tris[1] = { ...d.tris[1]!, l: '-5' };
    expect(patchFromDraft(d, r, false)).toBeNull();
    const c = checkDraft(d, false);
    expect(c.first).toBe('exp-1-l');
    d.tris[1] = { ...d.tris[1]!, l: '90' };
    expect(checkDraft(d, false).errors['exp-1-row']).toContain('最頻');
  });
  it('間接要因は対象が必要', () => {
    const r = row(1); // 02 顧客の関与度（間接）
    expect(checkDraft({ ...draftFromRow(r), targetFactorId: null }, true).errors.target).toBeDefined();
    expect(patchFromDraft(draftFromRow(r), r, true)).toMatchObject({ targetFactorId: 'F01' });
  });
  it('triOf: 担当者の値 / 平均 / 不正なら null', () => {
    const d = draftFromRow(row(1)); // .10/.20/.30 と .12/.18/.28
    expect(triOf(d, 'S.T.')).toEqual([10, 20, 30]);
    expect(triOf(d, AVERAGE)).toEqual([11, 19, 29]);
    d.tris[1]!.w = 'x';
    expect(triOf(d, 'S.T.')).toEqual([10, 20, 30]);
    expect(triOf(d, AVERAGE)).toBeNull();
  });
});
