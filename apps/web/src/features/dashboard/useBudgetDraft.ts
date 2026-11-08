// 予算スライダーの下書きと保存（PUT /api/estimates/:id {budget}）。
// スライダーを動かした値は保存するまで「試算」。保存値と違うあいだ「予算を保存」「元に戻す」を出す。
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiSend, qk } from '../../data/api';

/** 下書きが保存値と違うか（0.5 人月刻みのスライダーなので 0.01 未満の差は同じとみなす） */
export function isBudgetDirty(draft: number | null, saved: number | null): boolean {
  if (draft == null) return false;
  if (!Number.isFinite(draft)) return false;
  if (saved == null || !Number.isFinite(saved)) return true;
  return Math.abs(draft - saved) >= 0.01;
}

export function useBudgetDraft(estimateId: string | null, saved: number | null) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<number | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // 別の見積りに切り替わったら下書きを捨てる
  useEffect(() => {
    setDraft(null);
    setSavedAt(null);
  }, [estimateId]);

  const save = useMutation({
    mutationFn: (budget: number) => apiSend('PUT', `/estimates/${encodeURIComponent(estimateId ?? '')}`, { budget }),
    onSuccess: async () => {
      // ['estimates'] の前方一致で ['estimates', id] も取り直す
      await qc.invalidateQueries({ queryKey: qk.estimates });
      setDraft(null);
      setSavedAt(Date.now());
    },
  });

  const dirty = isBudgetDirty(draft, saved);
  return {
    draft,
    dirty,
    /** 保存直後（次に動かすまで）「保存しました」を出す */
    justSaved: savedAt != null && draft == null,
    setDraft: (v: number) => {
      setSavedAt(null);
      save.reset();
      setDraft(v);
    },
    revert: () => {
      setDraft(null);
      save.reset();
    },
    save: () => {
      if (draft != null && estimateId) save.mutate(draft);
    },
    saving: save.isPending,
    error: save.error,
  };
}
