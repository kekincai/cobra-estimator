// 書き出し: 現在のモデル → estima-model/1。8 項目（旧 J-MDL-006）を選んで含める。
// 実績データ（projects）は機密。既定では含めず、管理者へのアップロードには決して含めない。
import type { FactorRow, ModelBundle, ProjectRow } from '../../../shared/types';
import { factorNo, fmtPct } from '../../ui/format';
import { FORMAT, type ModelFile } from './schema';

export const EXPORT_ITEMS = ['groups', 'excluded', 'stdFactors', 'customFactors', 'triangles', 'relations', 'accuracy', 'projects'] as const;
export type ExportKey = (typeof EXPORT_ITEMS)[number];
export type ExportPicked = Record<ExportKey, boolean>;

/** 既定: 実績データ以外はすべて含める */
export const DEFAULT_EXPORT: ExportPicked = {
  groups: true, excluded: true, stdFactors: true, customFactors: true, triangles: true, relations: true, accuracy: true, projects: false,
};

type Bundle = Pick<ModelBundle, 'model' | 'factors' | 'groups' | 'activeVersion'>;

const byNo = (a: FactorRow, b: FactorRow) => a.no - b.no;

export function exportedFactors(b: Bundle, picked: Pick<ExportPicked, 'stdFactors' | 'customFactors'>): FactorRow[] {
  return b.factors.filter((f) => (f.origin === 'standard' ? picked.stdFactors : picked.customFactors)).sort(byNo);
}

export interface ExportMeta {
  exportedBy: string;
  now?: Date;
  /** 管理者へのアップロードでは true（実績は選択にかかわらず含めない） */
  forUpload?: boolean;
}

export function buildExport(b: Bundle, projects: ProjectRow[], picked: ExportPicked, meta: ExportMeta): ModelFile {
  const fs = exportedFactors(b, picked);
  const noOf = new Map(fs.map((f) => [f.id, f.no]));
  const v = b.activeVersion;
  const relations = picked.relations
    ? fs.flatMap((f) => (f.kind === 'indirect' && f.targetFactorId && noOf.has(f.targetFactorId) ? [{ indirectNo: f.no, directNo: noOf.get(f.targetFactorId)!, k: b.model.k }] : []))
    : [];
  const out: ModelFile = {
    format: FORMAT,
    exportedAt: (meta.now ?? new Date()).toISOString(),
    exportedBy: meta.exportedBy,
    model: {
      name: b.model.name,
      ...(v ? { version: v.version, alpha: v.alpha } : {}),
      ...(v && picked.accuracy && v.ciLo != null && v.ciHi != null ? { ci95: [v.ciLo, v.ciHi] as [number, number] } : {}),
    },
    factors: fs.map((f) => ({
      no: f.no, name: f.name, category: f.category, kind: f.kind, origin: f.origin,
      targetNo: relations.find((r) => r.indirectNo === f.no)?.directNo ?? null,
      definition: f.definition, levels: f.levels,
    })),
    triangles: picked.triangles ? fs.flatMap((f) => f.triangles.map((t) => ({ factorNo: f.no, expert: t.expert, l3: [t.best, t.likely, t.worst] as [number, number, number] }))) : [],
    relations,
  };
  if (picked.groups) out.groups = b.groups.map((g) => ({ id: g.id, name: g.name, projects: projects.filter((p) => p.groupId === g.id).length }));
  if (picked.excluded) out.excluded = projects.filter((p) => !p.adopted).map((p) => ({ projectId: p.id, reason: p.excludedReason ?? '' }));
  if (picked.accuracy && v) {
    out.accuracy = {
      ...(v.mmre != null ? { mmre: v.mmre } : {}),
      ...(v.pred25 != null ? { pred25: v.pred25 } : {}),
      loo: v.loo.map((l) => ({ projectId: l.projectId, mre: l.error })),
    };
  }
  if (picked.projects && !meta.forUpload) {
    out.projects = projects.map((p) => ({
      id: p.id, name: p.name, sizeFP: p.sizeFP, effortMM: p.effortMM, levels: fs.map((f) => p.levels[f.id] ?? 0), groupId: p.groupId, note: p.note,
    }));
  }
  return out;
}

