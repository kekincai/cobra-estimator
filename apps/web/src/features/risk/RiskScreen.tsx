import { effortAtExceedance, exceedance, type SimulationResult } from 'cobra-core';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { GenerationRow, ModelBundle } from '../../../shared/types';
import { ExceedanceCurve } from '../../ui/ExceedanceCurve';
import { fmt1, factorNo } from '../../ui/format';
import { Segmented } from '../../ui/Segmented';
import { clamp, histRange } from '../../ui/stats';
import { useMounted } from '../../ui/useMounted';
import { EstimateHeader, ScreenMessage } from '../estimate/EstimateHeader';
import { estimateTitle, useEstimateContext, useGenerationSimulation, useLevers, type EstimateContext } from '../estimate/context';

const PROBS = [5, 10, 20, 30, 50] as const;
const TABLE = [50, 30, 20, 10, 5] as const;

const verdictOf = (p: number) => (p > 0.5 ? '推定値を下回る予算' : p > 0.3 ? 'やや楽観的' : p > 0.15 ? '妥当な余裕' : '十分な余裕');

export function RiskScreen({ id }: { id: string }) {
  const { ctx, error } = useEstimateContext(id);
  const sim = useGenerationSimulation(ctx?.bundle, ctx?.reportGen);
  if (error) return <ScreenMessage>読み込めませんでした: {error.message}</ScreenMessage>;
  if (!ctx) return <ScreenMessage>読み込み中…</ScreenMessage>;
  if (!ctx.reportGen)
    return (
      <ScreenMessage>
        まだ保存された世代がありません。<Link to={`/estimate/${id}`}>工数見積り</Link>で実行すると、ここでリスクを確認できます。
      </ScreenMessage>
    );
  if (sim.error) return <ScreenMessage>シミュレーションに失敗しました: {sim.error}</ScreenMessage>;
  if (!sim.result || !sim.version) return <ScreenMessage>シミュレーション中…</ScreenMessage>;
  return <RiskView key={ctx.reportGen.id} ctx={ctx} gen={ctx.reportGen} result={sim.result} versionNo={sim.version.version} />;
}

