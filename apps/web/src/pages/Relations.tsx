// 要因関係図（design/Relations.dc.html）: 読み取り専用。直接要因を円に並べ、線の太さ = L3 の CO または現在世代の寄与。
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useFactorContext, type FactorRow } from '../features/factors/data';
import { RING, layoutRing, relationPath } from '../features/factors/ringLayout';
import '../features/factors/factors.css';
import { factorNo, fmt1, fmtSignedPct } from '../ui/format';

type Mode = 'co3' | 'contrib';

/** 768px 幅の図を枠に合わせて縮める */
function useFitScale(width: number) {
  // 読み込み後に枠が現れるので callback ref で要素を受け取る
  const [el, ref] = useState<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(Math.min(1, (e?.contentRect.width ?? width) / width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, width]);
  return { ref, scale };
}

export default function RelationsPage() {
  const { data, isLoading, error } = useFactorContext();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('co3');
  const [selId, setSel] = useState<string | null>(null);
  const { ref, scale } = useFitScale(RING.W);

  if (isLoading) return <div className="p-8 text-sub">読み込み中…</div>;
  if (error || !data) return <div className="p-8 text-coral-soft">モデルを読み込めませんでした。</div>;

  const { bundle, factors, gen, contrib, co3, sco } = data;
  const sel = factors.find((f) => f.id === selId) ?? factors[0];
  const pos = layoutRing(factors);
  const byId = new Map(factors.map((f) => [f.id, f]));
  const helperOf = (f: FactorRow) => factors.find((x) => x.kind === 'indirect' && x.targetFactorId === f.id);
  const linked = (f: FactorRow) =>
    !!sel && (f.id === sel.id || (sel.kind === 'indirect' && sel.targetFactorId === f.id) || (f.kind === 'indirect' && f.targetFactorId === sel.id));
  const pct = (v: number) => Math.round(v * 100);
  const weight = (f: FactorRow) => (mode === 'co3' ? pct(co3(f)) : (contrib[f.id] ?? 0) * 4);
  const modeLabel = mode === 'co3' ? 'L3 の CO' : `${gen.label} の寄与`;
  const editHref = (f: FactorRow) => `/model/factors?f=${f.id}`;
  const relations = factors.filter((f) => f.kind === 'indirect' && f.targetFactorId && byId.has(f.targetFactorId));

  // ルールの状態（API でも強制しているので通常はすべて ✓）
  const rule1 = factors.every((f) => f.kind !== 'indirect' || byId.get(f.targetFactorId ?? '')?.kind === 'direct');
  const counts = new Map<string, number>();
  for (const r of relations) counts.set(r.targetFactorId!, (counts.get(r.targetFactorId!) ?? 0) + 1);
  const rule2 = [...counts.values()].every((n) => n <= 1);
  const pairs = relations.map((r) => `${factorNo(byId.get(r.targetFactorId!)!.no)} ← ${factorNo(r.no)}`).join(', ');

  const relText = (f: FactorRow) => {
    if (f.kind === 'indirect') {
      const t = byId.get(f.targetFactorId ?? '');
      return t
        ? `直接要因 ${factorNo(t.no)} (${t.name}) を強めます。工数には ${factorNo(t.no)} を通じてのみ影響し、自身の CO は加算されません。`
        : '強める直接要因が設定されていません。';
    }
    const h = helperOf(f);
    if (!h) return '関係なし。';
    const l = data.levelOf(h.id);
    return `間接要因 ${factorNo(h.no)} (${h.name}) に強められます。${factorNo(h.no)} が L${l} のとき、${factorNo(f.no)} の CO は ${data.multiplier(h).toFixed(2)} 倍になります。`;
  };

  return (
    <div className="flex flex-col gap-5 px-8 pt-7 pb-9">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] text-sub">
            <Link to="/model/factors" className="text-sub! no-underline hover:text-text!">変動要因</Link> <span className="text-line-strong">/</span> 関係図
          </span>
          <h1 className="n m-0 text-[28px]">
            要因関係図 — {bundle.model.name}
            {bundle.activeVersion ? ` v${bundle.activeVersion.version}` : ''}
          </h1>
          <span className="text-[13px] text-sub">
            どの要因が工数を押し上げ、間接要因がどれを強めるかを一枚で確認します (旧 V-MDL04)。編集は<Link to="/model/factors">変動要因</Link>画面で行います。
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-weak">線の太さ</span>
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

      <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div
          ref={ref}
          className="tile fx-static relative overflow-hidden"
          style={{ height: RING.H * scale, background: 'radial-gradient(ellipse at 50% 50%, var(--color-card-2) 0%, var(--color-card) 55%, var(--color-panel) 100%)' }}
        >
          <div
            className="absolute top-0 left-1/2"
            style={{ width: RING.W, height: RING.H, transform: `translateX(-50%) scale(${scale})`, transformOrigin: 'top center' }}
          >
            <svg className="pointer-events-none absolute top-0 left-0" width={RING.W} height={RING.H} viewBox={`0 0 ${RING.W} ${RING.H}`} aria-hidden="true">
              <circle cx={RING.cx} cy={RING.cy} r={RING.R} fill="none" style={{ stroke: 'var(--color-nav-line)' }} strokeWidth="1" strokeDasharray="3 6" />
              {factors
                .filter((f) => f.kind === 'direct')
                .map((f) => {
                  const p = pos[f.id]!;
                  const dx = RING.cx - p.x, dy = RING.cy - p.y;
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
                      x2={(RING.cx - ux * 96).toFixed(1)}
                      y2={(RING.cy - uy * 56).toFixed(1)}
                      strokeLinecap="round"
                      style={{ stroke: act ? 'var(--accent)' : l3 ? 'var(--color-coral)' : 'var(--color-line-strong)', strokeWidth: Math.max(1.5, weight(f) * 0.32), opacity: act ? 1 : 0.55 }}
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
              style={{ left: RING.cx - 90, top: RING.cy - 50, width: 180, height: 100, boxShadow: '0 0 0 8px color-mix(in srgb, var(--accent) 8%, transparent), 0 20px 50px rgba(0,0,0,.5)' }}
            >
              <span className="text-[11px] text-sub">工数</span>
              <span className="n text-[15px] text-text">α × 規模 × (1 + ΣCO)</span>
              <span className="n text-[12px] text-accent">ΣCO = {fmtSignedPct(sco)}</span>
            </div>

            {factors.map((f, i) => {
              const p = pos[f.id]!;
              const act = f.id === sel?.id;
              const ind = f.kind === 'indirect';
              const l3 = data.levelOf(f.id) === 3;
              const val = mode === 'co3' ? `+${pct(co3(f))}%` : ind ? '—' : `${fmt1(contrib[f.id] ?? 0)} 人月`;
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={act}
                  aria-label={`${factorNo(f.no)} ${f.name}（${ind ? '間接' : '直接'}要因、${modeLabel} ${val}）`}
                  className="fx-node absolute box-border flex cursor-pointer flex-col items-start justify-between rounded-[14px] px-3 py-2.5 font-[inherit] text-text"
                  onClick={() => setSel(f.id)}
                  onDoubleClick={() => navigate(editHref(f))}
                  style={{
                    left: p.x - RING.nodeW / 2,
                    top: p.y - RING.nodeH / 2,
                    width: RING.nodeW,
                    height: RING.nodeH,
                    background: act ? 'var(--color-card-2)' : 'var(--color-panel)',
                    border: `1px ${ind ? 'dashed' : 'solid'} ${act ? 'var(--accent)' : l3 ? 'var(--color-coral-line)' : ind ? 'var(--color-line-dashed)' : 'var(--color-line)'}`,
                    boxShadow: act ? '0 0 0 4px color-mix(in srgb, var(--accent) 13%, transparent), 0 12px 32px rgba(0,0,0,.4)' : 'none',
                    opacity: linked(f) ? 1 : 0.78,
                    animationDelay: `${i * 60}ms`,
                  }}
                >
                  <span className="flex w-full items-center justify-between">
                    <span className={`n text-[11px] ${act ? 'text-accent' : l3 ? 'text-coral-soft' : 'text-sub'}`}>{factorNo(f.no)}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${ind ? 'bg-raised text-sub' : l3 ? 'bg-coral-soft-bg text-coral-soft' : 'bg-ok-soft text-ok'}`}>
                      {ind ? '間接' : '直接'}
                    </span>
                  </span>
                  <span className="text-left text-[12.5px] leading-[1.3] font-bold">{f.name}</span>
                  <span className="flex w-full justify-between text-[10.5px] text-sub">
                    <span>{f.category}</span>
                    <span className={`n text-[11px] ${act ? 'text-accent' : 'text-text-2'}`}>{val}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="absolute bottom-[18px] left-[22px] flex flex-wrap items-center gap-4 text-[11px] text-sub">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-[3px] w-[22px] rounded-[2px] bg-accent" />
              直接要因 → 工数 (太さ = {modeLabel})
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0 w-[22px] border-t-2 border-dashed border-line-strong" />
              間接要因 → 直接要因
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] bg-coral" />
              {gen.label} で L3
            </span>
          </div>
          <div className="absolute right-[22px] bottom-[18px] text-[11px] text-weak">クリックで詳細 ・ ダブルクリックで編集画面へ</div>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="tile fx-static flex flex-1 flex-col gap-3 px-[22px] py-5" style={{ animationDelay: '100ms' }}>
            {sel && (
              <div key={sel.id} className="fx-detail flex flex-col">
                <span className="text-[11px] tracking-[0.08em] text-weak">
                  {factorNo(sel.no)} ・ {sel.category} ・ {sel.kind === 'indirect' ? '間接要因' : '直接要因'}
                </span>
                <h2 className="n mt-1 mb-0 text-[20px]">{sel.name}</h2>
                <p className="mt-2 mb-0 text-[12.5px] leading-[1.7] text-sub">{sel.definition}</p>
                <div className="mt-3.5 grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-0.5 rounded-xl border border-line bg-bg px-3 py-2.5"><span className="text-[10px] text-weak">L3 の CO</span><span className="n text-[16px]">+{pct(co3(sel))}%</span></div>
                  <div className="flex flex-col gap-0.5 rounded-xl border border-line bg-bg px-3 py-2.5">
                    <span className="text-[10px] text-weak">{gen.label} のレベル</span>
                    <span className={`n text-[16px] ${data.levelOf(sel.id) === 3 ? 'text-coral-soft' : 'text-text'}`}>L{data.levelOf(sel.id)}</span>
                  </div>
                  <div className="flex flex-col gap-0.5 rounded-xl border border-line bg-bg px-3 py-2.5">
                    <span className="text-[10px] text-weak">{gen.label} の寄与</span>
                    <span className="n text-[16px]">
                      {sel.kind === 'indirect' ? `${factorNo(byId.get(sel.targetFactorId ?? '')?.no ?? 0)} に含む` : `${fmt1(contrib[sel.id] ?? 0)} 人月`}
                    </span>
                  </div>
                </div>
                <div className="mt-3.5 flex flex-col gap-1.5">
                  <span className="text-[11px] tracking-[0.08em] text-weak">三角分布 (L3, 工数増加率)</span>
                  {sel.triangles.map((t) => (
                    <div key={t.expert} className="grid grid-cols-[36px_minmax(0,1fr)_110px] items-center gap-2.5 text-[12px]">
                      <span className="text-sub">{t.expert}</span>
                      <div className="relative h-2 overflow-hidden rounded bg-bg">
                        <div className="absolute inset-y-0 rounded bg-muted" style={{ left: `${Math.min(100, t.best * 200)}%`, width: `${Math.max(0, Math.min(100, t.worst * 200) - Math.min(100, t.best * 200))}%` }} />
                        <div className="absolute -inset-y-0.5 w-[3px] rounded-[2px] bg-accent" style={{ left: `calc(${Math.min(100, t.likely * 200)}% - 1px)` }} />
                      </div>
                      <span className="n text-right text-[11px] text-text-2">
                        {pct(t.best)} / {pct(t.likely)} / {pct(t.worst)}%
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3.5 flex flex-col gap-1.5 rounded-xl border border-line bg-bg px-3.5 py-3">
                  <span className="text-[11px] tracking-[0.08em] text-weak">関係</span>
                  <span className="text-[12.5px] leading-[1.6]">{relText(sel)}</span>
                </div>
              </div>
            )}
            {sel && (
              <Link
                to={editHref(sel)}
                className="btn mt-auto inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-muted bg-transparent text-[13px] font-bold text-text! no-underline"
              >
                この要因を編集する <span className="text-accent">↗</span>
              </Link>
            )}
          </div>
          <div className="tile fx-static flex flex-col gap-2.5 px-[22px] py-[18px]" style={{ animationDelay: '180ms' }}>
            <span className="text-[13px] font-bold">モデルのルール</span>
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
        aria-label={ok ? '満たしている' : '違反あり'}
        className={`inline-flex size-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${ok ? 'bg-ok-soft text-ok' : 'bg-coral-soft-bg text-coral-soft'}`}
      >
        {ok ? '✓' : '!'}
      </span>
      <span>{children}</span>
    </div>
  );
}
