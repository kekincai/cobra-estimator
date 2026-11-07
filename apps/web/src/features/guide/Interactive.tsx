// 解説の「動かして確かめる」部品: 工数算定式の 3 スライダーと三角分布の 3 スライダー
import { useState } from 'react';
import { fmtInt } from '../../ui/format';

const box = 'flex flex-col gap-0.5 rounded-xl border px-3.5 py-3';

/** 工数 = α × 規模 × (1 + ΣCO) */
export function FormulaPlayground() {
  const [aV, setA] = useState(210);
  const [size, setSize] = useState(1200);
  const [sco, setSco] = useState(68);
  const alpha = aV / 10000;
  const nominal = alpha * size;
  const over = (nominal * sco) / 100;
  const effort = nominal + over;
  const op = 'text-weak';
  return (
    <>
      <div className="n flex flex-wrap items-center justify-center gap-3.5 rounded-[14px] border border-line bg-bg px-[22px] py-[18px] text-[22px]" aria-live="polite">
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
        <span className="text-[28px] text-accent">{effort.toFixed(1)}</span>
        <span className="text-[13px] font-medium text-sub">人月</span>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Slider label="α 名目生産性 (人月 / FP)" value={alpha.toFixed(4)} min={150} max={300} step={1} raw={aV} onChange={setA} aria="α" hint="実績データから求まる「要因が全部 L0 だったときの生産性」。" />
        <Slider label="規模 (FP)" value={fmtInt(size)} min={300} max={2400} step={50} raw={size} onChange={setSize} aria="規模" hint="ファンクションポイント。KLOC や画面数からの換算でも可。" />
        <Slider label="ΣCO 上乗せ率の合計" value={`+${sco}%`} min={0} max={150} step={1} raw={sco} onChange={setSco} aria="ΣCO" hint="各要因の CO (工数増加率) を足したもの。L0 なら 0。" />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)_28px_minmax(0,1fr)] items-stretch">
        <div className={`${box} border-line`}>
          <span className="text-[10px] text-weak">名目工数 α × 規模</span>
          <span className="n text-[18px]">
            {nominal.toFixed(1)} <span className="text-[11px] font-medium text-sub">人月</span>
          </span>
        </div>
        <div className="flex items-center justify-center text-weak">+</div>
        <div className={`${box} border-coral-frame bg-coral-bg-2`}>
          <span className="text-[10px] text-weak">上乗せ 名目 × ΣCO</span>
          <span className="n text-[18px] text-coral-soft">
            {over.toFixed(1)} <span className="text-[11px] font-medium text-sub">人月</span>
          </span>
        </div>
        <div className="flex items-center justify-center text-weak">=</div>
        <div className={`${box} border-accent bg-bg`}>
          <span className="text-[10px] text-weak">推定工数</span>
          <span className="n text-[18px] text-accent">
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
      <div className="flex justify-between text-[12px]">
        <span className="text-sub">{p.label}</span>
        <span className="n">{p.value}</span>
      </div>
      <input type="range" className="guide-range" min={p.min} max={p.max} step={p.step} value={p.raw} aria-label={p.aria} onChange={(e) => p.onChange(Number(e.target.value))} />
      <span className="text-[11px] leading-[1.5] text-weak">{p.hint}</span>
    </div>
  );
}

/** 三角分布（最良 ≤ 最頻 ≤ 最悪 を保つ） */
export function TrianglePlayground() {
  const [t, setT] = useState({ b: 18, m: 26, w: 40 });
  const X = (p: number) => 30 + (p / 100) * 470;
  const setB = (v: number) => setT((s) => ({ b: v, m: Math.max(v, s.m), w: Math.max(v, s.w) }));
  const setM = (v: number) => setT((s) => ({ m: v, b: Math.min(v, s.b), w: Math.max(v, s.w) }));
  const setW = (v: number) => setT((s) => ({ w: v, m: Math.min(v, s.m), b: Math.min(v, s.b) }));
  const mean = ((t.b + t.m + t.w) / 3).toFixed(0);
  return (
    <div className="flex flex-col gap-2.5">
      <svg width="100%" height="200" viewBox="0 0 520 200" role="img" aria-label={`三角分布。最良 ${t.b}%、最頻 ${t.m}%、最悪 ${t.w}% を結んだ三角形`}>
        <line x1="30" y1="170" x2="500" y2="170" stroke="var(--color-line)" />
        <g fontFamily="Space Grotesk" fontSize="10" fill="var(--color-weak)">
          <text x="30" y="188">0%</text>
          <text x="265" y="188" textAnchor="middle">50%</text>
          <text x="500" y="188" textAnchor="end">100%</text>
        </g>
        <polygon points={`${X(t.b)},170 ${X(t.m)},44 ${X(t.w)},170`} fill="var(--color-accent)" fillOpacity="0.18" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" />
        <line x1={X(t.m)} y1="40" x2={X(t.m)} y2="170" stroke="var(--color-accent)" strokeWidth="1" strokeDasharray="3 3" />
        <text x={X(t.b)} y="164" fontFamily="Space Grotesk" fontSize="10" fill="var(--color-sub)" textAnchor="middle">
          最良 {t.b}%
        </text>
        <text x={X(t.m)} y="32" fontFamily="Space Grotesk" fontSize="11" fontWeight="700" fill="var(--color-text)" textAnchor="middle">
          最頻 {t.m}%
        </text>
        <text x={X(t.w)} y="164" fontFamily="Space Grotesk" fontSize="10" fill="var(--color-sub)" textAnchor="middle">
          最悪 {t.w}%
        </text>
      </svg>
      <div className="grid grid-cols-3 gap-3">
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
