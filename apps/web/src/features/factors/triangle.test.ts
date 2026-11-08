import { describe, expect, it } from 'vitest';
import { SEED_FACTORS } from 'cobra-core/seed';
import { STANDARD_FACTORS } from './standard';
import { averageTri, checkTri, fmtMultiplier, fromPct, pctProblem, ratioOf, toPct, triValues } from './triangle';

describe('fromPct（入力 % → 数値）', () => {
  it('半角の整数・小数', () => {
    expect(fromPct('10')).toBe(10);
    expect(fromPct('12.5')).toBe(12.5);
    expect(fromPct('0')).toBe(0);
    expect(fromPct('0.0')).toBe(0);
    expect(fromPct('.5')).toBe(0.5);
    expect(fromPct('5.')).toBe(5);
    expect(fromPct(' 30 ')).toBe(30);
  });
  it('全角数字・全角小数点・全角 % を半角として読む（以前は 0 になっていた）', () => {
    expect(fromPct('１０')).toBe(10);
    expect(fromPct('２０')).toBe(20);
    expect(fromPct('１２．５')).toBe(12.5);
    expect(fromPct('３０％')).toBe(30);
    expect(fromPct('30%')).toBe(30);
    expect(fromPct('　４０　')).toBe(40);
  });
  it('負の値は null（以前は符号が消えて 10 になっていた）', () => {
    expect(fromPct('-10')).toBeNull();
    expect(fromPct('－１０')).toBeNull();
    expect(fromPct('−10')).toBeNull();
    expect(fromPct('ー10')).toBeNull();
  });
  it('空・数値でない入力は null（以前は 0 になっていた）', () => {
    expect(fromPct('')).toBeNull();
    expect(fromPct('   ')).toBeNull();
    expect(fromPct('abc')).toBeNull();
    expect(fromPct('10abc')).toBeNull();
    expect(fromPct('1.2.3')).toBeNull();
    expect(fromPct('1e3')).toBeNull();
    expect(fromPct('.')).toBeNull();
    expect(fromPct('%')).toBeNull();
  });
  it('+ 記号は許す', () => {
    expect(fromPct('+20')).toBe(20);
  });
});

describe('pctProblem（欄ごとのエラー種別）', () => {
  it('正しい値は null', () => {
    expect(pctProblem('0')).toBeNull();
    expect(pctProblem('１５')).toBeNull();
  });
  it('空・数値でない・負を区別する', () => {
    expect(pctProblem('')).toBe('empty');
    expect(pctProblem('　')).toBe('empty');
    expect(pctProblem('abc')).toBe('nan');
    expect(pctProblem('-5')).toBe('negative');
    expect(pctProblem('－５')).toBe('negative');
    expect(pctProblem('-0')).toBeNull(); // -0 は 0 として扱う
  });
});

describe('checkTri（0 ≤ 最良 ≤ 最頻 ≤ 最悪）', () => {
  it('正しい並び（等号を含む）は ok', () => {
    expect(checkTri({ b: '10', l: '30', w: '80' }).ok).toBe(true);
    expect(checkTri({ b: '0', l: '0', w: '0' }).ok).toBe(true);
    expect(checkTri({ b: '20', l: '20', w: '20' }).ok).toBe(true);
    expect(checkTri({ b: '１０', l: '２０', w: '３０' }).ok).toBe(true);
  });
  it('全角で入れた値も数値どおりに検査する', () => {
    const c = checkTri({ b: '１０', l: '２０', w: '３０' });
    expect(c.nums).toEqual([10, 20, 30]);
    expect(triValues(c)).toEqual([10, 20, 30]);
  });
  it('最良 > 最頻 は順序エラー（どの欄か、値を文に含める）', () => {
    const c = checkTri({ b: '50', l: '20', w: '60' }, 'S.T.');
    expect(c.ok).toBe(false);
    expect(c.order).toContain('S.T.');
    expect(c.order).toContain('最良 (50) が 最頻 (20)');
    expect(triValues(c)).toBeNull();
  });
  it('最頻 > 最悪 は順序エラー', () => {
    const c = checkTri({ b: '10', l: '70', w: '60' });
    expect(c.order).toContain('最頻 (70) が 最悪 (60)');
  });
  it('境界: 小数の大小', () => {
    expect(checkTri({ b: '10.1', l: '10.1', w: '10.2' }).ok).toBe(true);
    expect(checkTri({ b: '10.2', l: '10.1', w: '10.3' }).ok).toBe(false);
  });
  it('解釈できない欄は欄ごとのエラーになり、順序の判定はしない', () => {
    const c = checkTri({ b: '-10', l: 'abc', w: '１００' });
    expect(c.ok).toBe(false);
    expect(c.field.b).toBe('0 以上の値を入力してください');
    expect(c.field.l).toContain('数値で入力');
    expect(c.field.w).toBeUndefined();
    expect(c.order).toBeNull();
    expect(c.nums).toEqual([null, null, 100]);
  });
  it('空欄はエラー（以前は 0 として保存できた）', () => {
    const c = checkTri({ b: '', l: '', w: '' });
    expect(c.ok).toBe(false);
    expect(Object.keys(c.field)).toEqual(['b', 'l', 'w']);
  });
});

