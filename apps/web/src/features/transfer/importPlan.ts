// JSON / XML 取り込みの計画づくり: 内容グループ、同名要因の衝突、確定 API に送る差分。
import type { FactorRow, TransferFactorInsert, TransferFactorUpdate, TransferImportRequest, TransferProjectInsert } from '../../../shared/types';
import { relationsOf, type FileFactor, type ModelFile } from './schema';

export const IMPORT_GROUPS = ['stdFactors', 'stdTriangles', 'userFactors', 'userTriangles', 'relations', 'projects'] as const;
export type ImportGroupKey = (typeof IMPORT_GROUPS)[number];
export type Picked = Record<ImportGroupKey, boolean>;

export type Resolution = 'keep' | 'overwrite' | 'rename';
export const RESOLUTIONS: { key: Resolution; label: string }[] = [
  { key: 'keep', label: '既存を残す' },
  { key: 'overwrite', label: '上書き' },
  { key: 'rename', label: '別名で追加' },
];

type ExistingFactor = Pick<FactorRow, 'id' | 'no' | 'name' | 'category' | 'kind' | 'targetFactorId' | 'definition' | 'levels' | 'origin' | 'triangles'>;

const isStd = (f: FileFactor) => f.origin === 'standard';
const fmt2 = (v: number) => v.toFixed(2);
const KIND_LABEL = { direct: '直接', indirect: '間接' } as const;

export interface Conflict {
  fileNo: number;
  name: string;
  existingId: string;
  diff: string;
}

function trianglesByNo(file: ModelFile) {
  const m = new Map<number, TransferFactorInsert['triangles']>();
  for (const t of file.triangles) {
    const arr = m.get(t.factorNo) ?? [];
    arr.push({ expert: t.expert, best: t.l3[0], likely: t.l3[1], worst: t.l3[2] });
    m.set(t.factorNo, arr);
  }
  return m;
}

/** 既存要因と取り込み要因の差分を 1 行で説明する（設計稿の書き方に合わせる） */
export function describeDiff(f: FileFactor, tris: TransferFactorInsert['triangles'], ex: ExistingFactor): string {
  const diffs: string[] = [];
  for (let i = 3; i >= 0; i--) {
    if ((f.levels[i] ?? '') !== (ex.levels[i] ?? '')) diffs.push(`L${i} の定義文が異なる — 既存「${ex.levels[i]}」 / 取り込み「${f.levels[i]}」`);
  }
  if (f.category !== ex.category) diffs.push(`カテゴリが異なる — 既存「${ex.category}」 / 取り込み「${f.category}」`);
  if (f.kind !== ex.kind) diffs.push(`種類が異なる — 既存「${KIND_LABEL[ex.kind]}」 / 取り込み「${KIND_LABEL[f.kind]}」`);
  if (f.definition !== ex.definition) diffs.push(`定義文が異なる — 既存「${ex.definition}」 / 取り込み「${f.definition}」`);
  const fields = [
    ['best', '最良値'],
    ['likely', '最頻値'],
    ['worst', '最悪値'],
  ] as const;
  for (const t of tris) {
    const e = ex.triangles.find((x) => x.expert === t.expert);
    if (!e) {
      diffs.push(`三角分布 ${t.expert} の分が既存にない`);
      continue;
    }
    for (const [k, label] of fields) {
      if (Math.abs(t[k] - e[k]) > 1e-9) diffs.push(`三角分布 ${label}が異なる — 既存 ${fmt2(e[k])} / 取り込み ${fmt2(t[k])} (${t.expert})`);
    }
  }
  if (!diffs.length) return '内容は同じ';
  return diffs.length === 1 ? diffs[0]! : `${diffs[0]} ほか ${diffs.length - 1} 点`;
}

