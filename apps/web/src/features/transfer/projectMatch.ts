// 実績の重複判定（JSON 取り込みと CSV 取り込みで共通）。
// - JSON は ID、CSV は名前で既存の実績と突き合わせる
// - 内容（名前・規模・工数・レベル値・備考）が同じ → 「既に取り込み済み」として登録しない
// - 内容が違う → 差分を見せて、利用者が 取り込まない / 既存を更新 / 別 ID で追加 を選ぶ（CSV は「要修正」）
// 数値は丸めずに比べる（浮動小数の誤差だけを許す）。表示も元の値のまま。

export interface ProjectContent {
  name: string;
  sizeFP: number;
  effortMM: number;
  /** 要因 ID → レベル。比べるのはここにある要因だけ（ファイルに無い要因は比べない） */
  levels: Record<string, number>;
  note: string;
}

/** 既存の実績。項目が欠けていれば「内容は不明 = 違う」として扱う */
export interface ExistingProject {
  id: string;
  name?: string;
  sizeFP?: number;
  effortMM?: number;
  levels?: Record<string, number>;
  note?: string | null;
}

export type ProjectResolution = 'skip' | 'update' | 'rename';
export const PROJECT_RESOLUTIONS: { key: ProjectResolution; label: string }[] = [
  { key: 'skip', label: '取り込まない' },
  { key: 'update', label: '既存を更新' },
  { key: 'rename', label: '別 ID で追加' },
];
/** 内容が違うときの既定（どちらのデータも失わない） */
export const DEFAULT_PROJECT_RESOLUTION: ProjectResolution = 'rename';

/** 浮動小数の誤差だけを許して等しいか */
export function sameNumber(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

const t = (s: string | null | undefined) => (s ?? '').trim();

/**
 * 既存と取り込みの差分（人が読める行）。同じなら空配列。
 * factorLabel は要因 ID → 表示名（「要件の安定性」など）。
 */
export function projectDiffs(existing: ExistingProject, incoming: ProjectContent, factorLabel: (id: string) => string = (id) => id): string[] {
  const out: string[] = [];
  if (existing.name === undefined || existing.sizeFP === undefined || existing.effortMM === undefined) return ['既存の内容を確認できません'];
  if (t(existing.name) !== t(incoming.name)) out.push(`名前 — 既存「${t(existing.name)}」 / 取り込み「${t(incoming.name)}」`);
  if (!sameNumber(existing.sizeFP, incoming.sizeFP)) out.push(`規模 — 既存 ${existing.sizeFP} FP / 取り込み ${incoming.sizeFP} FP`);
  if (!sameNumber(existing.effortMM, incoming.effortMM)) out.push(`工数 — 既存 ${existing.effortMM} 人月 / 取り込み ${incoming.effortMM} 人月`);
  const exLv = existing.levels ?? {};
  for (const [id, v] of Object.entries(incoming.levels)) {
    const e = exLv[id] ?? 0;
    if (e !== v) out.push(`「${factorLabel(id)}」のレベル — 既存 L${e} / 取り込み L${v}`);
  }
  if (t(existing.note) !== t(incoming.note)) out.push(`備考 — 既存「${t(existing.note) || 'なし'}」 / 取り込み「${t(incoming.note) || 'なし'}」`);
  return out;
}

export type MatchStatus = 'new' | 'same' | 'changed';

export interface ProjectMatch {
  status: MatchStatus;
  existingId?: string;
  diffs: string[];
}

/** 1 件を既存の一覧と突き合わせる。key は ID（JSON）または名前（CSV）。 */
export function matchProject(existing: Map<string, ExistingProject>, key: string, incoming: ProjectContent, factorLabel?: (id: string) => string): ProjectMatch {
  const ex = existing.get(key.trim());
  if (!ex) return { status: 'new', diffs: [] };
  const diffs = projectDiffs(ex, incoming, factorLabel);
  return { status: diffs.length ? 'changed' : 'same', existingId: ex.id, diffs };
}
