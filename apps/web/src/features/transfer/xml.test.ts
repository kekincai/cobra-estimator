// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeAuto, decodeXml } from './decode';
import { parseLegacyXml } from './xml';

const fixture = () => new Uint8Array(readFileSync('src/features/transfer/fixtures/legacy-model.xml') /* cwd = apps/web */);

describe('legacy XML (Shift-JIS) → estima-model/1', () => {
  it('decodes Shift-JIS by the XML declaration', () => {
    const d = decodeXml(fixture());
    expect(d.encoding).toBe('Shift-JIS');
    expect(d.text).toContain('<CoBRAModel');
    expect(d.text).toContain('要件の安定性');
  });

  it('converts the fixture to a valid model file', () => {
    const r = parseLegacyXml(decodeXml(fixture()).text);
    if (!r.ok) throw new Error(r.errors.join('\n'));
    const f = r.data;
    expect(f.format).toBe('estima-model/1');
    expect(f.exportedBy).toBe('S. Tanaka');
    expect(f.model).toMatchObject({ name: '簡易見積りモデル 田中', alpha: 0.0218, ci95: [0.019, 0.0247] });
    expect(f.factors).toHaveLength(6);
    expect(f.factors.filter((x) => x.origin === 'standard')).toHaveLength(3);
    expect(f.factors[4]).toMatchObject({ no: 5, name: '運用部門の協力度', kind: 'indirect', targetNo: 4 });
    expect(f.factors[0]!.levels[3]).toBe('要件の3割以上が未確定');
    expect(f.triangles).toHaveLength(12);
    expect(f.triangles[2]).toEqual({ factorNo: 2, expert: 'S.T.', l3: [0.06, 0.12, 0.8] });
    expect(f.relations).toEqual([{ indirectNo: 5, directNo: 4, k: 0.225 }]);
    expect(f.projects).toHaveLength(3);
    expect(f.projects![1]).toMatchObject({ id: 'T-02', sizeFP: 1340, effortMM: 33, levels: [2, 1, 1, 2, 2, 3], groupId: 'C' });
    expect(f.excluded).toEqual([{ projectId: 'T-03', reason: '移行量が想定外' }]);
    expect(f.accuracy).toEqual({ mmre: 0.205, pred25: 0.667 });
  });

  it('accepts UTF-8 XML without a declaration and lower-case attributes', () => {
    const xml = `<CoBRAModel name="m"><Factors><Factor no="1" name="A" type="direct"><Level value="0">x</Level><Triangle expert="E" best="0.1" likely="0.2" worst="0.3"/></Factor></Factors></CoBRAModel>`;
    const d = decodeXml(new TextEncoder().encode(xml));
    expect(d.encoding).toBe('UTF-8');
    const r = parseLegacyXml(d.text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.triangles[0]!.l3).toEqual([0.1, 0.2, 0.3]);
  });

  it('reports a wrong root and malformed XML', () => {
    const wrong = parseLegacyXml('<Model/>');
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.errors[0]).toMatch(/CoBRAModel/);
    const broken = parseLegacyXml('<CoBRAModel><Factors></CoBRAModel>');
    expect(broken.ok).toBe(false);
  });

  it('reports invalid values through the schema', () => {
    const r = parseLegacyXml('<CoBRAModel><Factors><Factor no="1" name="A" type="direct"><Triangle expert="E" min="0.3" mode="0.2" max="0.1"/></Factor></Factors></CoBRAModel>');
    expect(r.ok).toBe(false);
  });

  it('decodeAuto falls back to Shift-JIS for CSV bytes', () => {
    const d = decodeAuto(new Uint8Array([0x8a, 0xbf, 0x8e, 0x9a]));
    expect(d).toEqual({ text: '漢字', encoding: 'Shift-JIS' });
  });
});
