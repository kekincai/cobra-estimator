import type { ModelVersionRow } from '../../../shared/types';
import { fmtPct } from '../../ui/format';
import { HelpLink } from '../../ui/HelpLink';
import { Ring } from '../../ui/Ring';
import { Sparkline } from '../../ui/Sparkline';

/** モデルの読み込み状態。'ready' のときだけ「まだ構築されていない」と言い切れる */
export type ModelStatus = 'loading' | 'error' | 'ready';

const Skel = ({ className }: { className: string }) => <span aria-hidden="true" className={`dash-skel block ${className}`} />;

/** 生産性 α と版ごとの推移 */
export function AlphaTile({ status, active, versions }: { status: ModelStatus; active: ModelVersionRow | null; versions: ModelVersionRow[] }) {
  const pts = versions.map((v) => ({ label: `v${v.version}`, value: v.alpha, current: v.id === active?.id }));
  return (
    <div className="tile col-span-12 flex min-w-0 flex-col gap-1.5 px-5 py-[22px] sm:col-span-6 sm:px-6 xl:col-span-3" style={{ animationDelay: '240ms' }} aria-busy={status === 'loading'}>
      <h2 className="m-0 inline-flex items-center gap-2 text-[12px] font-normal text-sub">
        生産性 α
        <HelpLink section="formula" />
      </h2>
      {status === 'loading' ? (
        <>
          <Skel className="h-10 w-32" />
          <span className="text-[11px] text-sub">読み込み中…</span>
        </>
      ) : (
        <>
          <span className="n text-[40px] leading-none">{active ? active.alpha.toFixed(4) : '—'}</span>
          <span className="text-[11px] text-weak">
            人月 / FP
            {active?.ciLo != null && active.ciHi != null && ` ・ 95% CI ${active.ciLo.toFixed(4)} – ${active.ciHi.toFixed(4)}`}
          </span>
        </>
      )}
      {status === 'ready' && pts.length > 0 ? (
        <Sparkline points={pts} label={`α の推移。${pts.map((p) => `${p.label} ${p.value.toFixed(4)}`).join('、')}`} className="mt-auto h-auto w-full" />
      ) : status === 'ready' ? (
        <span className="mt-auto text-[12px] text-sub">モデルがまだ構築されていません</span>
      ) : status === 'error' ? (
        <span className="mt-auto text-[12px] text-sub">モデルを読み込めませんでした</span>
      ) : null}
    </div>
  );
}

/** MMRE と PRED(25) */
export function AccuracyTile({ status, active, mounted }: { status: ModelStatus; active: ModelVersionRow | null; mounted: boolean }) {
  const pred = active?.pred25 ?? null;
  return (
    <div className="tile col-span-12 flex min-w-0 flex-col gap-1.5 px-5 py-[22px] sm:col-span-6 sm:px-6 xl:col-span-3" style={{ animationDelay: '320ms' }} aria-busy={status === 'loading'}>
      <h2 className="m-0 inline-flex items-center gap-2 text-[12px] font-normal text-sub">
        見積り精度 MMRE
        <HelpLink section="build" />
      </h2>
      {status === 'loading' ? (
        <Skel className="h-10 w-28" />
      ) : (
        <span className="n text-[40px] leading-none">{active?.mmre != null ? fmtPct(active.mmre, 1) : '—'}</span>
      )}
      <span className="text-[11px] text-weak">
        交差検証 (1件抜き) ・ {active ? `${active.n} 件` : '—'} ・ 小さいほど良い（20% 以下が目安）
      </span>
      <div className="mt-auto flex items-center gap-3">
        {status === 'ready' && pred != null ? (
          <Ring value={pred} size={48} radius={18} stroke={7} color="var(--color-info)" show={mounted} label={`PRED(25) ${fmtPct(pred)}`} className="size-11" />
        ) : (
          <span aria-hidden="true" className={`size-11 rounded-full border-[7px] border-raised ${status === 'loading' ? 'dash-skel' : ''}`} />
        )}
        <span className="flex flex-col">
          <span className="n text-[18px]">{pred != null ? fmtPct(pred) : '—'}</span>
          <span className="text-[11px] text-sub">PRED(25) 誤差25%以内</span>
        </span>
      </div>
    </div>
  );
}
