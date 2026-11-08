// 解説の「動かして確かめる」部品: 工数算定式の 3 スライダーと三角分布の 3 スライダー
import { useState } from 'react';
import { fmtInt } from '../../ui/format';
import { useWidth } from './useWidth';

const box = 'flex flex-col gap-0.5 rounded-xl border px-3.5 py-3';

/** 工数 = α × 規模 × (1 + ΣCO)。initial は見本（現行モデルの α、見本の見積りの規模と ΣCO の期待値）。単位: α は 1/10000、ΣCO は % */
export function FormulaPlayground({ initial }: { initial?: { a: number; size: number; sco: number } | null }) {
  const [aV, setA] = useState(initial?.a ?? 210);
  const [size, setSize] = useState(initial?.size ?? 1200);
  const [sco, setSco] = useState(initial?.sco ?? 74);
  const alpha = aV / 10000;
  const nominal = alpha * size;
  const over = (nominal * sco) / 100;
  const effort = nominal + over;
  const op = 'text-weak';
  return (
    <>
      <div className="n flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1 rounded-[14px] border border-line bg-bg px-4 py-[18px] text-[20px] sm:px-[22px] sm:text-[22px]">
        <span>工数</span>
        <span className={op}>=</span>
        <span className="text-accent">α</span>
        <span className={op}>×</span>
        <span>規模</span>
        <span className={op}>×</span>
        <span>
          (1 + <span className="text-coral">ΣCO</span>)
        </span>
        <span className={op}>=</span>
        <span>{alpha.toFixed(4)}</span>
        <span className={op}>×</span>
        <span>{fmtInt(size)}</span>
        <span className={op}>×</span>
        <span>{(1 + sco / 100).toFixed(2)}</span>
        <span className={op}>=</span>
        <span className="text-[28px] text-accent" aria-live="polite">{effort.toFixed(1)}</span>
        <span className="text-[13px] font-medium text-sub">人月</span>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Slider label="α 名目生産性 (人月 / FP)" value={alpha.toFixed(4)} min={150} max={300} step={1} raw={aV} onChange={setA} aria="α" hint="実績データから求まる「要因が全部 L0 だったときの生産性」。" />
        <Slider label="規模 (FP)" value={fmtInt(size)} min={300} max={2400} step={50} raw={size} onChange={setSize} aria="規模" hint="ファンクションポイント。KLOC や画面数からの換算でも可。" />
        <Slider label="ΣCO 上乗せ率の合計" value={`+${sco}%`} min={0} max={150} step={1} raw={sco} onChange={setSco} aria="ΣCO" hint="各要因の CO (工数増加率) を足したもの。L0 なら 0。" />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)_20px_minmax(0,1fr)] items-stretch sm:grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)_28px_minmax(0,1fr)]">
        <div className={`${box} border-line`}>
          <span className="text-[11px] leading-[1.4] text-sub">名目工数 α × 規模</span>
          <span className="n text-[16px] sm:text-[18px]">
            {nominal.toFixed(1)} <span className="text-[11px] font-medium text-sub">人月</span>
          </span>
        </div>
        <div className="flex items-center justify-center text-weak">+</div>
        <div className={`${box} border-coral-frame bg-coral-bg-2`}>
          <span className="text-[11px] leading-[1.4] text-sub">上乗せ 名目 × ΣCO</span>
          <span className="n text-[16px] text-coral-soft sm:text-[18px]">
            {over.toFixed(1)} <span className="text-[11px] font-medium text-sub">人月</span>
          </span>
        </div>
        <div className="flex items-center justify-center text-weak">=</div>
        <div className={`${box} border-accent bg-bg`}>
          <span className="text-[11px] leading-[1.4] text-sub">推定工数</span>
          <span className="n text-[16px] text-accent sm:text-[18px]">
            {effort.toFixed(1)} <span className="text-[11px] font-medium text-sub">人月</span>
          </span>
        </div>
      </div>
    </>
  );
}

