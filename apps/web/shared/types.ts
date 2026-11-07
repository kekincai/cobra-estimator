// API のレスポンス型（D1 の行型）。worker と src の両方から使う。
import type { ExpertMode, Factor, ModelSpec } from 'cobra-core';
import type * as s from '../worker/db/schema';

export type ModelRow = typeof s.models.$inferSelect;
export type FactorRow = typeof s.factors.$inferSelect;
export type GroupRow = typeof s.groups.$inferSelect;
export type ProjectRow = typeof s.projects.$inferSelect;
export type ModelVersionRow = typeof s.modelVersions.$inferSelect;
export type EstimateRow = typeof s.estimates.$inferSelect;
export type GenerationRow = typeof s.generations.$inferSelect;
export type SubmissionRow = typeof s.submissions.$inferSelect;

export interface ModelBundle {
  model: ModelRow;
  factors: FactorRow[];
  groups: GroupRow[];
  versions: ModelVersionRow[];
  activeVersion: ModelVersionRow | null;
}

export interface EstimateWithGenerations extends EstimateRow {
  generations: GenerationRow[];
}

export type Role = 'admin' | 'estimator' | 'pmo';
export interface Me {
  user: { email: string; name: string; role: Role } | null;
}

export function toFactor(r: FactorRow): Factor {
  return {
    id: r.id, no: r.no, name: r.name, category: r.category, kind: r.kind, targetFactorId: r.targetFactorId,
    definition: r.definition, levels: r.levels, origin: r.origin, triangles: r.triangles,
  };
}

/** API のモデルから cobra-core の ModelSpec を作る */
export function toModelSpec(bundle: Pick<ModelBundle, 'model' | 'factors'>, expertMode: ExpertMode = { kind: 'average' }): ModelSpec {
  return { factors: bundle.factors.map(toFactor), k: bundle.model.k, expertMode };
}

// ---- 取り込み / 書き出し（/transfer） ----
// 取り込み確定 API（POST /api/transfer/import）の本文。解析・衝突処理はブラウザ側で済ませ、ここには確定した差分だけを送る。

export type AuditRow = typeof s.auditLog.$inferSelect;

export interface TransferFactorInsert {
  /** ブラウザ側で採番（関係の参照に使うため） */
  id: string;
  no: number;
  name: string;
  category: string;
  kind: 'direct' | 'indirect';
  targetFactorId: string | null;
  definition: string;
  levels: [string, string, string, string];
  origin: 'standard' | 'custom';
  triangles: { expert: string; best: number; likely: number; worst: number }[];
}

/** 既存要因の上書き（名前は変えない）。targetFactorId だけの更新もある（関係の整合性を保つため）。 */
export type TransferFactorUpdate = { id: string } & Partial<Omit<TransferFactorInsert, 'id' | 'no' | 'name'>>;

export interface TransferProjectInsert {
  id: string;
  groupId: string;
  name: string;
  sizeFP: number;
  effortMM: number;
  levels: Record<string, number>;
  note: string;
  adopted: boolean;
  excludedReason: string | null;
}

export interface TransferImportRequest {
  source: { kind: 'json' | 'xml' | 'csv'; fileName: string; exportedBy?: string | null; exportedAt?: string | null };
  groups: { id: string; name: string }[];
  factorsInsert: TransferFactorInsert[];
  factorsUpdate: TransferFactorUpdate[];
  projects: TransferProjectInsert[];
}

export interface TransferImportResponse {
  ok: true;
  factorsAdded: number;
  factorsUpdated: number;
  projectsAdded: number;
  groupsAdded: number;
}