export function exportFileName(b: Bundle) {
  return `estima-model-v${b.activeVersion?.version ?? 0}.json`;
}

export const toJsonText = (f: ModelFile) => JSON.stringify(f, null, 2) + '\n';

/** プレビュー用: 配列は先頭 1 件 + 件数に縮める（設計稿の見せ方） */
export function previewJson(f: ModelFile): string {
  const lines = ['{'];
  const entries = Object.entries(f).filter(([, v]) => v !== undefined);
  entries.forEach(([k, v], i) => {
    const comma = i < entries.length - 1 ? ',' : '';
    let body: string;
    if (Array.isArray(v)) {
      if (v.length === 0) body = '[]';
      else if (v.length === 1) body = `[ ${JSON.stringify(v[0])} ]`;
      else body = `[ ${JSON.stringify(v[0])}, … ${v.length} 件 ]`;
    } else body = JSON.stringify(v);
    lines.push(`  "${k}": ${body.replace(/,"/g, ', "').replace(/":/g, '": ')}${comma}`);
  });
  lines.push('}');
  return lines.join('\n');
}

export interface ExportItemInfo {
  key: ExportKey;
  name: string;
  desc: string;
  tag: string;
}

/** 「書き出す内容」の 8 行。名前は設計稿どおり、説明・件数は現在のモデルから。 */
export function exportItems(b: Bundle, projects: ProjectRow[]): ExportItemInfo[] {
  const std = b.factors.filter((f) => f.origin === 'standard');
  const custom = b.factors.filter((f) => f.origin !== 'standard');
  const experts = [...new Set(b.factors.flatMap((f) => f.triangles.map((t) => t.expert)))];
  const triN = b.factors.reduce((s, f) => s + f.triangles.length, 0);
  const noOf = new Map(b.factors.map((f) => [f.id, f.no]));
  const rels = b.factors.filter((f) => f.kind === 'indirect' && f.targetFactorId).sort(byNo);
  const excluded = projects.filter((p) => !p.adopted);
  const v = b.activeVersion;
  return [
    { key: 'groups', name: 'グループ', desc: `${b.groups.map((g) => g.id).join(' / ') || 'なし'} の定義と所属`, tag: `グループ ${b.groups.length}` },
    { key: 'excluded', name: 'PJ 除外の情報', desc: excluded.length ? `除外した実績とその理由 (${excluded.map((p) => p.id).join(', ')})` : '除外した実績はありません', tag: '' },
    { key: 'stdFactors', name: 'デフォルトの変動要因', desc: '標準リストから採用したもの', tag: `要因 ${std.length}` },
    { key: 'customFactors', name: '独自の変動要因', desc: '一から定義した要因とレベル定義', tag: `要因 ${custom.length}` },
    { key: 'triangles', name: '独自の三角分布', desc: `${experts.join(' / ') || '専門家'} の 3 点 × ${b.factors.length} 要因`, tag: `${triN} 件` },
    {
      key: 'relations', name: '要因間の関係情報',
      desc: rels.length ? rels.map((f) => `${factorNo(f.no)} → ${factorNo(noOf.get(f.targetFactorId!) ?? 0)} (強める)`).join(' ・ ') : '関係はありません',
      tag: `${rels.length} 件`,
    },
    {
      key: 'accuracy', name: '見積り精度情報',
      desc: v ? `α ${v.alpha.toFixed(4)}${v.mmre != null ? ` ・ MMRE ${fmtPct(v.mmre, 1)}` : ''}${v.pred25 != null ? ` ・ PRED(25) ${fmtPct(v.pred25)}` : ''} ・ 交差検証の誤差` : '構築済みの版がありません',
      tag: '',
    },
    { key: 'projects', name: 'プロジェクト実績データ', desc: `${projects.length} 件の規模・工数・レベル値。機密 — 既定では含めない`, tag: '機密' },
  ];
}
