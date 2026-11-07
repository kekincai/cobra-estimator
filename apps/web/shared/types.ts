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
