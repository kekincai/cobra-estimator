import { effortAtExceedance, exceedance, type Lever, type SimulationResult } from 'cobra-core';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { FactorRow, GenerationRow, ModelVersionRow, ProjectRow } from '../../../shared/types';
import { useMe, useProjects } from '../../data/api';
import { factorNo, fmt1, fmtInt } from '../../ui/format';
import { binSamples, histRange, niceTicks } from '../../ui/stats';
import { MEMO_KEY, expertLabel, useEstimateContext, useGenerationSimulation, useLevers, type EstimateContext } from '../estimate/context';
import './report.css';

const ROLE_LABEL = { admin: 'モデル管理者', estimator: '見積り担当', pmo: 'PMO' } as const;
const PROB_ROWS = [50, 30, 20, 10, 5] as const;

const ymd = (iso: string | Date) => {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
};
const hm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const signed = (v: number) => `${v >= 0 ? '+' : '−'}${fmt1(Math.abs(v))}`;
const trimZero = (s: string) => s.replace(/\.0$/, '');
const lvText = (f: FactorRow, l: number) => f.levels[Math.max(0, Math.min(3, l)) as 0 | 1 | 2 | 3];

function Shell({ children, toolbar }: { children: ReactNode; toolbar?: ReactNode }) {
  return (
    <div className="rp-wrap">
      <div className="rp-toolbar">{toolbar}</div>
      <div className="rp-page">{children}</div>
    </div>
  );
}

export function ReportScreen({ id }: { id: string }) {
  const { ctx, error } = useEstimateContext(id);
  const gen = ctx?.reportGen;
  const sim = useGenerationSimulation(ctx?.bundle, gen);
  const levers = useLevers(ctx?.bundle, gen, ctx?.estimate.budget ?? null, 0);
  const projects = useProjects();
  const me = useMe();
  const back = <Link to={`/estimate/${id}`}>← 工数見積りへ戻る</Link>;

  if (error) return <Shell toolbar={back}>読み込めませんでした: {error.message}</Shell>;
  if (!ctx) return <Shell toolbar={back}>読み込み中…</Shell>;
  if (!gen)
    return (
      <Shell toolbar={back}>
        <p className="m-0">
          まだ保存された世代がありません。<Link to={`/estimate/${id}`}>工数見積り</Link>で実行してからレポートを作成してください。
        </p>
      </Shell>
    );
  if (sim.error) return <Shell toolbar={back}>シミュレーションに失敗しました: {sim.error}</Shell>;
  if (!sim.result || !sim.version) return <Shell toolbar={back}>レポートを準備中…</Shell>;

  const user = me.data?.user;
  return (
    <Shell
      toolbar={
        <>
          {back}
          <span>
            世代 <b className="text-ink">{gen.label}</b> のレポート ・ 世代は工数見積りの「世代の比較」で変更
          </span>
          <button type="button" className="rp-print" onClick={() => window.print()}>
            印刷 / PDF として保存
          </button>
        </>
      }
    >
      <Report
        ctx={ctx}
        gen={gen}
        result={sim.result}
        version={sim.version}
        levers={levers}
        projects={projects.data ?? []}
        author={user ? `${user.name} (${ROLE_LABEL[user.role]})` : '—'}
        authorName={user?.name ?? '—'}
      />
    </Shell>
  );
}

