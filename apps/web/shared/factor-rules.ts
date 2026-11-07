// 間接要因のルール（IMPLEMENTATION_BRIEF.md §2.1）。画面と API の両方で使う。
// - 間接要因は直接要因をちょうど 1 つ強める
// - 直接要因 1 つにつき間接要因は 1 つまで
// - 間接要因は間接要因を強められない（一段階まで）

export interface FactorRef {
  id: string;
  name: string;
  kind: 'direct' | 'indirect';
  targetFactorId?: string | null;
}

/** 要因一式がルールを満たすか。違反があれば日本語のメッセージを返す。 */
export function checkFactorRules(all: readonly FactorRef[]): string | null {
  const byId = new Map(all.map((f) => [f.id, f]));
  const owner = new Map<string, FactorRef>();
  for (const f of all) {
    if (f.kind === 'direct') {
      if (f.targetFactorId) return `直接要因「${f.name}」は他の要因を強められません。`;
      continue;
    }
    if (!f.targetFactorId) return `間接要因「${f.name}」が強める直接要因を 1 つ選んでください。`;
    if (f.targetFactorId === f.id) return `間接要因「${f.name}」は自分自身を強められません。`;
    const t = byId.get(f.targetFactorId);
    if (!t) return `間接要因「${f.name}」の対象の要因が見つかりません。`;
    if (t.kind !== 'direct') return `間接要因「${f.name}」は間接要因「${t.name}」を強められません (間接要因は一段階まで)。`;
    const prev = owner.get(t.id);
    if (prev) return `直接要因「${t.name}」にはすでに間接要因「${prev.name}」があります (直接要因 1 つにつき間接要因は 1 つまで)。`;
    owner.set(t.id, f);
  }
  return null;
}

/** 間接要因の対象に選べる直接要因（まだ間接要因が付いていないもの）。selfId の現在の対象は選べる。 */
export function availableTargets<T extends FactorRef>(all: readonly T[], selfId?: string): T[] {
  const taken = new Set(all.filter((f) => f.kind === 'indirect' && f.id !== selfId && f.targetFactorId).map((f) => f.targetFactorId));
  return all.filter((f) => f.kind === 'direct' && f.id !== selfId && !taken.has(f.id));
}
