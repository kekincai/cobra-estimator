// /transfer のタブ（pages/Transfer.tsx と各タブで共有する型）
export type TransferTab = 'json' | 'export' | 'csv' | 'review';

/** タブ違いのファイルを別のタブへ渡す（seq で同じファイルの再送も区別する） */
export interface Handoff {
  tab: TransferTab;
  file: File;
  seq: number;
}

export type SwitchTab = (tab: TransferTab, file?: File) => void;
