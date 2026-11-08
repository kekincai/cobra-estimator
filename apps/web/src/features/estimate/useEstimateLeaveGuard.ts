// 見積りの下書き（未保存の条件）とリスク画面の未保存の予算を守る。
// - 同じ見積りの「条件 / リスク / レポート」間は下書きが残るので確認しない（予算の変更があるときは確認する）
// - それ以外へ移動するときは確認し、移動したら下書きを破棄する（確認文の「破棄して移動」どおり）
import { useEffect } from 'react';
import { useUnsavedChangesPrompt } from '../../ui/useUnsavedChangesPrompt';
import { clearDraft } from './draft';
import { isEstimateAreaPath } from './genParam';

export const DRAFT_LEAVE_MESSAGE = '保存していない見積り条件があります。破棄して移動しますか？';
export const BUDGET_LEAVE_MESSAGE = '保存していない予算の変更があります。破棄して移動しますか？';

export function useEstimateLeaveGuard(estimateId: string, { draftDirty, budgetDirty = false }: { draftDirty: boolean; budgetDirty?: boolean }) {
  useUnsavedChangesPrompt(draftDirty || budgetDirty, {
    message: budgetDirty ? BUDGET_LEAVE_MESSAGE : DRAFT_LEAVE_MESSAGE,
    allow: (p) => !budgetDirty && isEstimateAreaPath(estimateId, p),
  });
  // 画面が外れた時点で URL が見積りの外なら（= 確認して移動した）下書きを捨てる。
  // react-router は history を更新してから描画するので、ここでは移動先の URL が見える。
  useEffect(
    () => () => {
      if (!isEstimateAreaPath(estimateId, window.location.pathname)) clearDraft(estimateId);
    },
    [estimateId],
  );
}
