import { describe, expect, it } from 'vitest';
import { actorName, parseLimit } from './audit';

describe('audit route helpers', () => {
  it('limit を 1〜50 に丸める', () => {
    expect(parseLimit(undefined)).toBe(10);
    expect(parseLimit('abc')).toBe(10);
    expect(parseLimit('0')).toBe(1);
    expect(parseLimit('5.7')).toBe(5);
    expect(parseLimit('999')).toBe(50);
  });
  it('メールアドレスをそのまま返さない', () => {
    const names = new Map([['admin@example.com', 'K. Cai']]);
    expect(actorName('admin@example.com', names)).toBe('K. Cai');
    expect(actorName('someone@example.com', names)).toBe('someone');
    expect(actorName('anonymous', names)).toBe('anonymous');
  });
});
