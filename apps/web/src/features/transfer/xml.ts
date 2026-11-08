// 旧 Excel 版（簡易見積りモデルツール）の XML → estima-model/1。
//
// 前提（実物のサンプルが無いため推定した構造。fixtures/legacy-model.xml 参照）:
//   <CoBRAModel name author exportedAt>
//     <Alpha value ciLow ciHigh/>                            … 任意
//     <Groups><Group id name/></Groups>                      … 任意
//     <Factors>
//       <Factor no name category type="direct|indirect|直接|間接" origin="standard|custom" target>
//         <Definition>…</Definition>
//         <Level value="0..3">…</Level> ×4
//         <Triangle expert min mode max/>                    … best/likely/worst でも可
//       </Factor>
//     </Factors>
//     <Relations><Relation indirect direct k/></Relations>  … 任意（Factor@target でも可）
//     <Accuracy mmre pred25/>                                … 任意
//     <Projects>
//       <Project id name group size effort excluded reason><Levels>2 1 1 …</Levels><Note>…</Note></Project>
//     </Projects>
//   </CoBRAModel>
// 属性名の大文字小文字は区別しない。変換結果は schema.ts の検証を通してから使う。
import { describeXmlSyntaxError, NOT_ESTIMA_HINT, SYNTAX_HINT } from './errors';
import { FORMAT, validateModelFile, type ModelFileInput, type ParseResult } from './schema';

const ROOT = 'CoBRAModel';

/** 利用者に見せる日本語のエラー（hint は直し方） */
class XmlFileError extends Error {
  hint: string;
  constructor(message: string, hint: string) {
    super(message);
    this.hint = hint;
  }
}

function attr(el: Element, ...names: string[]): string | undefined {
  for (const n of names) {
    for (const a of Array.from(el.attributes)) if (a.name.toLowerCase() === n.toLowerCase()) return a.value.trim();
  }
  return undefined;
}

