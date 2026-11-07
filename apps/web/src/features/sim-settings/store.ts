// シミュレーション設定の保存（適用先ごとに localStorage）。SimSettingsDialog と useSimSettings が共有する。
import { DEFAULT_RUNS, DEFAULT_SEED } from 'cobra-core';

export type SimTarget = 'build' | 'estimate';

export interface SimSettingsValue {
  /** 試行回数（1,000 / 10,000 / 100,000） */
  runs: number;
  /** 固定シード（fixedSeed=false のときは次回実行の初期値として保持するだけ） */
  seed: number;
  /** true = シードを固定（再現可能）、false = 実行ごとに更新 */
  fixedSeed: boolean;
}

export const RUN_CHOICES = [1_000, 10_000, 100_000] as const;
export const MAX_SEED = 4_294_967_295;
export const DEFAULTS: SimSettingsValue = { runs: DEFAULT_RUNS, seed: DEFAULT_SEED, fixedSeed: true };

const KEY = (t: SimTarget) => `estima.sim.${t}`;
const listeners = new Set<() => void>();
const cache = new Map<SimTarget, SimSettingsValue>();

function sanitize(v: Partial<SimSettingsValue> | null | undefined): SimSettingsValue {
  const runs = RUN_CHOICES.includes(v?.runs as (typeof RUN_CHOICES)[number]) ? (v!.runs as number) : DEFAULTS.runs;
  const seed = Number.isInteger(v?.seed) && v!.seed! >= 0 && v!.seed! <= MAX_SEED ? v!.seed! : DEFAULTS.seed;
  const fixedSeed = typeof v?.fixedSeed === 'boolean' ? v.fixedSeed : DEFAULTS.fixedSeed;
  return { runs, seed, fixedSeed };
}

export function readSim(t: SimTarget): SimSettingsValue {
  const hit = cache.get(t);
  if (hit) return hit;
  let v = DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY(t));
    if (raw) v = sanitize(JSON.parse(raw) as Partial<SimSettingsValue>);
  } catch {
    v = DEFAULTS;
  }
  cache.set(t, v);
  return v;
}

export function writeSim(t: SimTarget, patch: Partial<SimSettingsValue>) {
  const next = sanitize({ ...readSim(t), ...patch });
  cache.set(t, next);
  try {
    localStorage.setItem(KEY(t), JSON.stringify(next));
  } catch {
    // プライベートモード等で保存できなくても、このタブの中では有効
  }
  listeners.forEach((l) => l());
}

export function subscribeSim(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith('estima.sim.')) {
      cache.clear();
      l();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener('storage', onStorage);
  };
}

/** 8 桁の新しいシード */
export const randomSeed = () => Math.floor(10_000_000 + Math.random() * 89_999_999);
