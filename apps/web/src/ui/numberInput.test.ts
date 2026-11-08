import { describe, expect, it } from 'vitest';
import { parseNumberInput, toHalfWidth } from './numberInput';

describe('numberInput', () => {
  it('全角数字・記号を半角にする', () => {
    expect(toHalfWidth('１２．５')).toBe('12.5');
    expect(toHalfWidth('－１０')).toBe('-10');
    expect(toHalfWidth('1,200')).toBe('1200');
  });
  it('全角でも正しく解釈する', () => {
    expect(parseNumberInput('１０')).toBe(10);
    expect(parseNumberInput('２０％')).toBe(20);
    expect(parseNumberInput(' 30 ')).toBe(30);
  });
  it('不正な入力は 0 ではなく null', () => {
    expect(parseNumberInput('abc')).toBeNull();
    expect(parseNumberInput('')).toBeNull();
    expect(parseNumberInput('1.2.3')).toBeNull();
    expect(parseNumberInput('10abc')).toBeNull();
  });
  it('負数は既定で拒否、許可すれば通す', () => {
    expect(parseNumberInput('-10')).toBeNull();
    expect(parseNumberInput('−10', { allowNegative: true })).toBe(-10);
  });
});