describe('ratioOf（入力 % → 保存値）と往復', () => {
  it('% を割合へ', () => {
    expect(ratioOf('26')).toBe(0.26);
    expect(ratioOf('１２．５')).toBe(0.125);
    expect(ratioOf('abc')).toBeNull();
    expect(ratioOf('-1')).toBeNull();
  });
  it('表示を変えていなければ元の値をそのまま返す（細かい桁を書き換えない）', () => {
    expect(ratioOf(String(toPct(0.12345)), 0.12345)).toBe(0.12345);
    expect(ratioOf('12.3', 0.12345)).toBe(0.12345);
    // 変えたら入力どおり
    expect(ratioOf('12.4', 0.12345)).toBe(0.124);
  });
  it('0.1% 単位の値は toPct → 文字列 → ratioOf で完全に戻る（0〜300%）', () => {
    for (let k = 0; k <= 3000; k++) {
      const x = k / 1000;
      expect(ratioOf(String(toPct(x)), x)).toBe(x);
      // 元の値を渡さない（新規入力）場合も同じ値になる
      expect(fromPct(String(toPct(x)))! / 100).toBeCloseTo(x, 12);
    }
  });
  it('seed と標準カタログの全三角分布が往復で変わらない', () => {
    for (const f of SEED_FACTORS) {
      for (const t of f.triangles) {
        for (const v of [t.best, t.likely, t.worst]) expect(ratioOf(String(toPct(v)), v)).toBe(v);
      }
    }
    for (const s of STANDARD_FACTORS) for (const v of s.tri) expect(ratioOf(String(v))).toBe(v / 100);
  });
  it('toPct は 0.1% 単位に丸める（x.x5 の境界）', () => {
    expect(toPct(0.26)).toBe(26);
    expect(toPct(0)).toBe(0);
    expect(toPct(0.1234)).toBe(12.3);
    expect(toPct(0.1235)).toBe(12.4);
    expect(toPct(1)).toBe(100);
  });
});

describe('averageTri（担当者の平均・表示用）', () => {
  it('2 人の平均を 0.1% 単位で', () => {
    expect(averageTri([[10, 20, 30], [12, 18, 28]])).toEqual([11, 19, 29]);
    expect(averageTri([[10, 25, 70], [11, 25, 75]])).toEqual([10.5, 25, 72.5]);
    expect(averageTri([[1, 1, 1], [1, 2, 2], [1, 2, 2]])).toEqual([1, 1.7, 1.7]);
  });
  it('1 人ならその値、0 人なら null', () => {
    expect(averageTri([[5, 6, 7]])).toEqual([5, 6, 7]);
    expect(averageTri([])).toBeNull();
  });
});

describe('fmtMultiplier', () => {
  it('k = 0.225 の L1〜L3 の倍率', () => {
    expect(fmtMultiplier(1 + 0.225 * (1 / 3))).toBe('×1.075');
    expect(fmtMultiplier(1 + 0.225 * (2 / 3))).toBe('×1.15');
    expect(fmtMultiplier(1 + 0.225)).toBe('×1.225');
    expect(fmtMultiplier(1)).toBe('×1.00');
  });
  it('4 桁目で丸める・非数は —', () => {
    expect(fmtMultiplier(1.2344)).toBe('×1.234');
    expect(fmtMultiplier(1.2345)).toBe('×1.235');
    expect(fmtMultiplier(NaN)).toBe('—');
  });
});