function Slider(p: { label: string; value: string; min: number; max: number; step: number; raw: number; onChange: (v: number) => void; aria: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap justify-between gap-x-2 text-[12px]">
        <span className="text-sub">{p.label}</span>
        <span className="n">{p.value}</span>
      </div>
      <input type="range" className="guide-range" min={p.min} max={p.max} step={p.step} value={p.raw} aria-label={p.aria} aria-valuetext={p.value} onChange={(e) => p.onChange(Number(e.target.value))} />
      <span className="text-[11px] leading-[1.5] text-sub">{p.hint}</span>
    </div>
  );
}

/** 三角分布（最良 ≤ 最頻 ≤ 最悪 を保つ） */
export function TrianglePlayground() {
  const [t, setT] = useState({ b: 18, m: 26, w: 40 });
  // viewBox を実幅に合わせ、狭い画面でも目盛りの文字を 11px 以上に保つ
  const [ref, W] = useWidth<HTMLDivElement>();
  const L = 24;
  const R = W - 24;
  const X = (p: number) => L + (p / 100) * (R - L);
  // 最良と最悪が近いときは最良のラベルを一段上げて重ならないようにする。端では SVG の外へはみ出さないよう寄せる
  const close = X(t.w) - X(t.b) < 96;
  const labelX = (p: number) => Math.min(R - 32, Math.max(L + 32, X(p)));
  const setB = (v: number) => setT((s) => ({ b: v, m: Math.max(v, s.m), w: Math.max(v, s.w) }));
  const setM = (v: number) => setT((s) => ({ m: v, b: Math.min(v, s.b), w: Math.max(v, s.w) }));
  const setW = (v: number) => setT((s) => ({ w: v, m: Math.min(v, s.m), b: Math.min(v, s.b) }));
  const mean = ((t.b + t.m + t.w) / 3).toFixed(0);
  return (
    <div className="flex flex-col gap-2.5">
      <div ref={ref} className="min-w-0">
      <svg width="100%" height="200" viewBox={`0 0 ${W} 200`} role="img" aria-label={`三角分布。最良 ${t.b}%、最頻 ${t.m}%、最悪 ${t.w}% を結んだ三角形`}>
        <line x1={L} y1="170" x2={R} y2="170" stroke="var(--color-line-strong)" />
        <g style={{ fontFamily: 'var(--font-num)' }} fontSize="11" fill="var(--color-sub)">
          <text x={L} y="188">0%</text>
          <text x={X(50)} y="188" textAnchor="middle">50%</text>
          <text x={R} y="188" textAnchor="end">100%</text>
        </g>
        <polygon points={`${X(t.b)},170 ${X(t.m)},44 ${X(t.w)},170`} fill="var(--color-accent)" fillOpacity="0.18" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" />
        <line x1={X(t.m)} y1="40" x2={X(t.m)} y2="170" stroke="var(--color-accent)" strokeWidth="1" strokeDasharray="3 3" />
        <g style={{ fontFamily: 'var(--font-num)' }}>
          <text x={labelX(t.b)} y={close ? 148 : 162} fontSize="11" fill="var(--color-sub)" textAnchor="middle">
            最良 {t.b}%
          </text>
          <text x={labelX(t.m)} y="32" fontSize="12" fontWeight="700" fill="var(--color-text)" textAnchor="middle">
            最頻 {t.m}%
          </text>
          <text x={labelX(t.w)} y="162" fontSize="11" fill="var(--color-sub)" textAnchor="middle">
            最悪 {t.w}%
          </text>
        </g>
      </svg>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <TriSlider label="最良 (これ以下はない)" aria="最良" value={t.b} onChange={setB} />
        <TriSlider label="最頻 (いちばんありそう)" aria="最頻" value={t.m} onChange={setM} />
        <TriSlider label="最悪 (これ以上はない)" aria="最悪" value={t.w} onChange={setW} />
      </div>
      <span className="text-[12px] text-sub">
        平均 (期待値) = (最良 + 最頻 + 最悪) / 3 = <span className="n text-text">{mean}%</span>。シミュレーションでは毎回この三角形から 1 つ値を引きます。
      </span>
    </div>
  );
}

function TriSlider({ label, aria, value, onChange }: { label: string; aria: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-sub">{label}</span>
      <input type="range" className="guide-range" min={0} max={100} value={value} aria-label={aria} aria-valuetext={`${value}%`} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