/** 選んだ要因グループのうち、既存と同じ名前の要因 */
export function findConflicts(file: ModelFile, existing: ExistingFactor[], picked: Pick<Picked, 'stdFactors' | 'userFactors'>): Conflict[] {
  const byName = new Map(existing.map((e) => [e.name.trim(), e]));
  const tris = trianglesByNo(file);
  return file.factors
    .filter((f) => (isStd(f) ? picked.stdFactors : picked.userFactors))
    .flatMap((f) => {
      const ex = byName.get(f.name.trim());
      return ex ? [{ fileNo: f.no, name: f.name, existingId: ex.id, diff: describeDiff(f, tris.get(f.no) ?? [], ex) }] : [];
    });
}

export interface ImportGroupInfo {
  key: ImportGroupKey;
  name: string;
  desc: string;
  count: number;
  tag: string;
}

/** 「内容 — 取り込むものを選ぶ」の 6 行 */
export function importGroups(file: ModelFile, existing: ExistingFactor[], newGroupLabel: string): ImportGroupInfo[] {
  const names = new Set(existing.map((e) => e.name.trim()));
  const std = file.factors.filter(isStd);
  const user = file.factors.filter((f) => !isStd(f));
  const triCount = (fs: FileFactor[]) => file.triangles.filter((t) => fs.some((f) => f.no === t.factorNo)).length;
  const experts = new Set(file.triangles.map((t) => t.expert)).size;
  const same = (fs: FileFactor[]) => fs.filter((f) => names.has(f.name.trim())).length;
  const stdSame = same(std);
  const userSame = same(user);
  const rels = relationsOf(file);
  const pj = file.projects ?? [];
  const author = file.exportedBy ? `${file.exportedBy} が定義。` : '';
  return [
    { key: 'stdFactors', name: 'CoBRA 標準の変動要因', desc: `標準要因 ${std.length} 件と、そのレベル定義${stdSame ? `。うち ${stdSame} 件は既存と同名` : ''}`, count: std.length, tag: stdSame ? `同名 ${stdSame}` : '' },
    { key: 'stdTriangles', name: '標準の三角分布', desc: `標準要因ごとの ${experts} 名分 (最良 / 最頻 / 最悪)`, count: triCount(std), tag: '' },
    { key: 'userFactors', name: 'ユーザ定義の変動要因', desc: `${author}${userSame ? `うち ${userSame} 件は既存と同名` : '一から定義された要因とレベル定義'}`, count: user.length, tag: userSame ? `同名 ${userSame}` : '' },
    { key: 'userTriangles', name: 'ユーザ定義の三角分布', desc: `上の ${user.length} 要因 × ${experts} 名`, count: triCount(user), tag: '' },
    { key: 'relations', name: '要因間の関係', desc: '間接 → 直接 の対応 (一段階)', count: rels.length, tag: '' },
    { key: 'projects', name: 'プロジェクト実績データ', desc: `規模・工数・レベル値 ${pj.length} 件。グループ ${newGroupLabel} として追加`, count: pj.length, tag: '機密' },
  ];
}

/** 既存と重ならないグループ ID（A, B, … Z, G27 …） */
export function nextGroupIds(existing: string[], n: number): string[] {
  const used = new Set(existing);
  const out: string[] = [];
  for (let i = 0; out.length < n; i++) {
    const id = i < 26 ? String.fromCharCode(65 + i) : `G${i + 1}`;
    if (!used.has(id)) {
      used.add(id);
      out.push(id);
    }
  }
  return out;
}

export interface PlanInput {
  file: ModelFile;
  fileName: string;
  sourceKind: 'json' | 'xml';
  picked: Picked;
  resolutions: Record<number, Resolution>;
  existingFactors: ExistingFactor[];
  existingProjects: { id: string }[];
  existingGroups: { id: string; name: string }[];
  newId?: () => string;
}

export interface ImportPlan {
  request: TransferImportRequest;
  after: { factors: number; triangles: number; projects: number; standard: number };
  warnings: string[];
}

