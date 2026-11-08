import { toModelSpec, type ModelBundle } from '../../../shared/types';
import { displayContribution, factorContributions, topWithRest } from '../../ui/contribution';
import { fmt1 } from '../../ui/format';
import type { DashResult } from './results';
import type { GenView } from './useDashboard';

const TOP = 5;

/**
 * 要因の寄与度（上位 5 + その他）。値は期待値による確定計算（ui/contribution の factorContributions）で、
 * 工数見積り・リスク・レポートと同じ口径。各行はそれぞれ丸める（合計行が無いので最大剰余法は使わない）。
 */
export function ContributionTile({ gen, result, bundle, mounted }: { gen: GenView; result: DashResult; bundle: ModelBundle | undefined; mounted: boolean }) {
  const factors = bundle?.factors ?? [];
  const byId = new Map(factors.map((f) => [f.id, f]));
  const cs = bundle ? factorContributions(toModelSpec(bundle, gen.expertMode), gen.levels, result.nominal) : result.contributions;
  const top = topWithRest(cs, TOP);
  const rows = top.rows.map((c) => {
    const f = byId.get(c.factorId);
    const lv = gen.levels[c.factorId] ?? 0;
    return { key: c.factorId, name: f?.name ?? c.factorId, level: `L${lv}`, l3: lv >= 3, mm: c.mm, share: c.share };
  });
  if (top.rest) {
    rows.push({ key: 'rest', name: `その他 ${top.rest.count} 要因`, level: '—', l3: false, mm: top.rest.mm, share: top.rest.share });
  }
  const overhead = result.p50 - result.nominal;
  return (
    <div className="tile col-span-12 flex min-w-0 flex-col gap-3 px-5 py-[22px] sm:px-6 xl:col-span-6" style={{ animationDelay: '400ms' }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-[13px] font-medium">要因の寄与度 — どこで工数が増えているか</h2>
        <span className="text-[12px] text-weak">
          {gen.label} ・ 上乗せ {fmt1(overhead)} 人月の内訳
        </span>
      </div>
      {rows.length === 0 ? (
        <span className="text-[12px] text-weak">すべての要因が L0 のため、上乗せはありません。</span>
      ) : (
        <div className="flex flex-col gap-[9px]">
          {rows.map((r, i) => (
            <div key={r.key} className="grid grid-cols-[minmax(0,196px)_minmax(40px,1fr)_44px] items-center gap-3 text-[12px]">
              <span className="flex min-w-0 items-center gap-2">
                <span className={`n inline-flex h-5 min-w-[26px] items-center justify-center rounded-md text-[11px] ${r.l3 ? 'bg-coral text-bg' : 'bg-raised text-sub'}`}>{r.level}</span>
                <span className="truncate">{r.name}</span>
              </span>
              <div className="h-3 rounded-md bg-raised">
                <div
                  className={`h-full rounded-md transition-[width] duration-800 ease-out-rise ${i < 2 ? 'bg-accent' : 'bg-info'}`}
                  style={{ width: `${mounted ? Math.round(r.share * 100) : 0}%`, transitionDelay: `${i * 60}ms` }}
                />
              </div>
              <span className="n text-right">{fmt1(displayContribution(r.mm))}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
