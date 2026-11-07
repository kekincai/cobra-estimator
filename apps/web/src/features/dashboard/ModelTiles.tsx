import type { ModelVersionRow } from '../../../shared/types';
import { fmtPct } from '../../ui/format';
import { Ring } from '../../ui/Ring';
import { Sparkline } from '../../ui/Sparkline';

/** 生産性 α と版ごとの推移 */
export function AlphaTile({ active, versions }: { active: ModelVersionRow | null; versions: ModelVersionRow[] }) {
  const pts = versions.map((v) => ({ label: `v${v.version}`, value: v.alpha, current: v.id === active?.id }));
  return (
    <div className="tile col-span-12 flex min-w-0 flex-col gap-1.5 px-6 py-[22px] sm:col-span-6 xl:col-span-3" style={{ animationDelay: '240ms' }}>
      <span className="text-[12px] text-sub">生産性 α</span>
      <span className="n text-[40px] leading-none">{active ? active.alpha.toFixed(4) : '—'}</span>
      <span className="text-[11px] text-weak">
        人月 / FP
        {active?.ciLo != null && active.ciHi != null && ` ・ 95% CI ${active.ciLo.toFixed(4)} – ${active.ciHi.toFixed(4)}`}
      </span>
      {pts.length > 0 ? (
        <Sparkline
          points={pts}
          label={`α の推移。${pts.map((p) => `${p.label} ${p.value.toFixed(4)}`).join('、')}`}
          className="mt-auto h-auto w-full"
        />
      ) : (
        <span className="mt-auto text-[12px] text-weak">モデルがまだ構築されていません</span>
      )}
    </div>
  );
}

/** MMRE と PRED(25) */
export function AccuracyTile({ active, mounted }: { active: ModelVersionRow | null; mounted: boolean }) {
  const pred = active?.pred25 ?? null;
  return (
    <div className="tile col-span-12 flex min-w-0 flex-col gap-1.5 px-6 py-[22px] sm:col-span-6 xl:col-span-3" style={{ animationDelay: '320ms' }}>
      <span className="text-[12px] text-sub">見積り精度 MMRE</span>
      <span className="n text-[40px] leading-none">{active?.mmre != null ? fmtPct(active.mmre, 1) : '—'}</span>
      <span className="text-[11px] text-weak">交差検証 (1件抜き) ・ {active ? `${active.n} 件` : '—'}</span>
      <div className="mt-auto flex items-center gap-3">
        <Ring value={pred ?? 0} size={48} radius={18} stroke={7} color="var(--color-info)" show={mounted} label={`PRED(25) ${pred != null ? fmtPct(pred) : '未計算'}`} className="size-11" />
        <span className="flex flex-col">
          <span className="n text-[18px]">{pred != null ? fmtPct(pred) : '—'}</span>
          <span className="text-[11px] text-sub">PRED(25) 誤差25%以内</span>
        </span>
      </div>
    </div>
  );
}
