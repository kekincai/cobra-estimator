import { INCONSISTENCY_THRESHOLD, isInconsistent } from 'cobra-core';
import { describe, expect, it } from 'vitest';
import { bandPct, signedPct } from './bandFormat';

describe('signedPct', () => {
  it('formats sign and digits', () => {
    expect(signedPct(0.1)).toBe('+10%');
    expect(signedPct(-0.04)).toBe('−4%');
    expect(signedPct(0)).toBe('±0%');
    expect(signedPct(-0.004)).toBe('±0%');
    expect(signedPct(0.2526, 1)).toBe('+25.3%');
    expect(signedPct(NaN)).toBe('—');
  });
});

describe('bandPct (±25% band, same semantics as cobra-core)', () => {
  it('uses the same threshold as cobra-core', () => {
    expect(INCONSISTENCY_THRESHOLD).toBe(0.25);
  });

  it('exactly ±0.25 is inside the band (PRED(25) counts MRE ≤ 0.25)', () => {
    expect(bandPct(0.25)).toEqual({ out: false, text: '+25%' });
    expect(bandPct(-0.25)).toEqual({ out: false, text: '−25%' });
    expect(isInconsistent(0.25)).toBe(false);
  });

  it('0.2526 is outside and is shown with enough precision', () => {
    expect(bandPct(0.2526)).toEqual({ out: true, text: '+25.3%' });
    expect(isInconsistent(0.2526)).toBe(true);
  });

  it('0.2549 is outside → 1 decimal', () => {
    expect(bandPct(0.2549)).toEqual({ out: true, text: '+25.5%' });
  });

  it('0.2501 / 0.25004 need 2 decimals; below that falls back to 「超」', () => {
    expect(bandPct(0.2501)).toEqual({ out: true, text: '+25.01%' });
    expect(bandPct(-0.2503)).toEqual({ out: true, text: '−25.03%' });
    expect(bandPct(0.250001)).toEqual({ out: true, text: '+25%超' });
  });

  it('clearly outside values keep integer display', () => {
    expect(bandPct(0.33)).toEqual({ out: true, text: '+33%' });
    expect(bandPct(-0.26)).toEqual({ out: true, text: '−26%' });
  });

  it('inside values round to integer and never exceed 25', () => {
    expect(bandPct(0.2496)).toEqual({ out: false, text: '+25%' });
    expect(bandPct(0.1)).toEqual({ out: false, text: '+10%' });
    expect(bandPct(0)).toEqual({ out: false, text: '±0%' });
  });

  it('display never contradicts the classification', () => {
    for (let i = -400; i <= 400; i++) {
      const x = i / 1000 + 0.00013;
      const { out, text } = bandPct(x);
      const shown = Number(text.replace(/[+−±%超]/g, ''));
      if (out) expect(shown >= 25).toBe(true);
      else expect(shown <= 25).toBe(true);
      expect(out).toBe(isInconsistent(x));
    }
  });

  it('non-finite input', () => {
    expect(bandPct(NaN)).toEqual({ out: false, text: '—' });
    expect(bandPct(Infinity).text).toBe('—');
  });
});
