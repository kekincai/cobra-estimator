// 要因関係図（design/Relations.dc.html）: 読み取り専用。直接要因を円（多いときは楕円）に並べ、線の太さ = L3 の CO または現在世代の寄与。
// URL: /model/relations?f=<要因 ID> で、その要因を選んだ状態で開く。
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useFactorContext, type FactorRow } from '../features/factors/data';
import { LoadState } from '../features/factors/LoadState';
import { RING, layoutRelations, relationPath } from '../features/factors/ringLayout';
import { fmtMultiplier } from '../features/factors/triangle';
import '../features/factors/factors.css';
import { HelpLink } from '../ui/HelpLink';
import { factorNo, fmt1, fmtSignedPct } from '../ui/format';

type Mode = 'co3' | 'contrib';

/** これより縮めると文字が読めないので、図は横スクロールにする */
const MIN_SCALE = 0.72;
/** 枠の幅がこれ未満なら図ではなく一覧で見せる */
const LIST_BELOW = 560;

/** 枠の幅を測る（読み込み後に枠が現れるので callback ref で要素を受け取る） */
function useWidth() {
  const [el, ref] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return { ref, width };
}

export default function RelationsPage() {
  const { data, isLoading, error, refetch } = useFactorContext();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>('co3');
  const { ref, width } = useWidth();
  const factors = data?.factors;
  const layout = useMemo(
    () => layoutRelations((factors ?? []).map((f) => ({ id: f.id, kind: f.kind, targetFactorId: f.targetFactorId }))),
    [factors],
  );

  if (isLoading || error || !data) return <LoadState isLoading={isLoading} error={error} refetch={refetch} />;

  const { bundle, gen, contrib, co3, sco } = data;
  const all = data.factors;
  const sel = all.find((f) => f.id === params.get('f')) ?? all[0];
  const setSel = (id: string) => setParams({ f: id }, { replace: true, preventScrollReset: true });
  const { pos } = layout;
  const byId = new Map(all.map((f) => [f.id, f]));
  const helperOf = (f: FactorRow) => all.find((x) => x.kind === 'indirect' && x.targetFactorId === f.id);
  const linked = (f: FactorRow) =>
    !!sel && (f.id === sel.id || (sel.kind === 'indirect' && sel.targetFactorId === f.id) || (f.kind === 'indirect' && f.targetFactorId === sel.id));
  const pct = (v: number) => Math.round(v * 100);
  const weight = (f: FactorRow) => (mode === 'co3' ? pct(co3(f)) : (contrib[f.id] ?? 0) * 4);
  const modeLabel = mode === 'co3' ? 'L3 の CO' : `${gen.label} の寄与`;
  const editHref = (f: FactorRow) => `/model/factors?f=${f.id}`;
  const relations = all.filter((f) => f.kind === 'indirect' && f.targetFactorId && byId.has(f.targetFactorId));
  /** 間接要因が L3 のときの倍率（k はモデルの定数） */
  const m3 = fmtMultiplier(1 + bundle.model.k);
  const targetNo = (f: FactorRow) => factorNo(byId.get(f.targetFactorId ?? '')?.no ?? 0);

  // 間接要因は自身の CO を持たない（工数への影響は対象の直接要因の CO に掛かる倍率だけ）。数値もそれに合わせて出す
  const valueOf = (f: FactorRow) =>
    f.kind === 'indirect' ? (mode === 'co3' ? `L3 で ${m3}` : `${targetNo(f)} に含む`) : mode === 'co3' ? `+${pct(co3(f))}%` : `${fmt1(contrib[f.id] ?? 0)} 人月`;
  const nodeLabel = (f: FactorRow) => {
    const ind = f.kind === 'indirect';
    const t = byId.get(f.targetFactorId ?? '');
    return `${factorNo(f.no)} ${f.name}（${ind ? `間接要因、${t ? `${factorNo(t.no)} ${t.name} を強める、` : ''}L3 での倍率 ${m3}` : `直接要因、${modeLabel} ${valueOf(f)}`}）`;
  };

  // ルールの状態（API でも強制しているので通常はすべて ✓）
  const rule1 = all.every((f) => f.kind !== 'indirect' || byId.get(f.targetFactorId ?? '')?.kind === 'direct');
  const counts = new Map<string, number>();
  for (const r of relations) counts.set(r.targetFactorId!, (counts.get(r.targetFactorId!) ?? 0) + 1);
  const rule2 = [...counts.values()].every((n) => n <= 1);
  const pairs = relations.map((r) => `${factorNo(byId.get(r.targetFactorId!)!.no)} ← ${factorNo(r.no)}`).join(', ');

  const relText = (f: FactorRow) => {
    if (f.kind === 'indirect') {
      const t = byId.get(f.targetFactorId ?? '');
      if (!t) return '強める直接要因が設定されていません。';
      const l = data.levelOf(f.id);
      return `直接要因 ${factorNo(t.no)} (${t.name}) を強めます。${factorNo(f.no)} のレベルに応じて ${factorNo(t.no)} の CO に倍率が掛かります (L3 で ${m3}。${gen.label} は L${l} なので ${fmtMultiplier(data.multiplier(f))})。${factorNo(f.no)} 自身の CO は工数に加算されません。`;
    }
    const h = helperOf(f);
    if (!h) return '関係なし。';
    const l = data.levelOf(h.id);
    return `間接要因 ${factorNo(h.no)} (${h.name}) に強められます。${factorNo(h.no)} が L${l} のとき、${factorNo(f.no)} の CO は ${fmtMultiplier(data.multiplier(h)).slice(1)} 倍になります。`;
  };

  // 図の縮尺: 枠に合わせて縮める。縮めすぎになるときは横スクロール、さらに狭いときは一覧にする
  const fit = width > 0 ? width / layout.W : 1;
  const asList = width > 0 && width < LIST_BELOW;
  const scale = Math.min(1, Math.max(MIN_SCALE, fit));
  const scrolls = fit < MIN_SCALE;
  const selTris = sel?.triangles ?? [];
  // 三角分布の小さな帯の目盛り（0〜50%。50% を超える値があればそこまで広げる）
  const span = Math.max(0.5, ...selTris.map((t) => t.worst));
  const at = (v: number) => Math.min(100, (v / span) * 100);

  return (
    <div className="flex min-w-0 flex-col gap-5 px-4 pt-7 pb-9 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[12px] text-sub">
            <Link to="/model/factors" className="text-sub! no-underline hover:text-text!">変動要因</Link> <span aria-hidden="true" className="text-weak">/</span> 関係図
          </span>
          <h1 className="n m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-[28px]">
            <span className="min-w-0">
              要因関係図 — {bundle.model.name}
              {bundle.activeVersion ? ` v${bundle.activeVersion.version}` : ''}
            </span>
            <HelpLink section="factors" />
          </h1>
          <span className="text-[13px] text-sub">
            どの要因が工数を押し上げ、間接要因がどれを強めるかを一枚で確認します。編集は<Link to="/model/factors">変動要因</Link>画面で行います。
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] text-sub">線の太さ</span>
          <div role="group" aria-label="線の太さ" className="inline-flex gap-0.5 rounded-full border border-line bg-card p-[3px]">
            {(['co3', 'contrib'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={`btn min-h-[30px] cursor-pointer rounded-full border-0 px-3 font-[inherit] text-[12px] font-bold ${mode === m ? 'bg-accent text-bg' : 'bg-transparent text-sub'}`}
              >
                {m === 'co3' ? 'L3 の CO' : `${gen.label} の寄与`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div
          ref={ref}
          className="tile fx-static flex min-w-0 flex-col overflow-hidden"
          style={{ background: 'radial-gradient(ellipse at 50% 50%, var(--color-card-2) 0%, var(--color-card) 55%, var(--color-panel) 100%)' }}
        >
          {asList ? (
            <ul aria-label="要因の一覧" className="m-0 flex list-none flex-col gap-2 p-3">
              {all.map((f) => {
                const act = f.id === sel?.id;
                const ind = f.kind === 'indirect';
                const t = byId.get(f.targetFactorId ?? '');
                const h = helperOf(f);
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      aria-pressed={act}
                      onClick={() => setSel(f.id)}
                      className={`grid w-full cursor-pointer grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-0.5 rounded-[12px] px-3 py-2.5 text-left font-[inherit] text-text ${act ? 'bg-card-2' : 'bg-panel'}`}
                      style={{ border: `1px ${ind ? 'dashed' : 'solid'} ${act ? 'var(--accent)' : 'var(--color-line)'}` }}
                    >
                      <span className={`n text-[12px] ${act ? 'text-accent' : 'text-sub'}`}>{factorNo(f.no)}</span>
                      <span className="min-w-0 text-[13px] font-bold [overflow-wrap:anywhere]">{f.name}</span>
                      <span className={`n text-right text-[12px] ${act ? 'text-accent' : 'text-text-2'}`}>{valueOf(f)}</span>
                      <span />
                      <span className="col-span-2 text-[11px] text-sub">
                        {ind ? `間接 → ${t ? `${factorNo(t.no)} ${t.name} を強める` : '(未設定)'}` : h ? `直接 ・ ${factorNo(h.no)} ${h.name} に強められる` : '直接'}
                        {data.levelOf(f.id) === 3 && <span className="ml-1.5 text-coral-soft">・ {gen.label} で L3</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className={scrolls ? 'overflow-x-auto' : 'overflow-hidden'} tabIndex={scrolls ? 0 : undefined} aria-label={scrolls ? '要因関係図（横にスクロールできます）' : undefined}>
              <div className="relative mx-auto" style={{ width: layout.W * scale, height: layout.H * scale }}>
                <div className="absolute top-0 left-0" style={{ width: layout.W, height: layout.H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                  <svg className="pointer-events-none absolute top-0 left-0" width={layout.W} height={layout.H} viewBox={`0 0 ${layout.W} ${layout.H}`} aria-hidden="true">
                    <ellipse cx={layout.cx} cy={layout.cy} rx={layout.rx} ry={layout.ry} fill="none" style={{ stroke: 'var(--color-nav-line)' }} strokeWidth="1" strokeDasharray="3 6" />
                    {all
                      .filter((f) => f.kind === 'direct')
                      .map((f) => {
                        const p = pos[f.id]!;
                        const dx = layout.cx - p.x, dy = layout.cy - p.y;
                        const len = Math.hypot(dx, dy) || 1;
                        const ux = dx / len, uy = dy / len;
                        const act = !!sel && (f.id === sel.id || (sel.kind === 'indirect' && sel.targetFactorId === f.id));
                        const l3 = data.levelOf(f.id) === 3;
                        return (
                          <line
                            key={f.id}
                            className="fx-ln"
                            x1={(p.x + ux * 44).toFixed(1)}
                            y1={(p.y + uy * 44).toFixed(1)}
                            x2={(layout.cx - ux * 96).toFixed(1)}
                            y2={(layout.cy - uy * 56).toFixed(1)}
                            strokeLinecap="round"
                            style={{ stroke: act ? 'var(--accent)' : l3 ? 'var(--color-coral)' : 'var(--color-line-strong)', strokeWidth: Math.max(2, weight(f) * 0.32), opacity: act ? 1 : 0.8 }}
                          />
                        );
                      })}
                    {relations.map((r) => {
                      const rp = relationPath(pos[r.id]!, pos[r.targetFactorId!]!);
                      const on = !!sel && (sel.id === r.id || sel.id === r.targetFactorId);
                      return (
                        <g key={r.id}>
                          <path d={rp.d} fill="none" style={{ stroke: 'var(--color-line-strong)' }} strokeWidth="2" strokeDasharray="5 7" />
                          <path d={rp.d} fill="none" className="fx-flow" style={{ stroke: on ? 'var(--accent)' : 'transparent' }} strokeWidth="2" strokeLinecap="round" />
                          <text x={rp.lx.toFixed(0)} y={rp.ly.toFixed(0)} fontFamily="Noto Sans JP" fontSize="11" style={{ fill: 'var(--color-sub)' }} textAnchor="middle">
                            強める
                          </text>
                        </g>
                      );
                    })}
                  </svg>

                  <div
                    className="absolute box-border flex flex-col items-center justify-center gap-1 rounded-[20px] border border-accent bg-bg"
                    style={{ left: layout.cx - RING.centerW / 2, top: layout.cy - RING.centerH / 2, width: RING.centerW, height: RING.centerH, boxShadow: '0 0 0 8px color-mix(in srgb, var(--accent) 8%, transparent), 0 20px 50px rgba(0,0,0,.5)' }}
                  >
                    <span className="text-[11px] text-sub">工数</span>
                    <span className="n text-[15px] text-text">α × 規模 × (1 + ΣCO)</span>
                    <span className="n text-[12px] text-accent">ΣCO = {fmtSignedPct(sco)}</span>
                  </div>

                  {all.map((f, i) => {
                    const p = pos[f.id]!;
                    const act = f.id === sel?.id;
                    const ind = f.kind === 'indirect';
                    const l3 = data.levelOf(f.id) === 3;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        aria-pressed={act}
                        aria-label={nodeLabel(f)}
                        className="fx-node absolute box-border flex cursor-pointer flex-col items-start justify-between gap-0.5 rounded-[14px] px-3 py-1.5 font-[inherit] text-text"
                        onClick={() => setSel(f.id)}
                        onDoubleClick={() => navigate(editHref(f))}
                        style={{
                          left: p.x - RING.nodeW / 2,
                          top: p.y - RING.nodeH / 2,
                          width: RING.nodeW,
                          height: RING.nodeH,
                          background: act ? 'var(--color-card-2)' : 'var(--color-panel)',
                          border: `1px ${ind ? 'dashed' : 'solid'} ${act ? 'var(--accent)' : l3 ? 'var(--color-coral-line-strong)' : ind ? 'var(--color-line-dashed)' : 'var(--color-line)'}`,
                          boxShadow: act ? '0 0 0 4px color-mix(in srgb, var(--accent) 13%, transparent), 0 12px 32px rgba(0,0,0,.4)' : 'none',
                          opacity: linked(f) ? 1 : 0.85,
                          animationDelay: `${i * 60}ms`,
                        }}
                      >
                        <span className="flex w-full items-center justify-between leading-none">
                          <span className={`n text-[11px] ${act ? 'text-accent' : l3 ? 'text-coral-soft' : 'text-sub'}`}>{factorNo(f.no)}</span>
                          <span className={`rounded-full px-1.5 py-[2px] text-[11px] leading-none font-bold ${ind ? 'bg-raised text-sub' : l3 ? 'bg-coral-soft-bg text-coral-soft' : 'bg-raised text-sub'}`}>
                            {ind ? '間接' : '直接'}
                          </span>
                        </span>
                        <span className="line-clamp-2 w-full text-left text-[12px] leading-[1.15] font-bold [overflow-wrap:anywhere]" title={f.name}>{f.name}</span>
                        <span className="flex w-full justify-between gap-1 text-[11px] leading-none text-sub">
                          <span className="truncate">{f.category}</span>
                          <span className={`n shrink-0 text-[11px] ${act ? 'text-accent' : 'text-text-2'}`}>{valueOf(f)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line px-[22px] py-3 text-[11px] text-sub">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {!asList && (
                <>
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className="h-[3px] w-[22px] rounded-[2px] bg-accent" />
                    直接要因 → 工数 (太さ = {modeLabel})
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className="h-0 w-[22px] border-t-2 border-dashed border-line-strong" />
                    間接要因 → 直接要因
                  </span>
                </>
              )}
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2.5 rounded-[3px] bg-coral" />
                {gen.label} で L3
              </span>
              <span className="inline-flex items-center gap-1.5">
                工数 = α × 規模 × (1 + ΣCO)
                <HelpLink section="formula" className="size-6! text-[11px]!" />
              </span>
            </div>
            <span>{asList ? 'タップで詳細' : scrolls ? 'クリックで詳細 ・ ダブルクリックで編集画面へ ・ 図は横にスクロールできます' : 'クリックで詳細 ・ ダブルクリックで編集画面へ'}</span>
          </div>
        </div>

        <aside aria-label="選んだ要因の詳細" className="flex min-w-0 flex-col gap-4">
          <div className="tile fx-static flex flex-1 flex-col gap-3 px-[22px] py-5" style={{ animationDelay: '100ms' }}>
            {sel ? (
              <div key={sel.id} className="fx-detail flex flex-col">
                <span className="text-[11px] tracking-[0.08em] text-sub">
                  {factorNo(sel.no)} ・ {sel.category} ・ {sel.kind === 'indirect' ? '間接要因' : '直接要因'}
                </span>
                <h2 className="n mt-1 mb-0 text-[20px] [overflow-wrap:anywhere]">{sel.name}</h2>
                <p className="mt-2 mb-0 text-[12.5px] leading-[1.7] text-sub">{sel.definition}</p>
                <div className="mt-3.5 grid grid-cols-[repeat(auto-fit,minmax(92px,1fr))] gap-2">
                  {sel.kind === 'indirect' ? (
                    <div className="flex flex-col gap-0.5 rounded-xl border border-line bg-bg px-3 py-2.5"><span className="text-[11px] text-sub">L3 での倍率</span><span className="n text-[16px]">{m3}</span></div>
                  ) : (
                    <div className="flex flex-col gap-0.5 rounded-xl border border-line bg-bg px-3 py-2.5"><span className="text-[11px] text-sub">L3 の CO</span><span className="n text-[16px]">+{pct(co3(sel))}%</span></div>
                  )}
                  <div className="flex flex-col gap-0.5 rounded-xl border border-line bg-bg px-3 py-2.5">
                    <span className="text-[11px] text-sub">{gen.label} のレベル</span>
                    <span className={`n text-[16px] ${data.levelOf(sel.id) === 3 ? 'text-coral-soft' : 'text-text'}`}>L{data.levelOf(sel.id)}</span>
                  </div>
                  <div className="flex flex-col gap-0.5 rounded-xl border border-line bg-bg px-3 py-2.5">
                    <span className="text-[11px] text-sub">{gen.label} の寄与</span>
                    <span className="n text-[16px]">{sel.kind === 'indirect' ? `${targetNo(sel)} に含む` : `${fmt1(contrib[sel.id] ?? 0)} 人月`}</span>
                  </div>
                </div>
                <div className="mt-3.5 flex flex-col gap-1.5">
                  <span className="text-[11px] tracking-[0.08em] text-sub">
                    {sel.kind === 'indirect' ? '三角分布 (参考値。間接要因の分布は工数の計算に使われません)' : '三角分布 (L3, 工数増加率)'}
                  </span>
                  {selTris.map((t) => (
                    <div key={t.expert} className="grid grid-cols-[36px_minmax(0,1fr)_110px] items-center gap-2.5 text-[12px]">
                      <span className="text-sub">{t.expert}</span>
                      <div className="relative h-2 overflow-hidden rounded bg-bg">
                        <div className="absolute inset-y-0 rounded bg-muted" style={{ left: `${at(t.best)}%`, width: `${Math.max(0, at(t.worst) - at(t.best))}%` }} />
                        <div className="absolute -inset-y-0.5 w-[3px] rounded-[2px] bg-accent" style={{ left: `calc(${at(t.likely)}% - 1px)` }} />
                      </div>
                      <span className="n text-right text-[11px] text-text-2">
                        {pct(t.best)} / {pct(t.likely)} / {pct(t.worst)}%
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3.5 flex flex-col gap-1.5 rounded-xl border border-line bg-bg px-3.5 py-3">
                  <span className="text-[11px] tracking-[0.08em] text-sub">関係</span>
                  <span className="text-[12.5px] leading-[1.6]">{relText(sel)}</span>
                </div>
              </div>
            ) : (
              <p className="m-0 text-[13px] text-sub">要因がありません。「変動要因」画面から追加してください。</p>
            )}
            {sel && (
              <Link
                to={editHref(sel)}
                className="btn mt-auto inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-muted bg-transparent text-[13px] font-bold text-text! no-underline"
              >
                この要因を編集する <span aria-hidden="true" className="text-accent">↗</span>
              </Link>
            )}
          </div>
          <div className="tile fx-static flex flex-col gap-2.5 px-[22px] py-[18px]" style={{ animationDelay: '180ms' }}>
            <h2 className="m-0 text-[13px] font-bold">モデルのルール</h2>
            <div className="flex flex-col gap-1.5 text-[12px]">
              <Rule ok={rule1}>間接要因は一段階まで — 間接の間接はない</Rule>
              <Rule ok={rule2}>直接要因 1 つにつき間接要因は 1 つまで{pairs ? ` (${pairs})` : ''}</Rule>
              <Rule ok>どの要因も L0 で CO = 0</Rule>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Rule({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        role="img"
        aria-label={ok ? '満たしている' : '違反あり'}
        className={`inline-flex size-[18px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${ok ? 'bg-ok-soft text-ok' : 'bg-coral-soft-bg text-coral-soft'}`}
      >
        {ok ? '✓' : '!'}
      </span>
      <span>{children}</span>
    </div>
  );
}