function RiskView({ ctx, gen, result, versionNo }: { ctx: EstimateContext; gen: GenerationRow; result: SimulationResult; versionNo: number }) {
  const { bundle, estimate } = ctx;
  const samples = result.samples;
  const m = result.p50;
  const p80 = result.pct[80];
  const mounted = useMounted();

  // 横軸の範囲（保存済みの予算も入るように広げる）
  const range = useMemo(() => {
    const r = histRange(samples);
    const lo = Math.floor(Math.min(r.lo, estimate.budget ?? r.lo));
    const hi = Math.ceil(Math.max(r.hi, estimate.budget ?? r.hi));
    return { lo, hi };
  }, [samples, estimate.budget]);

  const [budget, setBudgetRaw] = useState(() => estimate.budget ?? Math.round(m * 2) / 2);
  const [budgetText, setBudgetText] = useState(fmt1(budget));
  const setBudget = (v: number) => {
    setBudgetRaw(v);
    setBudgetText(fmt1(v));
  };
  const [pSel, setPSel] = useState<number>(20);
  const [axis, setAxis] = useState<'mm' | 'ratio'>('mm');
  const [sort, setSort] = useState<'share' | 'no'>('share');
  const [unit, setUnit] = useState<'pct' | 'mm'>('pct');

  const p = exceedance(samples, budget);
  const pText = `${Math.round(p * 100)}%`;
  const effFor = (q: number) => effortAtExceedance(samples, q / 100);
  const eff = effFor(pSel);

  // 寄与度（間接要因は直接要因に含まれるので 0）
  const contribs = useMemo(() => {
    const byId = new Map(result.contributions.map((c) => [c.factorId, c]));
    const items = bundle.factors.map((f) => {
      const c = byId.get(f.id);
      return { f, lv: gen.levels[f.id] ?? 0, mm: c?.mm ?? 0, share: c?.share ?? 0 };
    });
    return sort === 'share' ? [...items].sort((a, b) => b.mm - a.mm || a.f.no - b.f.no) : items;
  }, [bundle.factors, gen.levels, result.contributions, sort]);
  const maxMM = Math.max(...contribs.map((c) => c.mm)) || 1;
  const top2 = [...contribs].sort((a, b) => b.share - a.share).slice(0, 2).reduce((s, c) => s + c.share, 0);
  let cum = 0;

  const levers = useLevers(bundle, gen, budget);
  const quick = [
    { label: `推定値 ${fmt1(m)}`, v: m },
    { label: `P80 ${fmt1(p80)}`, v: p80 },
    ...(estimate.budget !== null ? [{ label: `予算 ${fmt1(estimate.budget).replace(/\.0$/, '')}`, v: estimate.budget }] : []),
  ];

  return (
    <div className="flex flex-col gap-5 px-8 pt-6 pb-10">
      <EstimateHeader
        id={estimate.id}
        current="risk"
        meta={`${bundle.model.name} v${versionNo} ・ ${gen.label}${gen.name ? ` ${gen.name}` : ''} ・ 推定 ${fmt1(m)} 人月`}
        title={estimateTitle(estimate.name)}
        lead="予算と超過確率を行き来し、どの要因を下げれば効くかを見ます。"
      />

      <section className="grid grid-cols-12 items-start gap-4">
        {/* 超過確率曲線 */}
        <div className="tile col-span-12 flex min-w-0 flex-col gap-3 px-[26px] py-[22px] xl:col-span-8" style={{ animationDelay: '0ms' }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-[13px] font-medium">工数超過確率分布</h2>
            <Segmented
              label="横軸"
              value={axis}
              onChange={setAxis}
              options={[
                { value: 'mm', label: '工数' },
                { value: 'ratio', label: '中央値比 %' },
              ]}
            />
          </div>
          <ExceedanceCurve samples={samples} lo={range.lo} hi={range.hi} median={m} budget={budget} axis={axis} drawKey={gen.id} />
          <div className="flex flex-wrap gap-3.5 text-[11px] text-sub">
            <span>
              <span className="mr-[5px] inline-block size-2.5 rounded-[3px] bg-accent align-[-1px] opacity-40" />
              予算内の領域
            </span>
            <span>
              <span className="mr-[5px] inline-block h-[3px] w-2.5 bg-coral align-[2px]" />
              超過確率 (右へ行くほど安全)
            </span>
            <span className="ml-auto">横軸は「工数」か「中央値を 100% とした比率」で切替</span>
          </div>
        </div>

        <div className="col-span-12 flex min-w-0 flex-col gap-4 xl:col-span-4">
          {/* 工数 → 超過確率 */}
          <div className="tile flex flex-col gap-2.5 px-6 py-[22px]" style={{ animationDelay: '100ms' }}>
            <label htmlFor="r-budget" className="text-[12px] text-sub">
              工数を入れる → 超過確率
            </label>
            <div className="flex items-center gap-2.5">
              <input
                id="r-budget"
                type="text"
                inputMode="decimal"
                value={budgetText}
                onChange={(e) => {
                  setBudgetText(e.target.value);
                  const v = parseFloat(e.target.value.replace(/[^0-9.]/g, ''));
                  if (v > 0) setBudgetRaw(v);
                }}
                onBlur={() => setBudgetText(fmt1(budget))}
                className="n box-border w-full rounded-xl border border-muted bg-bg px-3.5 py-2 text-[26px] tracking-[-0.02em] text-text transition-colors focus:border-coral focus:outline-none"
              />
              <span className="whitespace-nowrap text-[12px] text-sub">人月</span>
            </div>
            <input
              type="range"
              min={range.lo}
              max={range.hi}
              step={0.5}
              value={clamp(budget, range.lo, range.hi)}
              onChange={(e) => setBudget(Number(e.target.value))}
              aria-label="工数スライダー"
              className="h-7 w-full cursor-pointer accent-coral"
            />
            <div className="flex flex-wrap gap-1.5">
              {quick.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => setBudget(Math.round(q.v * 10) / 10)}
                  className="btn min-h-7 cursor-pointer rounded-full border border-muted bg-transparent px-2.5 font-[inherit] text-[11px] text-sub hover:text-text"
                >
                  {q.label}
                </button>
              ))}
            </div>
            <div className="flex items-baseline gap-2 pt-1" aria-live="polite">
              <span className="n text-[48px] leading-none text-coral">{pText}</span>
              <span className="text-[12px] text-sub">の確率で超過 ・ {verdictOf(p)}</span>
            </div>
          </div>

          {/* 超過確率 → 必要工数 */}
          <div className="tile flex flex-col gap-2.5 px-6 py-[22px]" style={{ animationDelay: '180ms' }}>
            <span className="text-[12px] text-sub" id="r-prob-label">
              超過確率を決める → 必要な工数
            </span>
            <div role="group" aria-labelledby="r-prob-label" className="flex flex-wrap gap-1.5">
              {PROBS.map((q) => (
                <button
                  key={q}
                  type="button"
                  aria-pressed={pSel === q}
                  onClick={() => setPSel(q)}
                  className={`btn n min-h-[34px] cursor-pointer rounded-full border-0 px-3 text-[12px] ${pSel === q ? 'bg-accent text-bg' : 'bg-raised text-sub'}`}
                >
                  {q}%
                </button>
              ))}
            </div>
            <div className="flex items-baseline gap-2" aria-live="polite">
              <span className="n text-[48px] leading-none text-accent">{fmt1(eff)}</span>
              <span className="text-[12px] text-sub">人月で超過確率 {pSel}%</span>
            </div>
            <span className="text-[11px] text-weak">
              推定値 {fmt1(m)} に対して {eff - m >= 0 ? '+' : '−'}
              {fmt1(Math.abs(eff - m))} 人月 ({eff - m >= 0 ? '+' : '−'}
              {Math.abs(Math.round((eff / m - 1) * 100))}%) の余裕
            </span>
          </div>
        </div>

        {/* 寄与度 */}
        <div className="tile col-span-12 flex min-w-0 flex-col gap-3 px-[26px] py-[22px] xl:col-span-7" style={{ animationDelay: '260ms' }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-[13px] font-medium">変動要因の寄与度</h2>
            <div className="flex gap-2">
              <Segmented
                label="並び順"
                value={sort}
                onChange={setSort}
                options={[
                  { value: 'share', label: '寄与度順' },
                  { value: 'no', label: '番号順' },
                ]}
              />
              <Segmented
                label="単位"
                value={unit}
                onChange={setUnit}
                options={[
                  { value: 'pct', label: '%' },
                  { value: 'mm', label: '人月' },
                ]}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {contribs.map((c, i) => {
              cum += c.share;
              const indirect = c.f.kind === 'indirect';
              return (
                <div key={c.f.id} className="grid grid-cols-[210px_minmax(0,1fr)_64px_56px] items-center gap-3 text-[12px]">
                  <span className="truncate">
                    <span className="mr-1.5 font-num text-weak">{factorNo(c.f.no)}</span>
                    {c.f.name}
                    {indirect && ' (間接)'}{' '}
                    <span className={`n ml-1 rounded-[5px] px-1.5 py-px text-[10px] ${c.lv === 3 ? 'bg-coral text-bg' : 'bg-raised text-sub'}`}>L{c.lv}</span>
                  </span>
                  <div className="h-3 rounded-md bg-raised">
                    <div
                      className={`fill h-full rounded-md ${c.share >= 0.25 ? 'bg-accent' : c.share > 0 ? 'bg-info' : 'bg-muted'}`}
                      style={{ width: `${mounted ? Math.round((c.mm / maxMM) * 100) : 0}%`, transitionDelay: `${i * 50}ms` }}
                    />
                  </div>
                  <span className="n text-right">{indirect ? '—' : unit === 'pct' ? `${Math.round(c.share * 100)}%` : fmt1(c.mm)}</span>
                  <span className="n text-right text-[11px] text-weak">{Math.round(cum * 100)}%</span>
                </div>
              );
            })}
          </div>
          <span className="text-[11px] text-weak">
            右端は累積。上位 2 要因で上乗せの {Math.round(top2 * 100)}% を占めます。間接要因は強める直接要因の寄与に含みます。
          </span>
        </div>

        {/* 効く打ち手 + 速見表 */}
        <div className="tile col-span-12 flex min-w-0 flex-col gap-2.5 self-stretch px-6 py-[22px] xl:col-span-5" style={{ animationDelay: '340ms' }}>
          <h2 className="m-0 text-[13px] font-medium">効く打ち手 — レベルを 1 段下げたら</h2>
          <Levers bundle={bundle} levers={levers} />
          <div className="mt-auto grid grid-cols-5 gap-1.5 border-t border-line pt-2.5">
            {TABLE.map((q) => (
              <div key={q} className="flex flex-col items-center gap-0.5 rounded-[10px] bg-bg px-1 py-2">
                <span className="text-[10px] text-sub">{q}%</span>
                <span className="n text-[14px]">{fmt1(effFor(q))}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function Levers({ bundle, levers }: { bundle: ModelBundle; levers: ReturnType<typeof useLevers> }) {
  if (!levers) return <p className="m-0 py-3 text-[12px] text-weak">計算中…</p>;
  if (levers.length === 0) return <p className="m-0 py-3 text-[12px] text-weak">L1 以上の直接要因がありません。</p>;
  return (
    <>
      {levers.map((lv) => {
        const f = bundle.factors.find((x) => x.id === lv.factorId);
        if (!f) return null;
        return (
          <div key={lv.factorId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl bg-bg px-3 py-2.5 transition-colors hover:bg-raised">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[12px] font-medium">
                {f.name}{' '}
                <span className="text-weak">
                  L{lv.fromLevel} → L{lv.toLevel}
                </span>
              </span>
              <span className="truncate text-[11px] text-sub" title={`${f.levels[lv.fromLevel as 0 | 1 | 2 | 3]} → ${f.levels[lv.toLevel as 0 | 1 | 2 | 3]}`}>
                「{f.levels[lv.fromLevel as 0 | 1 | 2 | 3]}」を「{f.levels[lv.toLevel as 0 | 1 | 2 | 3]}」にする
              </span>
            </span>
            <span className="flex flex-col items-end gap-0.5">
              <span className="n text-[18px] text-ok">
                {lv.deltaP50 <= 0 ? '−' : '+'}
                {fmt1(Math.abs(lv.deltaP50))} 人月
              </span>
              {lv.exceedance !== null && <span className="text-[10px] text-weak">超過確率 {Math.round(lv.exceedance * 100)}%</span>}
            </span>
          </div>
        );
      })}
    </>
  );
}
