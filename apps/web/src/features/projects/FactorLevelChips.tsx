// 実績一覧の「要因レベル」列。各チップに要因の番号・名前・レベル定義を持たせる（ホバーで表示、読み上げも要因名つき）。
// ui/LevelChips と同じ配色。L0 は文字色を text-sub にしてコントラストを確保する。
const CLS = ['bg-raised text-sub', 'bg-lv1-bg text-lv1', 'bg-lv2-bg text-text', 'bg-coral text-bg'] as const;

export interface FactorLevel {
  no: number;
  name: string;
  level: number;
  /** そのレベルの定義文 */
  def?: string;
}

const no2 = (n: number) => String(n).padStart(2, '0');

/** 読み上げ用の一行（「01 要件の安定性 L2、02 …」） */
export const factorLevelsLabel = (items: FactorLevel[]) => `要因レベル: ${items.map((f) => `${no2(f.no)} ${f.name} L${f.level}`).join('、')}`;

export function FactorLevelChips({ items }: { items: FactorLevel[] }) {
  return (
    <span className="inline-flex gap-[3px]" role="img" aria-label={factorLevelsLabel(items)}>
      {items.map((f) => (
        <span
          key={f.no}
          aria-hidden="true"
          title={`${no2(f.no)} ${f.name}: L${f.level}${f.def ? ` — ${f.def}` : ''}`}
          className={`inline-flex size-[22px] cursor-default items-center justify-center rounded-[6px] font-num text-[11px] font-bold ${CLS[Math.max(0, Math.min(3, f.level))]}`}
        >
          {f.level}
        </span>
      ))}
    </span>
  );
}