export function buildImportPlan(p: PlanInput): ImportPlan {
  const { file, picked } = p;
  const newId = p.newId ?? (() => crypto.randomUUID());
  const warnings: string[] = [];
  const byName = new Map(p.existingFactors.map((e) => [e.name.trim(), e]));
  const usedNames = new Set(p.existingFactors.map((e) => e.name.trim()));
  const tris = trianglesByNo(file);
  let nextNo = Math.max(0, ...p.existingFactors.map((e) => e.no)) + 1;

  /** ファイルの要因番号 → 取り込み後のモデルでの要因 ID */
  const resultId = new Map<number, string>();
  const inserts: TransferFactorInsert[] = [];
  const updates = new Map<string, TransferFactorUpdate>();
  /** 種類・関係を決める対象（追加・上書きしたもの）: ファイル番号 → 要因 ID */
  const touched: { f: FileFactor; id: string; isInsert: boolean }[] = [];

  for (const f of file.factors) {
    const selected = isStd(f) ? picked.stdFactors : picked.userFactors;
    const withTri = isStd(f) ? picked.stdTriangles : picked.userTriangles;
    const ex = byName.get(f.name.trim());
    if (!selected) {
      if (ex) resultId.set(f.no, ex.id);
      continue;
    }
    const res: Resolution = ex ? (p.resolutions[f.no] ?? 'keep') : 'rename';
    if (ex && res === 'keep') {
      resultId.set(f.no, ex.id);
      continue;
    }
    if (ex && res === 'overwrite') {
      resultId.set(f.no, ex.id);
      updates.set(ex.id, {
        id: ex.id,
        category: f.category,
        kind: f.kind,
        definition: f.definition,
        levels: f.levels,
        origin: f.origin,
        ...(withTri ? { triangles: tris.get(f.no) ?? [] } : {}),
      });
      touched.push({ f, id: ex.id, isInsert: false });
      continue;
    }
    // 追加（新規、または別名で追加）
    let name = f.name.trim();
    if (ex) {
      name = `${name} (取り込み)`;
      for (let i = 2; usedNames.has(name); i++) name = `${f.name.trim()} (取り込み ${i})`;
    }
    usedNames.add(name);
    const id = newId();
    resultId.set(f.no, id);
    inserts.push({
      id, no: nextNo++, name, category: f.category, kind: f.kind, targetFactorId: null, definition: f.definition,
      levels: f.levels, origin: f.origin, triangles: withTri ? (tris.get(f.no) ?? []) : [],
    });
    touched.push({ f, id, isInsert: true });
  }

  // --- 関係（間接 → 直接） ---
  const rels = new Map(relationsOf(file).map((r) => [r.indirectNo, r.directNo]));
  const finalState = new Map<string, { name: string; kind: 'direct' | 'indirect'; target: string | null }>();
  for (const e of p.existingFactors) finalState.set(e.id, { name: e.name, kind: e.kind, target: e.targetFactorId ?? null });
  for (const t of touched) {
    const prev = finalState.get(t.id);
    let target: string | null = null;
    if (t.f.kind === 'indirect') {
      if (picked.relations) {
        const directNo = rels.get(t.f.no);
        target = directNo != null ? (resultId.get(directNo) ?? null) : null;
        if (directNo != null && !target) warnings.push(`「${t.f.name}」が強める要因 (No.${directNo}) を取り込まないため、関係は未設定になります`);
      } else if (!t.isInsert && prev?.kind === 'indirect') target = prev.target;
    }
    finalState.set(t.id, { name: t.isInsert ? (inserts.find((i) => i.id === t.id)?.name ?? t.f.name) : (prev?.name ?? t.f.name), kind: t.f.kind, target });
  }
  // 整合性: 対象は直接要因で、1 つの直接要因に間接要因は 1 つまで
  const claimed = new Map<string, string>();
  const fixTarget = (id: string, reason: string) => {
    const s = finalState.get(id)!;
    warnings.push(`「${s.name}」の関係を外します — ${reason}`);
    s.target = null;
  };
  // 既存の関係を先に確保し、取り込み分を後から当てる
  const order = [...finalState.keys()].sort((a, b) => Number(touched.some((t) => t.id === a)) - Number(touched.some((t) => t.id === b)));
  for (const id of order) {
    const s = finalState.get(id)!;
    if (s.kind !== 'indirect' || !s.target) continue;
    const tgt = finalState.get(s.target);
    if (!tgt || tgt.kind !== 'direct') fixTarget(id, '対象が直接要因ではありません');
    else if (claimed.has(s.target)) fixTarget(id, `「${tgt.name}」にはすでに間接要因「${finalState.get(claimed.get(s.target)!)!.name}」があります`);
    else claimed.set(s.target, id);
  }
  for (const [id, s] of finalState) {
    const ins = inserts.find((i) => i.id === id);
    if (ins) {
      ins.targetFactorId = s.target;
      continue;
    }
    const ex = p.existingFactors.find((e) => e.id === id);
    if (!ex) continue;
    if ((ex.targetFactorId ?? null) !== s.target || updates.has(id)) {
      const u = updates.get(id) ?? { id };
      u.targetFactorId = s.target;
      updates.set(id, u);
    }
  }

  // --- 実績 ---
  const projects: TransferProjectInsert[] = [];
  const groups: { id: string; name: string }[] = [];
  const fileProjects = picked.projects ? (file.projects ?? []) : [];
  if (fileProjects.length) {
    const keys = [...new Set(fileProjects.map((x) => x.groupId ?? ''))];
    const ids = nextGroupIds(p.existingGroups.map((g) => g.id), keys.length);
    const groupOf = new Map(keys.map((k, i) => [k, ids[i]!]));
    keys.forEach((k, i) => {
      const fg = file.groups?.find((g) => g.id === k);
      groups.push({ id: ids[i]!, name: fg?.name || (k ? `取り込み ${k}` : `取り込み ${p.fileName}`) });
    });
    const usedIds = new Set(p.existingProjects.map((x) => x.id));
    const excluded = new Map((file.excluded ?? []).map((e) => [e.projectId, e.reason]));
    let dropped = 0;
    for (const fp of fileProjects) {
      let id = fp.id;
      for (let i = 2; usedIds.has(id); i++) id = `${fp.id}-${i}`;
      usedIds.add(id);
      const levels: Record<string, number> = {};
      fp.levels.forEach((v, i) => {
        const f = file.factors[i];
        const fid = f ? resultId.get(f.no) : undefined;
        if (fid) levels[fid] = v;
        else if (v > 0) dropped++;
      });
      const reason = excluded.get(fp.id);
      projects.push({
        id, groupId: groupOf.get(fp.groupId ?? '')!, name: fp.name || fp.id, sizeFP: fp.sizeFP, effortMM: fp.effortMM, levels,
        note: fp.note, adopted: reason === undefined, excludedReason: reason === undefined ? null : reason || '取り込み元で除外',
      });
    }
    if (dropped) warnings.push(`取り込まない要因のレベル値 ${dropped} 件は実績に入りません`);
  }

  const finalTriangles =
    p.existingFactors.reduce((s, e) => s + (updates.get(e.id)?.triangles ?? e.triangles).length, 0) + inserts.reduce((s, i) => s + i.triangles.length, 0);
  const standard =
    p.existingFactors.filter((e) => (updates.get(e.id)?.origin ?? e.origin) === 'standard').length + inserts.filter((i) => i.origin === 'standard').length;

  return {
    request: {
      source: { kind: p.sourceKind, fileName: p.fileName, exportedBy: file.exportedBy ?? null, exportedAt: file.exportedAt ?? null },
      groups,
      factorsInsert: inserts,
      factorsUpdate: [...updates.values()],
      projects,
    },
    after: { factors: p.existingFactors.length + inserts.length, triangles: finalTriangles, projects: p.existingProjects.length + projects.length, standard },
    warnings,
  };
}
