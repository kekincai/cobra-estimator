// コマンドパレット（⌘K / Ctrl+K）を開くための合図。パレット本体は ui/CommandPalette.tsx（Layout に常駐）。
export const COMMAND_PALETTE_EVENT = 'estima:open-command-palette';

/** どの画面からでもパレットを開く（例: 検索ボックスのクリック・フォーカス） */
export function openCommandPalette(initialQuery = ''): void {
  window.dispatchEvent(new CustomEvent<{ query: string }>(COMMAND_PALETTE_EVENT, { detail: { query: initialQuery } }));
}
