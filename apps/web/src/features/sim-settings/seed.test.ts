import { describe, expect, it } from 'vitest';
import { SEED_ERROR, parseSeed } from './seed';
import { MAX_SEED } from './store';

describe('parseSeed', () => {
  it('整数（半角・全角・前後の空白）', () => {
    expect(parseSeed('20261106')).toEqual({ ok: true, value: 20261106 });
    expect(parseSeed('２０２６')).toEqual({ ok: true, value: 2026 });
    expect(parseSeed(' 0 ')).toEqual({ ok: true, value: 0 });
    expect(parseSeed(String(MAX_SEED))).toEqual({ ok: true, value: MAX_SEED });
  });
  it('範囲外・小数・負・文字・空はエラー（0 にしない）', () => {
    for (const v of ['', ' ', String(MAX_SEED + 1), '1.5', '-1', 'abc', '12a', '1e3', '%']) expect(parseSeed(v)).toEqual({ ok: false, error: SEED_ERROR });
  });
});