function Report({
  ctx,
  gen,
  result,
  version,
  levers,
  projects,
  author,
  authorName,
}: {
  ctx: EstimateContext;
  gen: GenerationRow;
  result: SimulationResult;
  version: ModelVersionRow;
  levers: Lever[] | null;
  projects: ProjectRow[];
  author: string;
  authorName: string;
}) {
  const { bundle, estimate } = ctx;
  const factors = bundle.factors;
  const samples = result.samples;
  const { nominal, p50, pct, scoExpected: sco } = result;
  const overhead = p50 - nominal;
  const budget = estimate.budget;
  const pBudget = budget !== null ? exceedance(samples, budget) : null;
  const memo = gen.notes[MEMO_KEY] ?? '';
  const experts = [...new Set(factors.flatMap((f) => f.triangles.map((t) => t.expert)))];
  const expertMode = version.expertMode;
  const now = new Date();

  // 要因表
  const contrib = new Map(result.contributions.map((c) => [c.factorId, c]));
  const coOf = (f: FactorRow) => (nominal > 0 ? (contrib.get(f.id)?.mm ?? 0) / nominal : 0);
  const maxCo = Math.max(...factors.map(coOf)) || 1;
  const noOf = (fid: string | null) => factors.find((f) => f.id === fid)?.no ?? 0;
  const l3 = factors.filter((f) => f.kind === 'direct' && (gen.levels[f.id] ?? 0) === 3).length;
  const top2 = [...result.contributions].slice(0, 2);
  const top2Names = top2.map((c) => factors.find((f) => f.id === c.factorId)?.name ?? c.factorId).join('と');
  const top2Share = top2.reduce((s, c) => s + c.share, 0);

  // モデル情報（実績は件数と範囲だけ。個別の工数は載せない）
  const group = bundle.groups.find((g) => g.id === version.groupId);
  const inGroup = projects.filter((p) => !version.groupId || p.groupId === version.groupId);
  const adopted = inGroup.filter((p) => p.adopted);
  const excluded = inGroup.filter((p) => !p.adopted).map((p) => p.id);
  const sizeLo = adopted.length ? Math.min(...adopted.map((p) => p.sizeFP)) : null;
  const sizeHi = adopted.length ? Math.max(...adopted.map((p) => p.sizeFP)) : null;
  const inRange = sizeLo !== null && sizeHi !== null && gen.sizeFP >= sizeLo && gen.sizeFP <= sizeHi;
  const outBand = version.loo.filter((l) => l.mre > 0.25).map((l) => l.projectId);

  const memoItems = memo
    .split(/\n|(?<=。)/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <>
      <header className="flex flex-col gap-[18px]">
        <div className="flex items-center justify-between text-[9pt] text-ink-sub">
          <span className="inline-flex items-center gap-2">
            <span className="relative inline-block size-3.5 rounded bg-ink">
              <span className="absolute top-[3px] left-[3px] size-2 rounded-[2px] bg-lime" />
            </span>
            <span className="font-bold text-ink">Estima</span>
            <span>CoBRA 法に基づく工数見積り</span>
          </span>
          <span>
            見積りレポート ・ No. EST-{now.getFullYear()}-{estimate.id.toUpperCase()}-{gen.label} ・ 作成 {ymd(now)}
          </span>
        </div>
        <div className="flex items-end justify-between gap-6 border-b-[3px] border-ink pb-[18px]">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="rp-lab">案件</span>
            <h1 className="rp-title n m-0 text-[26pt] leading-[1.15]">{estimate.name}</h1>
            <div className="mt-1 flex flex-wrap gap-x-[18px] gap-y-1.5 text-[9.5pt] text-ink-sub">
              <span>
                見積り世代 <b className="text-ink">{gen.label}</b>
              </span>
              <span>
                作成者 <b className="text-ink">{author}</b>
              </span>
              <span>
                モデル{' '}
                <b className="text-ink">
                  {bundle.model.name} v{version.version}
                </b>
              </span>
              <span>
                規模 <b className="rp-m text-ink">{fmtInt(gen.sizeFP)} FP</b>
              </span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <span className="rp-lab">推定工数 (超過確率 50%)</span>
            <span className="flex items-baseline gap-1.5">
              <span className="rp-hero n text-[44pt] leading-none">{fmt1(p50)}</span>
              <span className="text-[11pt] text-ink-sub">人月</span>
            </span>
            <span className="mt-1 text-[9.5pt] text-ink-sub">
              80% の確度なら <b className="rp-m text-ink">{fmt1(pct[80])} 人月</b>
            </span>
          </div>
        </div>
      </header>

      <section className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[10pt] font-bold">工数の見込み幅 — P5 〜 P95</span>
          <span className="text-[9pt] text-ink-sub">{fmtInt(gen.runs)} 回のモンテカルロ・シミュレーション ・ 単位 人月</span>
        </div>
        <RangeBar result={result} budget={budget} pBudget={pBudget} />
      </section>

      <section className="flex flex-col gap-3">
        <h2>
          <span className="no">01</span>見積りの考え方
        </h2>
        <div className="grid grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)_28px_minmax(0,1fr)] items-stretch">
          <div className="flex flex-col gap-0.5 rounded-[10px] border border-ink px-3.5 py-3">
            <span className="rp-lab">名目工数 = α × 規模</span>
            <span className="n text-[18pt] leading-[1.1]">
              {fmt1(nominal)} <span className="text-[10pt] font-medium">人月</span>
            </span>
            <span className="rp-m text-[9.5pt] text-ink-sub">
              {version.alpha.toFixed(4)} × {fmtInt(gen.sizeFP)} FP
            </span>
          </div>
          <div className="flex items-center justify-center text-[16pt] text-ink-sub">+</div>
          <div className="flex flex-col gap-0.5 rounded-[10px] border border-paper-line bg-paper-tint px-3.5 py-3">
            <span className="rp-lab">上乗せ = 名目 × ΣCO</span>
            <span className="n text-[18pt] leading-[1.1]">
              {fmt1(overhead)} <span className="text-[10pt] font-medium">人月</span>
            </span>
            <span className="rp-m text-[9.5pt] text-ink-sub">
              {fmt1(nominal)} × {sco.toFixed(2)} ({factors.length} 要因の合計)
            </span>
          </div>
          <div className="flex items-center justify-center text-[16pt] text-ink-sub">=</div>
          <div className="flex flex-col gap-0.5 rounded-[10px] bg-ink px-3.5 py-3 text-paper">
            <span className="rp-lab" style={{ color: 'var(--color-ink-invert-sub)' }}>
              推定工数 (中央値)
            </span>
            <span className="n text-[18pt] leading-[1.1] text-lime">
              {fmt1(p50)} <span className="text-[10pt] font-medium text-paper">人月</span>
            </span>
            <span className="rp-m text-[9.5pt] text-ink-invert-sub">
              {fmt1(nominal)} × (1 + {sco.toFixed(2)})
            </span>
          </div>
        </div>
        <p className="m-0 text-[10.5pt]">
          CoBRA 法では、実績データから求めた名目生産性 α に規模を掛けて名目工数を算出し、変動要因ごとの工数増加率 (CO) の合計 ΣCO によって上乗せを加えます。CO は
          {expertMode.kind === 'expert'
            ? `専門家 ${expertMode.expert} が示した三角分布 (最良・最頻・最悪) を用い`
            : `専門家 ${experts.length} 名 (${experts.join(', ')}) が示した三角分布 (最良・最頻・最悪) の平均を用い`}
          、乱数シード固定の {fmtInt(gen.runs)} 回シミュレーションで工数の分布を求めました。推定値は超過確率 50% (中央値) です。
        </p>
      </section>

      <section className="rp-flow flex flex-col gap-2.5">
        <h2>
          <span className="no">02</span>見積り条件 — 変動要因のレベル値と寄与
        </h2>
        <table>
          <thead>
            <tr>
              <th style={{ width: 28 }}>No</th>
              <th>変動要因</th>
              <th style={{ width: 40 }}>レベル</th>
              <th>判断の根拠</th>
              <th style={{ width: 128 }}>CO</th>
              <th className="r" style={{ width: 72 }}>
                寄与 (人月)
              </th>
            </tr>
          </thead>
          <tbody>
            {factors.map((f) => {
              const l = gen.levels[f.id] ?? 0;
              const indirect = f.kind === 'indirect';
              const co = coOf(f);
              const basis = gen.notes[f.id] || lvText(f, l);
              return (
                <tr key={f.id}>
                  <td className="rp-m">{factorNo(f.no)}</td>
                  <td className="font-medium whitespace-nowrap">
                    {f.name}
                    {indirect && <span className="text-[9pt] text-ink-sub"> (間接)</span>}
                  </td>
                  <td>
                    <LevelPill level={l} />
                  </td>
                  <td className="text-[10pt] text-ink-body">
                    {basis}
                    {indirect && ` ・ 要因 ${factorNo(noOf(f.targetFactorId))} を強める`}
                  </td>
                  {indirect ? (
                    <>
                      <td className="text-[9.5pt] text-ink-sub">{factorNo(noOf(f.targetFactorId))} に含む</td>
                      <td className="r rp-m text-ink-sub">—</td>
                    </>
                  ) : (
                    <>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="rp-bar flex-1">
                            {co > 0 && <i style={{ width: `${Math.round((co / maxCo) * 100)}%` }} />}
                          </div>
                          <span className="rp-m w-9 text-right text-[10pt]">+{Math.round(co * 100)}%</span>
                        </div>
                      </td>
                      <td className="r n">{fmt1(contrib.get(f.id)?.mm ?? 0)}</td>
                    </>
                  )}
                </tr>
              );
            })}
            <tr className="bg-paper-soft">
              <td />
              <td className="font-bold" style={{ borderBottom: '1.5px solid var(--color-ink)' }}>
                合計 ΣCO
              </td>
              <td style={{ borderBottom: '1.5px solid var(--color-ink)' }} />
              <td className="text-[10pt] text-ink-sub" style={{ borderBottom: '1.5px solid var(--color-ink)' }}>
                {l3 > 0 ? `L3 が ${l3} 件 — ` : ''}
                {top2.length ? `${top2Names}が上乗せの ${Math.round(top2Share * 100)}% を占める` : ''}
              </td>
              <td className="n text-right text-[11pt]" style={{ borderBottom: '1.5px solid var(--color-ink)' }}>
                +{Math.round(sco * 100)}%
              </td>
              <td className="r n text-[11pt]" style={{ borderBottom: '1.5px solid var(--color-ink)' }}>
                {fmt1(result.contributions.reduce((s, c) => s + c.mm, 0))}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-3">
        <h2>
          <span className="no">03</span>見積り結果とリスク
        </h2>
        <div className="rp-results grid grid-cols-[minmax(0,384fr)_minmax(0,344fr)] gap-7">
          <div className="flex flex-col gap-2">
            <span className="text-[10pt] font-bold">工数の分布 ({fmtInt(gen.runs)} 回)</span>
            <PrintHistogram result={result} budget={budget} />
            <span className="text-[9pt] text-ink-sub">
              黄緑: 推定値 〜 P80 の帯 (ここに {Math.round((exceedance(samples, p50) - exceedance(samples, pct[80])) * 100)}% の試行が入る)
            </span>
          </div>
          <div className="flex flex-col gap-2.5">
            <span className="text-[10pt] font-bold">超過確率と必要工数</span>
            <table>
              <thead>
                <tr>
                  <th>超過確率</th>
                  <th className="r">工数 (人月)</th>
                  <th className="r">推定値比</th>
                  {budget !== null && <th className="r">予算 {trimZero(fmt1(budget))} との差</th>}
                </tr>
              </thead>
              <tbody>
                {PROB_ROWS.map((q) => {
                  const e = effortAtExceedance(samples, q / 100);
                  return (
                    <tr key={q} className={q === 50 ? 'bg-paper-soft' : undefined}>
                      <td className={`whitespace-nowrap ${q === 50 ? 'font-bold' : ''}`}>{q === 50 ? '50% (推定値)' : `${q}%`}</td>
                      <td className="r n">{fmt1(e)}</td>
                      <td className="r rp-m">{Math.round((e / p50) * 100)}%</td>
                      {budget !== null && <td className="r rp-m">{signed(e - budget)}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {budget !== null && pBudget !== null && (
              <p className="m-0 border-l-[3px] border-ink bg-paper-soft px-3 py-2.5 text-[10pt]">
                予算 {trimZero(fmt1(budget))} 人月では超過確率 <b className="rp-m">{Math.round(pBudget * 100)}%</b>。
                {pct[80] > budget ? (
                  <>
                    80% の確度で収めるには <b className="rp-m">{fmt1(pct[80])} 人月</b> ({signed(pct[80] - budget)}) の確保を推奨します。
                  </>
                ) : (
                  <>80% 以上の確度で予算内に収まる見込みです。</>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="mt-1 flex flex-col gap-1.5">
          <span className="text-[10pt] font-bold">工数を下げる打ち手 — 要因を 1 段階下げた場合</span>
          <div className="grid grid-cols-3 gap-2.5">
            {(levers ?? []).map((lv) => {
              const f = factors.find((x) => x.id === lv.factorId);
              if (!f) return null;
              return (
                <div key={lv.factorId} className="flex flex-col gap-0.5 rounded-[10px] border border-paper-line px-3 py-2.5">
                  <span className="text-[9.5pt] text-ink-sub">
                    {factorNo(f.no)} {f.name}{' '}
                    <span className="rp-m">
                      L{lv.fromLevel} → L{lv.toLevel}
                    </span>
                  </span>
                  <span className="text-[10.5pt]">
                    <b className="n">{signed(lv.deltaP50)}</b> 人月
                    {lv.exceedance !== null && pBudget !== null && (
                      <>
                        {' '}
                        ・ 超過確率 {Math.round(pBudget * 100)}% → <b className="rp-m">{Math.round(lv.exceedance * 100)}%</b>
                      </>
                    )}
                  </span>
                  <span className="text-[9pt] text-ink-sub">
                    「{lvText(f, lv.fromLevel)}」を「{lvText(f, lv.toLevel)}」にする
                  </span>
                </div>
              );
            })}
            {levers === null && <span className="text-[9pt] text-ink-sub">計算中…</span>}
            {levers?.length === 0 && <span className="text-[9pt] text-ink-sub">L1 以上の直接要因がありません。</span>}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2.5">
        <h2>
          <span className="no">04</span>使用した見積りモデル
        </h2>
        <div className="rp-model grid grid-cols-[minmax(0,1fr)_232px] items-start gap-7">
          <div className="grid grid-cols-2 gap-x-7">
            <div className="rp-kv">
              <span>モデル名</span>
              <span>
                {bundle.model.name} v{version.version}
              </span>
            </div>
            <div className="rp-kv">
              <span>構築日 / 構築者</span>
              <span>
                {ymd(version.builtAt)} ・ {version.builtBy}
              </span>
            </div>
            <div className="rp-kv">
              <span>名目生産性 α</span>
              <span className="rp-m">{version.alpha.toFixed(4)} 人月/FP</span>
            </div>
            <div className="rp-kv">
              <span>α の 95% 信頼区間</span>
              <span className="rp-m">{version.ciLo !== null && version.ciHi !== null ? `${version.ciLo.toFixed(4)} – ${version.ciHi.toFixed(4)}` : '—'}</span>
            </div>
            <div className="rp-kv">
              <span>実績データ</span>
              <span>
                {group ? `グループ ${group.id}` : '全グループ'} ・ {version.n} 件採用{excluded.length ? ` (${excluded.join(', ')} 除外)` : ''}
              </span>
            </div>
            <div className="rp-kv">
              <span>規模の範囲</span>
              <span className="rp-m">{sizeLo !== null && sizeHi !== null ? `${fmtInt(sizeLo)} – ${fmtInt(sizeHi)} FP` : '—'}</span>
            </div>
            <div className="rp-kv">
              <span>三角分布</span>
              <span>{expertLabel(bundle, expertMode)}</span>
            </div>
            <div className="rp-kv">
              <span>乱数シード</span>
              <span className="rp-m">{gen.seed} (再現可能)</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-[10px] border border-ink px-3.5 py-3">
            <span className="rp-lab">精度 (1 件抜き交差検証)</span>
            <div className="flex items-baseline justify-between">
              <span className="text-[10pt]">MMRE</span>
              <span className="n text-[16pt]">{version.mmre !== null ? `${(version.mmre * 100).toFixed(1)}%` : '—'}</span>
            </div>
            <div className="rp-bar" style={{ height: 6 }}>
              <i style={{ width: `${Math.min(100, (version.mmre ?? 0) * 200)}%`, background: 'var(--color-ink)', border: 0 }} />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10pt]">PRED(25)</span>
              <span className="n text-[16pt]">{version.pred25 !== null ? `${Math.round(version.pred25 * 100)}%` : '—'}</span>
            </div>
            <div className="rp-bar" style={{ height: 6 }}>
              <i style={{ width: `${Math.round((version.pred25 ?? 0) * 100)}%` }} />
            </div>
            <span className="text-[9pt] text-ink-sub">
              {version.pred25 !== null && `${version.n} 件中 ${Math.round(version.pred25 * version.n)} 件が誤差 ±25% 以内。`}
              {outBand.length > 0 && `帯外は ${outBand.join(', ')}`}
            </span>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2>
          <span className="no">05</span>前提と注意事項
        </h2>
        <ul className="m-0 flex list-disc flex-col gap-[3px] pl-[18px] text-[10pt] text-ink-body">
          {memoItems.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
          {sizeLo !== null && sizeHi !== null && (
            <li>
              モデルの実績データは {fmtInt(sizeLo)} 〜 {fmtInt(sizeHi)} FP の範囲。本案件 ({fmtInt(gen.sizeFP)} FP) は
              {inRange ? 'その範囲内にあり、外挿にはあたらない。' : 'その範囲外にあり外挿となるため、結果の幅は実際より狭く出ている可能性がある。'}
            </li>
          )}
          <li>推定値は超過確率 50% (中央値)。予算・要員計画には P80 など超過確率に応じた値を併せて用いる。</li>
          <li>本レポートは見積り結果のみを含み、実績データ (個別プロジェクトの工数) は含まない。</li>
        </ul>
      </section>

      <section className="mt-1 grid grid-cols-3 gap-3">
        <SignBox label="作成" value={`${authorName} ・ ${ymd(now)}`} />
        <SignBox label="確認 (モデル管理者)" value={`${version.builtBy} ・ ____/__/__`} muted />
        <SignBox label="承認 (PM)" value="____________ ・ ____/__/__" muted />
      </section>

      <footer className="flex justify-between border-t border-paper-line pt-3 text-[9pt] text-ink-sub">
        <span>
          Estima — CoBRA 法に基づく工数見積り支援 ・ 世代 {gen.label} ({ymd(gen.createdAt)} {hm(gen.createdAt)} 実行)
        </span>
        <span>社外秘</span>
      </footer>
    </>
  );
}

function LevelPill({ level }: { level: number }) {
  const cls =
    level === 3
      ? 'bg-ink text-paper border-ink'
      : level === 2
        ? 'border-ink'
        : level === 1
          ? 'border-paper-pill'
          : 'border-paper-pill text-ink-sub';
  return <span className={`rp-m inline-block rounded-full border px-[7px] py-px text-[9pt] ${cls}`}>L{level}</span>;
}

function SignBox({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex flex-col gap-3.5 rounded-[10px] border border-paper-line px-3 py-2.5">
      <span className="rp-lab">{label}</span>
      <span className={`border-b border-ink pb-1 text-[10.5pt] ${muted ? 'text-ink-sub' : ''}`}>{value}</span>
    </div>
  );
}

/** P5〜P95 の見込み幅（印刷用 SVG） */
function RangeBar({ result, budget, pBudget }: { result: SimulationResult; budget: number | null; pBudget: number | null }) {
  const { pct, p50 } = result;
  const W = 756;
  const span = pct[95] - pct[5] || 1;
  const lo = Math.floor(Math.min(pct[5], budget ?? Infinity) - span * 0.12);
  const hi = Math.ceil(Math.max(pct[95], budget ?? -Infinity) + span * 0.36);
  const X = (v: number) => ((v - lo) / (hi - lo)) * W;
  const label = `工数の見込み幅。P5 ${fmt1(pct[5])}、P20 ${fmt1(pct[20])}、推定 ${fmt1(p50)}、P80 ${fmt1(pct[80])}、P95 ${fmt1(pct[95])} 人月${budget !== null ? `。予算 ${fmt1(budget)} 人月` : ''}`;
  const marks: { v: number; text: string; strong?: boolean }[] = [
    { v: pct[5], text: `P5 ${fmt1(pct[5])}` },
    { v: pct[20], text: `P20 ${fmt1(pct[20])}` },
    { v: p50, text: `推定 ${fmt1(p50)}`, strong: true },
    { v: pct[80], text: `P80 ${fmt1(pct[80])}` },
    { v: pct[95], text: `P95 ${fmt1(pct[95])}` },
  ];
  return (
    <svg viewBox={`0 0 ${W} 92`} className="h-auto w-full" role="img" aria-label={label}>
      <rect x={0} y={40} width={W} height={10} rx={5} fill="var(--color-paper-track)" />
      <rect x={X(pct[5])} y={40} width={X(pct[95]) - X(pct[5])} height={10} rx={5} fill="var(--color-paper-band)" />
      <rect x={X(pct[20])} y={40} width={X(pct[80]) - X(pct[20])} height={10} rx={5} fill="var(--color-lime)" />
      <rect x={X(p50) - 1.5} y={36} width={3} height={18} fill="var(--color-ink)" />
      {budget !== null && <line x1={X(budget)} y1={30} x2={X(budget)} y2={62} stroke="var(--color-ink)" strokeWidth={1.5} strokeDasharray="3 3" />}
      {marks.map((m) => (
        <text
          key={m.text}
          x={X(m.v)}
          y={26}
          fontFamily="var(--font-num)"
          fontSize={m.strong ? 12 : 10}
          fontWeight={m.strong ? 700 : 400}
          fill={m.strong ? 'var(--color-ink)' : 'var(--color-ink-sub)'}
          textAnchor="middle"
        >
          {m.text}
        </text>
      ))}
      {budget !== null && pBudget !== null && (
        <text x={X(budget)} y={80} fontFamily="var(--font-sans)" fontSize={10} fill="var(--color-ink)" textAnchor="middle">
          予算 {trimZero(fmt1(budget))} ・ 超過確率 {Math.round(pBudget * 100)}%
        </text>
      )}
      <text x={0} y={80} fontFamily="var(--font-num)" fontSize={10} fill="var(--color-ink-faint)">
        {lo}
      </text>
      <text x={W} y={80} fontFamily="var(--font-num)" fontSize={10} fill="var(--color-ink-faint)" textAnchor="end">
        {hi}
      </text>
    </svg>
  );
}

/** 工数分布のヒストグラム（印刷用 SVG）。推定〜P80 を黄緑、推定・P80・予算に線。 */
function PrintHistogram({ result, budget }: { result: SimulationResult; budget: number | null }) {
  const W = 384;
  const BASE = 144;
  const N = 24;
  const r = histRange(result.samples);
  const lo = Math.min(r.lo, budget ?? Infinity);
  const hi = Math.max(r.hi, budget ?? -Infinity);
  const counts = binSamples(result.samples, lo, hi, N);
  const max = Math.max(1, ...counts);
  const bw = W / N;
  const X = (v: number) => ((v - lo) / (hi - lo)) * W;
  const p50 = result.p50;
  const p80 = result.pct[80];
  const ticks = niceTicks(lo, hi, 4).filter((v) => X(v) > 8 && X(v) < W - 8);
  return (
    <svg viewBox={`0 0 ${W} 168`} className="h-auto w-full" role="img" aria-label={`工数分布のヒストグラム。推定 ${fmt1(p50)}、P80 ${fmt1(p80)}${budget !== null ? `、予算 ${fmt1(budget)}` : ''} 人月の位置を示す`}>
      {counts.map((c, i) => {
        const mid = lo + (hi - lo) * ((i + 0.5) / N);
        const on = mid >= p50 && mid <= p80;
        const h = Math.max(c > 0 ? 2 : 0, (c / max) * 130);
        return (
          <rect
            key={i}
            x={i * bw + 2}
            y={BASE - h}
            width={bw - 3}
            height={h}
            fill={on ? 'var(--color-lime)' : 'var(--color-paper-band)'}
            stroke={on ? 'var(--color-ink)' : 'none'}
            strokeWidth={on ? 1 : 0}
          />
        );
      })}
      <line x1={0} y1={BASE + 0.5} x2={W} y2={BASE + 0.5} stroke="var(--color-ink)" strokeWidth={1} />
      <line x1={X(p50)} y1={4} x2={X(p50)} y2={BASE} stroke="var(--color-ink)" strokeWidth={2} />
      <text x={X(p50) + 4} y={10} fontFamily="var(--font-num)" fontSize={10} fontWeight={700} fill="var(--color-ink)">
        推定 {fmt1(p50)}
      </text>
      <line x1={X(p80)} y1={40} x2={X(p80)} y2={BASE} stroke="var(--color-ink)" strokeWidth={1.5} strokeDasharray="3 3" />
      <text x={X(p80) + 4} y={46} fontFamily="var(--font-num)" fontSize={10} fill="var(--color-ink-sub)">
        P80 {fmt1(p80)}
      </text>
      {budget !== null && (
        <>
          <line x1={X(budget)} y1={26} x2={X(budget)} y2={BASE} stroke="var(--color-ink-sub)" strokeWidth={1} strokeDasharray="2 3" />
          <text x={X(budget) + 4} y={30} fontFamily="var(--font-sans)" fontSize={9} fill="var(--color-ink-sub)">
            予算 {trimZero(fmt1(budget))}
          </text>
        </>
      )}
      <g fontFamily="var(--font-num)" fontSize={10} fill="var(--color-ink-faint)">
        {ticks.map((v, i) => (
          <text key={v} x={X(v)} y={162} textAnchor="middle">
            {v}
            {i === ticks.length - 1 ? ' 人月' : ''}
          </text>
        ))}
      </g>
    </svg>
  );
}
