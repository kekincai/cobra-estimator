// 解説に出す見本の数値（現行モデルの版と、見本の見積り「顧客ポータル刷新」のレポート対象の世代）を読む。
// 数値の整形は facts.ts（純関数・テストあり）。読み込み中・失敗時は各節が数値なしの文に切り替える。
import { useEstimate, useModel } from '../../data/api';
import { CURRENT_ESTIMATE_ID } from '../../ui/Layout';
import { accuracyFacts, flowFacts, readStoredResult, type AccuracyFacts, type FlowFacts, type StoredResult } from './facts';

export interface SampleEstimate {
  id: string;
  name: string;
  genLabel: string;
  genName: string;
  sizeFP: number;
  budget: number | null;
  result: StoredResult;
}

export function useGuideFacts(): {
  accuracy: AccuracyFacts | null;
  alpha: number | null;
  sample: SampleEstimate | null;
  /** 業務フロー画面に差し込む現在のモデルの事実（flowStagesFor に渡す） */
  flow: FlowFacts | null;
  loading: boolean;
} {
  const model = useModel();
  const est = useEstimate(CURRENT_ESTIMATE_ID);
  const active = model.data?.activeVersion ?? null;
  const gens = est.data?.generations ?? [];
  const withResult = gens.filter((g) => readStoredResult(g.results));
  const gen = withResult.find((g) => g.id === est.data?.reportGenerationId) ?? withResult.at(-1);
  const result = gen ? readStoredResult(gen.results) : null;
  return {
    loading: model.isPending || est.isPending,
    accuracy: accuracyFacts(active),
    alpha: active?.alpha ?? null,
    flow: flowFacts(model.data),
    sample:
      est.data && gen && result
        ? { id: est.data.id, name: est.data.name, genLabel: gen.label, genName: gen.name, sizeFP: gen.sizeFP, budget: est.data.budget, result }
        : null,
  };
}
