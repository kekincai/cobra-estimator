import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { randomSeed, readSim, subscribeSim, writeSim, type SimSettingsValue, type SimTarget } from './store';

export interface UseSimSettings extends SimSettingsValue {
  setRuns: (runs: number) => void;
  setSeed: (seed: number) => void;
  setFixedSeed: (fixed: boolean) => void;
  /** 複数項目をまとめて更新 */
  update: (patch: Partial<SimSettingsValue>) => void;
  /** 実行時に使うシード。固定なら seed、更新モードなら毎回新しい値 */
  seedForRun: () => number;
  /** 「10,000 回 ・ 固定」のような短い表示 */
  runsLabel: string;
  seedLabel: string;
}

/** 適用先（'build' | 'estimate'）ごとのシミュレーション設定。保存先は localStorage。 */
export function useSimSettings(target: SimTarget): UseSimSettings {
  const v = useSyncExternalStore(subscribeSim, () => readSim(target), () => readSim(target));
  const update = useCallback((patch: Partial<SimSettingsValue>) => writeSim(target, patch), [target]);
  return useMemo(
    () => ({
      ...v,
      update,
      setRuns: (runs: number) => update({ runs }),
      setSeed: (seed: number) => update({ seed }),
      setFixedSeed: (fixedSeed: boolean) => update({ fixedSeed }),
      seedForRun: () => (v.fixedSeed ? v.seed : randomSeed()),
      runsLabel: v.runs.toLocaleString('en-US'),
      seedLabel: v.fixedSeed ? '固定 (再現可能)' : '実行ごとに更新',
    }),
    [v, update],
  );
}