function num(v: string | undefined): number | undefined {
  if (v == null || v.trim() === '') return undefined;
  const n = Number(v.replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

/** 直下の子要素（名前は大文字小文字を区別しない） */
function children(el: Element, name: string): Element[] {
  return Array.from(el.children).filter((c) => c.localName.toLowerCase() === name.toLowerCase());
}
function child(el: Element, name: string): Element | undefined {
  return children(el, name)[0];
}
/** <Parent><Item/>…</Parent> または直下の <Item/> の並び */
function list(root: Element, parent: string, item: string): Element[] {
  const p = child(root, parent);
  return p ? children(p, item) : children(root, item);
}
const text = (el: Element | undefined) => el?.textContent?.trim() ?? '';

function kindOf(v: string | undefined): 'direct' | 'indirect' {
  return v && /^(indirect|間接)/i.test(v) ? 'indirect' : 'direct';
}

/** DOMParser を差し替え可能に（テストは jsdom） */
export type XmlParser = { parseFromString(s: string, type: 'application/xml'): Document };

/** XML 文字列 → estima-model/1 の生オブジェクト（未検証） */
export function legacyXmlToRaw(xml: string, parser: XmlParser = new DOMParser()): ModelFileInput {
  const doc = parser.parseFromString(xml, 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) throw new XmlFileError(describeXmlSyntaxError(text(err)), SYNTAX_HINT);
  const root = doc.documentElement;
  if (!root || root.localName !== ROOT)
    throw new XmlFileError(`旧 Excel 版のモデル XML ではありません（ルート要素が <${ROOT}> ではなく <${root?.localName ?? '?'}> です）。`, NOT_ESTIMA_HINT);

  const alphaEl = child(root, 'Alpha');
  const alpha = alphaEl ? num(attr(alphaEl, 'value') ?? text(alphaEl)) : undefined;
  const ciLo = alphaEl ? num(attr(alphaEl, 'ciLow', 'ciLo')) : undefined;
  const ciHi = alphaEl ? num(attr(alphaEl, 'ciHigh', 'ciHi')) : undefined;

  const factorEls = list(root, 'Factors', 'Factor');
  const factors: NonNullable<ModelFileInput['factors']> = [];
  const triangles: NonNullable<ModelFileInput['triangles']> = [];
  factorEls.forEach((el, i) => {
    const no = num(attr(el, 'no', 'id')) ?? i + 1;
    const levelEls = children(el, 'Level');
    const levels: [string, string, string, string] = ['', '', '', ''];
    levelEls.forEach((l, k) => {
      const idx = num(attr(l, 'value', 'level')) ?? k;
      if (idx >= 0 && idx <= 3) levels[idx] = text(l);
    });
    const kind = kindOf(attr(el, 'type', 'kind'));
    const target = num(attr(el, 'target', 'targetNo'));
    factors.push({
      no,
      name: attr(el, 'name') ?? text(child(el, 'Name')),
      category: attr(el, 'category') ?? '',
      kind,
      origin: /^(standard|標準)/i.test(attr(el, 'origin') ?? '') ? 'standard' : 'custom',
      targetNo: kind === 'indirect' ? (target ?? null) : null,
      definition: text(child(el, 'Definition')),
      levels,
    });
    for (const t of children(el, 'Triangle')) {
      triangles.push({
        factorNo: no,
        expert: attr(t, 'expert', 'by') ?? '',
        l3: [num(attr(t, 'min', 'best')) ?? NaN, num(attr(t, 'mode', 'likely')) ?? NaN, num(attr(t, 'max', 'worst')) ?? NaN],
      });
    }
  });

  const relations = list(root, 'Relations', 'Relation').map((r) => ({
    indirectNo: num(attr(r, 'indirect', 'from')) ?? 0,
    directNo: num(attr(r, 'direct', 'to')) ?? 0,
    k: num(attr(r, 'k')),
  }));

  const groups = list(root, 'Groups', 'Group').map((g) => ({ id: attr(g, 'id') ?? '', name: attr(g, 'name') }));

  const excluded: NonNullable<ModelFileInput['excluded']> = [];
  const projects = list(root, 'Projects', 'Project').map((p, i) => {
    const id = attr(p, 'id') ?? `XML-${i + 1}`;
    if (/^(true|1|yes)$/i.test(attr(p, 'excluded') ?? '')) excluded.push({ projectId: id, reason: attr(p, 'reason') ?? '' });
    const lv = text(child(p, 'Levels'));
    return {
      id,
      name: attr(p, 'name'),
      sizeFP: num(attr(p, 'size', 'sizeFP')) ?? NaN,
      effortMM: num(attr(p, 'effort', 'effortMM')) ?? NaN,
      levels: lv ? lv.split(/[\s,]+/).map(Number) : [],
      groupId: attr(p, 'group'),
      note: text(child(p, 'Note')),
    };
  });

  const accEl = child(root, 'Accuracy');
  const exportedAt = attr(root, 'exportedAt', 'date');
  return {
    format: FORMAT,
    exportedAt: exportedAt && !Number.isNaN(Date.parse(exportedAt)) ? new Date(exportedAt).toISOString() : exportedAt,
    exportedBy: attr(root, 'author', 'exportedBy'),
    model: {
      name: attr(root, 'name') ?? '',
      version: num(attr(root, 'modelVersion')),
      alpha,
      ci95: ciLo != null && ciHi != null ? [ciLo, ciHi] : undefined,
    },
    groups: groups.length ? groups : undefined,
    excluded: excluded.length ? excluded : undefined,
    factors,
    triangles,
    relations,
    accuracy: accEl ? { mmre: num(attr(accEl, 'mmre')), pred25: num(attr(accEl, 'pred25')) } : undefined,
    projects: projects.length ? projects : undefined,
  };
}

/** XML 文字列 → 検証済み ModelFile */
export function parseLegacyXml(xml: string, parser?: XmlParser): ParseResult {
  try {
    return validateModelFile(legacyXmlToRaw(xml, parser));
  } catch (e) {
    if (e instanceof XmlFileError) return { ok: false, errors: [e.message], hint: e.hint };
    return { ok: false, errors: ['XML を読み込めませんでした。'], hint: NOT_ESTIMA_HINT };
  }
}
