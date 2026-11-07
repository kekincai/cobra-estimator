import type { FactorRow } from '../../../shared/types';
import { fmt1 } from '../../ui/format';
import type { DashResult } from './results';
import type { GenView } from './useDashboard';

const TOP = 5;

/** 要因の寄与度（上位 5 + その他） */
export function ContributionTile({ gen, result, factors, mounted }: { gen: GenView; result: DashResult; factors: FactorRow[]; mounted: boolean }) {
  const byId = new Map(factors.map((f) => [f.id, f]));
  const cs = result.contributions.filter((c) => c.mm > 0);
  const rows = cs.slice(0, TOP).map((c) => {
    const f = byId.get(c.factorId);
    const lv = gen.levels[c.factorId] ?? 0;
    return { key: c.factorId, name: f?.name ?? c.factorId, level: `L${lv}`, l3: lv >= 3, mm: c.mm, share: c.share };
  });
  const rest = cs.slice(TOP);
  if (rest.length) {
    rows.push({
      key: 'rest', name: `その他 ${rest.length} 要因`, level: '—', l3: false,
      mm: rest.reduce((s, c) => s + c.mm, 0), share: rest.reduce((s, c) => s + c.share, 0),
    });
  }
  const overhead = result.p50 - result.nominal;
  return (
    <div className="tile col-span-12 flex min-w-0 flex-col gap-3 px-6 py-[22px] xl:col-span-6" style={{ animationDelay: '400ms' }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-medium">要因の寄与度 — どこで工数が増えているか</span>
        <span className="text-[12px] text-weak">
          {gen.label} ・ 上乗せ {fmt1(overhead)} 人月の内訳
        </span>
      </div>
      {rows.length === 0 ? (
        <span className="text-[12px] text-weak">すべての要因が L0 のため、上乗せはありません。</span>
      ) : (
        <div className="flex flex-col gap-[9px]">
          {rows.map((r, i) => (
            <div key={r.key} className="grid grid-cols-[minmax(0,196px)_minmax(0,1fr)_52px] items-center gap-3 text-[12px]">
              <span className="flex min-w-0 items-center gap-2">
                <span className={`n inline-flex h-5 min-w-[26px] items-center justify-center rounded-md text-[10px] ${r.l3 ? 'bg-coral text-bg' : 'bg-raised text-sub'}`}>{r.level}</span>
                <span className="truncate">{r.name}</span>
              </span>
              <div className="h-3 rounded-md bg-raised">
                <div
                  className={`h-full rounded-md transition-[width] duration-800 ease-out-rise ${i < 2 ? 'bg-accent' : 'bg-info'}`}
                  style={{ width: `${mounted ? Math.round(r.share * 100) : 0}%`, transitionDelay: `${i * 60}ms` }}
                />
              </div>
              <span className="n text-right">{fmt1(r.mm)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
