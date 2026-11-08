// 見積り条件の下書き（未保存の編集）。見積り ID ごとに保持し、「条件」⇄「リスク」を行き来しても消えない。
// モジュール内のストア + sessionStorage（同じタブの再読み込みでも残る。タブを閉じると消える）。
import type { Levels } from 'cobra-core';
import { useSyncExternalStore } from 'react';
import type { GenerationRow } from '../../../shared/types';

/** 世代として保存する入力（MEMO は notes.memo に入る） */
export interface DraftInputs {
  name: string;
  sizeFP: number;
  levels: Levels;
  memo: string;
}

export interface EstimateDraft extends DraftInputs {
  /** 編集の元にした世代（世代が無い見積りは null） */
  baseGenId: string | null;
}

const KEY_PREFIX = 'estima.draft.';
const key = (estimateId: string) => `${KEY_PREFIX}${estimateId}`;

/** 2 つのレベル表が同じか（欠けている要因は L0 とみなす） */
export function sameLevels(a: Levels, b: Levels): boolean {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const id of ids) if ((a[id] ?? 0) !== (b[id] ?? 0)) return false;
  return true;
}

/** 入力が同じか（名前・メモは前後の空白を無視） */
export function sameInputs(a: DraftInputs, b: DraftInputs): boolean {
  return a.name.trim() === b.name.trim() && a.sizeFP === b.sizeFP && a.memo.trim() === b.memo.trim() && sameLevels(a.levels, b.levels);
}

/** 世代の入力（memo は notes[memoKey]） */
export function inputsOfGen(g: Pick<GenerationRow, 'name' | 'sizeFP' | 'levels' | 'notes'>, memoKey = 'memo'): DraftInputs {
  return { name: g.name, sizeFP: g.sizeFP, levels: { ...g.levels }, memo: g.notes?.[memoKey] ?? '' };
}

/** sessionStorage から読んだ値を検査する（壊れていれば null） */
export function sanitizeDraft(v: unknown): EstimateDraft | null {
  if (!v || typeof v !== 'object') return null;
  const d = v as Partial<EstimateDraft>;
  if (typeof d.name !== 'string' || typeof d.memo !== 'string') return null;
  if (typeof d.sizeFP !== 'number' || !Number.isFinite(d.sizeFP) || d.sizeFP <= 0) return null;
  if (!d.levels || typeof d.levels !== 'object') return null;
  const levels: Levels = {};
  for (const [id, lv] of Object.entries(d.levels)) {
    if (!Number.isInteger(lv) || (lv as number) < 0 || (lv as number) > 3) return null;
    levels[id] = lv as number;
  }
  const baseGenId = typeof d.baseGenId === 'string' ? d.baseGenId : null;
  return { name: d.name, sizeFP: d.sizeFP, levels, memo: d.memo, baseGenId };
}

// ---- ストア ----
const cache = new Map<string, EstimateDraft | null>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function storage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function getDraft(estimateId: string): EstimateDraft | null {
  if (cache.has(estimateId)) return cache.get(estimateId) ?? null;
  let v: EstimateDraft | null = null;
  try {
    const raw = storage()?.getItem(key(estimateId));
    v = raw ? sanitizeDraft(JSON.parse(raw)) : null;
  } catch {
    v = null;
  }
  cache.set(estimateId, v);
  return v;
}

export function setDraft(estimateId: string, draft: EstimateDraft) {
  const prev = getDraft(estimateId);
  if (prev && prev.baseGenId === draft.baseGenId && sameInputs(prev, draft)) return;
  const next: EstimateDraft = { ...draft, levels: { ...draft.levels } };
  cache.set(estimateId, next);
  try {
    storage()?.setItem(key(estimateId), JSON.stringify(next));
  } catch {
    // 保存できなくてもこのタブのメモリでは有効
  }
  emit();
}

export function clearDraft(estimateId: string) {
  if (getDraft(estimateId) === null) return;
  cache.set(estimateId, null);
  try {
    storage()?.removeItem(key(estimateId));
  } catch {
    // 無視
  }
  emit();
}

/**
 * 編集中の入力を反映する。元の世代（base）と同じに戻ったら下書きを消す。
 * @returns 保存されていない変更があるか
 */
export function syncDraft(estimateId: string, current: DraftInputs, base: DraftInputs, baseGenId: string | null): boolean {
  if (sameInputs(current, base)) {
    clearDraft(estimateId);
    return false;
  }
  setDraft(estimateId, { ...current, baseGenId });
  return true;
}

export function subscribeDrafts(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** テスト用: メモリ上のキャッシュを捨てる */
export function resetDraftCacheForTest() {
  cache.clear();
}

export function useDraft(estimateId: string): EstimateDraft | null {
  return useSyncExternalStore(
    subscribeDrafts,
    () => getDraft(estimateId),
    () => getDraft(estimateId),
  );
}

/**
 * 下書きを「保存前の世代」として扱う（リスク画面で useGenerationSimulation / useLevers にそのまま渡す）。
 * id は入力から決まるので、同じ入力なら同じ id（= 同じ計算キー）になる。
 * runs / seed / modelVersionId は見積り画面のプレビューと同じもの（シミュレーション設定の回数・シード、見積りに使用中の版）を渡すこと。
 */
export function draftAsGeneration(
  estimateId: string,
  draft: DraftInputs,
  opts: { runs: number; seed: number; modelVersionId: string | null },
): GenerationRow {
  const levels = Object.fromEntries(Object.entries(draft.levels).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return {
    id: `draft:${JSON.stringify([draft.sizeFP, levels])}`,
    estimateId,
    label: '未保存',
    name: draft.name,
    sizeFP: draft.sizeFP,
    levels: { ...draft.levels },
    notes: draft.memo.trim() ? { memo: draft.memo.trim() } : {},
    runs: opts.runs,
    seed: opts.seed,
    modelVersionId: opts.modelVersionId,
    results: null,
    createdAt: '',
  };
}
