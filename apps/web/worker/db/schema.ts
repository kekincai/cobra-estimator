// D1 スキーマ（Drizzle）。変更したら `pnpm --filter web db:generate` でマイグレーションを追加する。
// JSON 列は text + mode:'json'。配列・レベル値（要因 ID → L）はここに入る。

import type { ExpertMode, ExpertTriangle, Inconsistency, Levels, LooPoint } from 'cobra-core';
import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

export const models = sqliteTable('models', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** 間接要因の倍率係数 */
  k: real('k').notNull().default(0.225),
  /** 単位換算係数 { fpPerKloc, fpPerScreen, hoursPerMM } */
  units: text('units', { mode: 'json' }).$type<{ fpPerKloc: number; fpPerScreen: number; hoursPerMM: number }>().notNull(),
  createdAt: text('created_at').notNull().default(now),
});

export const factors = sqliteTable(
  'factors',
  {
    id: text('id').primaryKey(),
    modelId: text('model_id').notNull().references(() => models.id),
    no: integer('no').notNull(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    kind: text('kind', { enum: ['direct', 'indirect'] }).notNull(),
    targetFactorId: text('target_factor_id'),
    definition: text('definition').notNull().default(''),
    levels: text('levels', { mode: 'json' }).$type<[string, string, string, string]>().notNull(),
    origin: text('origin', { enum: ['standard', 'custom'] }).notNull().default('custom'),
    triangles: text('triangles', { mode: 'json' }).$type<ExpertTriangle[]>().notNull(),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (t) => [index('factors_model').on(t.modelId)],
);

export const groups = sqliteTable('groups', {
  id: text('id').primaryKey(),
  modelId: text('model_id').notNull().references(() => models.id),
  name: text('name').notNull(),
});

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    modelId: text('model_id').notNull().references(() => models.id),
    groupId: text('group_id').notNull(),
    name: text('name').notNull(),
    sizeFP: real('size_fp').notNull(),
    effortMM: real('effort_mm').notNull(),
    levels: text('levels', { mode: 'json' }).$type<Levels>().notNull(),
    note: text('note').notNull().default(''),
    adopted: integer('adopted', { mode: 'boolean' }).notNull().default(true),
    excludedReason: text('excluded_reason'),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (t) => [index('projects_model').on(t.modelId)],
);

export const modelVersions = sqliteTable(
  'model_versions',
  {
    id: text('id').primaryKey(),
    modelId: text('model_id').notNull().references(() => models.id),
    version: integer('version').notNull(),
    builtAt: text('built_at').notNull().default(now),
    builtBy: text('built_by').notNull(),
    expertMode: text('expert_mode', { mode: 'json' }).$type<ExpertMode>().notNull(),
    groupId: text('group_id'),
    runs: integer('runs').notNull(),
    seed: integer('seed').notNull(),
    alpha: real('alpha').notNull(),
    ciLo: real('ci_lo'),
    ciHi: real('ci_hi'),
    mmre: real('mmre'),
    pred25: real('pred25'),
    n: integer('n').notNull(),
    loo: text('loo', { mode: 'json' }).$type<LooPoint[]>().notNull(),
    inconsistencies: text('inconsistencies', { mode: 'json' }).$type<Inconsistency[]>().notNull(),
    /** 構築時点の要因定義（再現用スナップショット） */
    factorsSnapshot: text('factors_snapshot', { mode: 'json' }).$type<unknown>(),
    active: integer('active', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('versions_model').on(t.modelId)],
);

export const estimates = sqliteTable('estimates', {
  id: text('id').primaryKey(),
  modelId: text('model_id').notNull().references(() => models.id),
  name: text('name').notNull(),
  budget: real('budget'),
  reportGenerationId: text('report_generation_id'),
  createdAt: text('created_at').notNull().default(now),
  updatedAt: text('updated_at').notNull().default(now),
});

/** 世代 G1〜G5（1 見積りあたり最大 5） */
export const generations = sqliteTable(
  'generations',
  {
    id: text('id').primaryKey(),
    estimateId: text('estimate_id').notNull().references(() => estimates.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    name: text('name').notNull().default(''),
    sizeFP: real('size_fp').notNull(),
    levels: text('levels', { mode: 'json' }).$type<Levels>().notNull(),
    notes: text('notes', { mode: 'json' }).$type<Record<string, string>>().notNull(),
    runs: integer('runs').notNull(),
    seed: integer('seed').notNull(),
    modelVersionId: text('model_version_id'),
    /** SimulationResult から samples を除いたもの（ブラウザで計算して保存） */
    results: text('results', { mode: 'json' }).$type<unknown>(),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => [index('generations_estimate').on(t.estimateId)],
);

export const submissions = sqliteTable('submissions', {
  id: text('id').primaryKey(),
  modelVersionId: text('model_version_id').notNull(),
  payload: text('payload', { mode: 'json' }).$type<unknown>().notNull(),
  note: text('note').notNull().default(''),
  status: text('status', { enum: ['pending', 'approved', 'rejected'] }).notNull().default('pending'),
  submittedBy: text('submitted_by').notNull(),
  createdAt: text('created_at').notNull().default(now),
});

export const users = sqliteTable('users', {
  email: text('email').primaryKey(),
  name: text('name').notNull(),
  role: text('role', { enum: ['admin', 'estimator', 'pmo'] }).notNull(),
});

export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  at: text('at').notNull().default(now),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  detail: text('detail', { mode: 'json' }).$type<unknown>(),
});
