// 変動要因・要因追加・関係図で共用するデータ取得と派生値。
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { expectedCO, levelOf, resolveTriangle, triMean, type ExpertMode, type Levels } from 'cobra-core';
import { SEED_G3 } from 'cobra-core/seed';
import { useMemo } from 'react';
import type { FactorRow } from '../../../shared/types';
import { toModelSpec } from '../../../shared/types';
import { qk, useEstimate, useMe, useModel, useProjects } from '../../data/api';
import { CURRENT_ESTIMATE_ID } from '../../ui/Layout';
import { sendFactor } from './api';

export type { FactorRow };

/** 担当者名の一覧（要因の三角分布に出てくる順） */
export function expertsOf(factors: FactorRow[]): string[] {
  const out: string[] = [];
  for (const f of factors) for (const t of f.triangles) if (!out.includes(t.expert)) out.push(t.expert);
  return out;
}

/** カテゴリの一覧（登場順） */
export function categoriesOf(factors: FactorRow[]): string[] {
  const out: string[] = [];
  for (const f of factors) if (!out.includes(f.category)) out.push(f.category);
  return out;
}

export interface CurrentGeneration {
  /** G3 など */
  label: string;
  levels: Levels;
  sizeFP: number;
  /** 世代がまだ無く seed の示例を使っているとき true */
  fallback: boolean;
}

interface StoredResults {
  contributions?: { factorId: string; mm: number }[];
  scoExpected?: number;
}

/**
 * 現在の見積り（レポート用世代、なければ最新世代）の要因別の値。
 * 直接要因の寄与は保存済みの結果を優先し、無ければ期待値 nominal × E[CO_i × m_i] で出す（軽い確定計算）。
 */
export function useFactorContext() {
  const model = useModel();
  const projects = useProjects();
  const estimate = useEstimate(CURRENT_ESTIMATE_ID);
  const me = useMe();

  const derived = useMemo(() => {
    const bundle = model.data;
    if (!bundle) return null;
    const factors = [...bundle.factors].sort((a, b) => a.no - b.no);
    const expertMode: ExpertMode = bundle.activeVersion?.expertMode ?? { kind: 'average' };
    const spec = toModelSpec({ model: bundle.model, factors }, expertMode);

    const gens = estimate.data?.generations ?? [];
    const g = gens.find((x) => x.id === estimate.data?.reportGenerationId) ?? gens[gens.length - 1];
    const gen: CurrentGeneration = g
      ? { label: g.label, levels: g.levels, sizeFP: g.sizeFP, fallback: false }
      : { label: 'G3', levels: { ...SEED_G3.levels }, sizeFP: SEED_G3.sizeFP, fallback: true };

    const alpha = bundle.activeVersion?.alpha ?? 0;
    const nominal = alpha * gen.sizeFP;
    const exp = expectedCO(spec, gen.levels);
    const stored = (g?.results ?? null) as StoredResults | null;
    const contrib: Record<string, number> = {};
    for (const f of factors) {
      if (f.kind !== 'direct') continue;
      const s = stored?.contributions?.find((c) => c.factorId === f.id);
      contrib[f.id] = s ? s.mm : nominal * (exp.byFactor[f.id] ?? 0);
    }
    const sco = stored?.scoExpected ?? exp.sco;

    /** L3 での CO（期待値、割合） */
    const co3 = (f: FactorRow) => triMean(resolveTriangle({ ...f, targetFactorId: f.targetFactorId }, expertMode));
    /** 間接要因が今の世代で掛ける倍率 */
    const multiplier = (f: FactorRow) => 1 + bundle.model.k * (levelOf(gen.levels, f.id) / 3);

    return { bundle, factors, expertMode, gen, contrib, sco, co3, multiplier, levelOf: (id: string) => levelOf(gen.levels, id) };
  }, [model.data, estimate.data]);

  const role = me.data?.user?.role;
  return {
    isLoading: model.isLoading,
    error: model.error,
    refetch: () => model.refetch(),
    data: derived,
    projects: projects.data ?? [],
    canEdit: role === 'admin',
  };
}

/** API の factor 入力（POST / PUT 共通） */
export interface FactorInput {
  no?: number;
  name: string;
  category: string;
  kind: 'direct' | 'indirect';
  targetFactorId?: string | null;
  definition: string;
  levels: [string, string, string, string];
  origin: 'standard' | 'custom';
  triangles: { expert: string; best: number; likely: number; worst: number }[];
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: qk.model }), qc.invalidateQueries({ queryKey: qk.factors })]);
}

export function useCreateFactors() {
  const invalidate = useInvalidate();
  return useMutation({
    // 1 件ずつ順に登録する（番号の採番とルール検査をサーバー側で行うため）
    mutationFn: async (inputs: FactorInput[]) => {
      const ids: string[] = [];
      for (const input of inputs) ids.push((await sendFactor<{ id: string }>('POST', '/factors', input)).id);
      return ids;
    },
    onSettled: invalidate,
  });
}

export function useUpdateFactor() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<FactorInput> }) => sendFactor('PUT', `/factors/${id}`, patch),
    onSettled: invalidate,
  });
}

export function useDeleteFactor() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => sendFactor('DELETE', `/factors/${id}`),
    onSettled: invalidate,
  });
}

/** 割合 ↔ 表示用の %（実装は triangle.ts。不正な入力は null） */
export { fromPct, toPct } from './triangle';
export const triText = (b: number, l: number, w: number) => `+${b} / +${l} / +${w}%`;
