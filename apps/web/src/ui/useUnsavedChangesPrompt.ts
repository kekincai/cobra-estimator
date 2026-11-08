// 未保存の変更があるとき、画面遷移（アプリ内リンク）とタブを閉じる操作の前に確認する。
import { useEffect } from 'react';
import { useBlocker } from 'react-router';

export const UNSAVED_MESSAGE = '保存していない変更があります。破棄して移動しますか？';

interface Options {
  message?: string;
  /** true を返す遷移先は確認しない（例: 同じ見積りの「条件」⇄「リスク」タブ間。下書きが保たれる場合） */
  allow?: (nextPathname: string) => boolean;
}

export function useUnsavedChangesPrompt(dirty: boolean, { message = UNSAVED_MESSAGE, allow }: Options = {}) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname && !(allow?.(nextLocation.pathname) ?? false),
  );

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm(message)) blocker.proceed();
    else blocker.reset();
  }, [blocker, message]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
}
