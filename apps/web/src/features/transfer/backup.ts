// 取り込み前のバックアップ: 現在のモデルを実績込みで JSON に書き出す（取り込みは取り消せないため）。
import type { ModelBundle, ProjectRow } from '../../../shared/types';
import { logExport } from './api';
import { buildExport, EXPORT_ITEMS, toJsonText, type ExportPicked } from './exportModel';

/** テキストをファイルとして保存させる */
export function downloadText(name: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const pad = (n: number) => String(n).padStart(2, '0');
export const backupFileName = (b: Pick<ModelBundle, 'activeVersion'>, now = new Date()) =>
  `estima-backup-v${b.activeVersion?.version ?? 0}-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.json`;

/** 8 項目すべて（実績を含む）を書き出す。保存したファイル名を返す。 */
export function downloadBackup(bundle: ModelBundle, projects: ProjectRow[], userName: string): string {
  const all = Object.fromEntries(EXPORT_ITEMS.map((k) => [k, true])) as ExportPicked;
  const file = buildExport(bundle, projects, all, { exportedBy: userName });
  const text = toJsonText(file);
  const name = backupFileName(bundle);
  downloadText(name, text);
  void logExport({ fileName: name, items: [...EXPORT_ITEMS], includesProjects: true, bytes: text.length, backup: true });
  return name;
}
