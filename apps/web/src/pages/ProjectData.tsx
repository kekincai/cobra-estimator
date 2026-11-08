// 実績データ（design/ProjectData.dc.html）
import { resolveTriangle, triMean } from 'cobra-core';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toModelSpec } from '../../shared/types';
import { useEstimate, useMe, useModel, useProjects } from '../data/api';
import { alphaOf, factorLevels, gapOf, isInconsistent, projectStats } from '../features/projects/calc';
import { FactorLevelChips } from '../features/projects/FactorLevelChips';
import { nextSort, prodSummary, sizeBins, sortStats, type SortDir, type SortKey } from '../features/projects/listStats';
import { useToggleAdopted } from '../features/projects/mutations';
import { ProjectScatter } from '../features/projects/ProjectScatter';
import { describeApiError } from '../ui/apiError';
import { HelpLink } from '../ui/HelpLink';
import { CURRENT_ESTIMATE_ID } from '../ui/Layout';
import { Switch } from '../ui/Switch';

const ALL = '__all__';

const COLUMNS: { key: SortKey | null; label: string; numeric?: boolean }[] = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'プロジェクト名' },
  { key: 'group', label: 'グループ' },
  { key: 'size', label: '規模 FP', numeric: true },
  { key: 'effort', label: '工数 人月', numeric: true },
  { key: 'prod', label: '生産性', numeric: true },
  { key: null, label: '要因レベル' },
  { key: null, label: '備考' },
  { key: null, label: '採用' },
];

export default function ProjectDataPage() {
  const model = useModel();
  const projects = useProjects();
  const me = useMe();
  const estimate = useEstimate(CURRENT_ESTIMATE_ID);
  const toggle = useToggleAdopted();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [group, setGroup] = useState<string>(ALL);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  const bundle = model.data;
  const spec = useMemo(() => (bundle ? toModelSpec(bundle, bundle.activeVersion?.expertMode) : null), [bundle]);
  const rows = useMemo(() => projects.data ?? [], [projects.data]);
  const canEdit = !!me.data?.user && ['admin', 'pmo'].includes(me.data.user.role);

  const allStats = useMemo(() => (spec ? projectStats(spec, rows) : []), [spec, rows]);
  // チャートと α はグループ絞り込みに従う
  const stats = useMemo(() => allStats.filter((s) => group === ALL || s.row.groupId === group), [allStats, group]);
  const alpha = alphaOf(stats);
  const used = stats.filter((s) => s.row.adopted);
  const warnIds = useMemo(
    () => new Set(alpha === null ? [] : stats.filter((s) => isInconsistent(gapOf(s, alpha))).map((s) => s.row.id)),
    [stats, alpha],
  );

  const prod = prodSummary(used);

  // 規模の分布（採用分）6 ビン。軸の外にある見積り対象はどのビンも強調しない
  const gen = estimate.data?.generations.find((g) => g.id === estimate.data?.reportGenerationId) ?? estimate.data?.generations.at(-1);
  const estSize = gen?.sizeFP ?? null;
  const dist = sizeBins(stats.map((s) => s.row.sizeFP), used.map((s) => s.row.sizeFP), estSize);
  const bmax = Math.max(...dist.bins) || 1;

  // L3 の実績: L3 の CO が大きい直接要因の上位 2 つと、その他
  const l3 = useMemo(() => {
    if (!spec) return null;
    const direct = spec.factors.filter((f) => f.kind === 'direct');
    const ranked = [...direct].sort((a, b) => triMean(resolveTriangle(b, spec.expertMode)) - triMean(resolveTriangle(a, spec.expertMode)));
    const count = (id: string) => used.filter((s) => (s.row.levels[id] ?? 0) === 3).length;
    const top = ranked.slice(0, 2).map((f) => ({ name: f.name, n: count(f.id) }));
    const others = spec.factors.filter((f) => !ranked.slice(0, 2).includes(f)).reduce((a, f) => a + count(f.id), 0);
    return { top, others, few: top.some((t) => t.n < 3) };
  }, [spec, used]);

  const q = query.trim().toLowerCase();
  const filtered = allStats.filter(
    (s) => (group === ALL || s.row.groupId === group) && (!q || s.row.name.toLowerCase().includes(q) || s.row.id.toLowerCase().includes(q)),
  );
  const shown = sort ? sortStats(filtered, sort.key, sort.dir) : filtered;
  const hitIds = useMemo(() => (q ? new Set(filtered.map((s) => s.row.id)) : undefined), [q, filtered]);
  const excludedCount = rows.filter((r) => !r.adopted).length;
  const groupEmpty = !projects.isPending && stats.length === 0;
  const noneUsed = !projects.isPending && used.length === 0;
  const groupName = group === ALL ? 'すべて' : `グループ ${group}`;
  const addHref = group === ALL ? '/model/projects/new' : `/model/projects/new?group=${encodeURIComponent(group)}`;

  if (model.isError || projects.isError) {
    return (
      <div className="px-4 py-8 sm:px-8">
        <div role="alert" className="tile flex flex-col items-start gap-3 p-8">
          <span className="text-coral-ink">実績データを読み込めませんでした。{describeApiError(model.error ?? projects.error)}</span>
          <button
            type="button"
            onClick={() => {
              void model.refetch();
              void projects.refetch();
            }}
            className="btn inline-flex min-h-10 cursor-pointer items-center rounded-[10px] border-0 bg-accent px-4 text-[13px] font-bold text-bg"
          >
            再試行
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-5 px-4 pt-6 pb-10 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="inline-flex items-center gap-2 text-[11px] text-sub">
            <span className="size-1.5 rounded-full bg-teal" />
            {bundle ? `${bundle.model.name}${bundle.activeVersion ? ` v${bundle.activeVersion.version}` : ''}` : '読み込み中…'}
          </span>
          <h1 className="n m-0 flex flex-wrap items-baseline gap-x-2 text-[30px] leading-[1.1]">
            実績データ
            <span className="text-[16px] font-medium tracking-normal text-sub">
              {projects.isPending ? '' : `${rows.length} 件 ・ 採用 ${rows.length - excludedCount} ・ 除外 ${excludedCount}`}
            </span>
            <HelpLink section="build" className="self-center" />
          </h1>
          <span className="text-[12px] text-sub">
            過去プロジェクトの規模・工数と要因レベル。α を求める材料です。機密データなので、エクスポート時に含めるかを選べます。
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/transfer?tab=csv"
            className="btn inline-flex min-h-10 items-center rounded-[10px] border border-muted bg-card px-3.5 text-[13px] font-medium text-text no-underline"
          >
            CSV から取り込む
          </Link>
          <Link
            to="/model/projects/new"
            className="btn inline-flex min-h-10 items-center rounded-[10px] bg-accent px-4 text-[13px] font-bold text-bg no-underline"
          >
            + プロジェクトを追加
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-12 gap-4">
        <div className="tile col-span-12 flex min-w-0 flex-col gap-2.5 px-4 py-[22px] sm:px-[26px] xl:col-span-8" style={{ animationDelay: '0ms' }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] font-medium">規模 × 工数 — 採用スイッチで点が消え、名目線が動きます</span>
            <span className="flex flex-wrap gap-3 text-[11px] text-sub">
              <span>
                <span className="mr-[5px] inline-block size-2.5 rounded-full bg-accent align-[-1px]" />
                採用
              </span>
              <span>
                <span className="mr-[5px] inline-block size-2.5 rounded-full border-2 border-coral align-[-1px]" />
                除外
              </span>
              <span>
                <span className="mr-[5px] inline-block h-0.5 w-3 bg-accent align-[3px]" />
                名目 α <span className="font-num">{alpha?.toFixed(4) ?? '—'}</span>
              </span>
            </span>
          </div>
          <ProjectScatter
            stats={stats}
            alpha={alpha}
            warnIds={warnIds}
            highlight={hitIds}
            emptyText={projects.isPending ? '読み込み中…' : `${groupName}にはまだ実績がありません`}
          />
        </div>

        <div className="col-span-12 flex min-w-0 flex-col gap-3 xl:col-span-4">
          {noneUsed ? (
            <div className="tile flex flex-1 flex-col items-start gap-2.5 px-[22px] py-[18px]" style={{ animationDelay: '80ms' }}>
              <span className="text-[13px] font-medium">{groupEmpty ? `${groupName}にはまだ実績がありません` : `${groupName}に採用中の実績がありません`}</span>
              <span className="text-[12px] leading-relaxed text-sub">
                平均生産性・規模の分布・L3 の件数は、採用した実績から計算します。
                {groupEmpty ? '実績を追加すると表示されます。' : '一覧で「採用」をオンにすると表示されます。'}
              </span>
              {groupEmpty && (
                <Link
                  to={addHref}
                  className="btn inline-flex min-h-10 items-center rounded-[10px] bg-raised px-3.5 text-[13px] font-medium text-text no-underline"
                >
                  {group === ALL ? '実績を追加' : `${groupName}に実績を追加`}
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="tile flex flex-1 flex-col gap-1.5 px-[22px] py-[18px]" style={{ animationDelay: '80ms' }}>
                <span className="text-[12px] text-sub">採用データの平均生産性</span>
                <span className="n text-[28px] text-accent">
                  {prod ? prod.avg.toFixed(4) : '—'} <span className="text-[12px] font-medium tracking-normal text-sub">人月/FP</span>
                </span>
                <span className="text-[11px] text-sub">
                  範囲 {prod ? `${prod.min.toFixed(4)} – ${prod.max.toFixed(4)}` : '—'}
                  {alpha !== null && <> ・ ΣCO で補正した名目 α は <span className="font-num">{alpha.toFixed(4)}</span></>}
                </span>
              </div>
              <div className="tile flex flex-1 flex-col gap-2 px-[22px] py-[18px]" style={{ animationDelay: '160ms' }}>
                <span className="text-[12px] text-sub">規模の分布 (採用分)</span>
                <div className="flex h-9 items-end gap-1" role="img" aria-label={`規模の分布: ${dist.bins.join(', ')} 件`}>
                  {dist.bins.map((b, i) => (
                    <div
                      key={i}
                      className={`grow-h flex-1 rounded-[3px] ${i === dist.estBin ? 'bg-accent' : 'bg-muted'}`}
                      style={{ height: `${mounted ? Math.max(6, (b / bmax) * 100) : 0}%`, transitionDelay: `${i * 40}ms` }}
                    />
                  ))}
                </div>
                <div className="flex justify-between font-num text-[11px] text-sub">
                  <span>0</span>
                  <span>{(dist.xMax / 2).toLocaleString('en-US')}</span>
                  <span>{dist.xMax.toLocaleString('en-US')} FP</span>
                </div>
                {estSize !== null && dist.estInRange !== null && (
                  <span className="text-[11px] text-sub">
                    見積り対象 {Math.round(estSize).toLocaleString('en-US')} FP は実績の範囲{dist.estInRange ? '内' : '外'}
                    {dist.estBin === -1 ? '（グラフの右端より大きい）' : ''}
                  </span>
                )}
              </div>
              <div className="tile flex flex-1 flex-col gap-1.5 px-[22px] py-[18px]" style={{ animationDelay: '240ms' }}>
                <span className="text-[12px] text-sub">L3 が付いた要因 (採用分)</span>
                {l3 && (
                  <>
                    <span className="text-[13px]">
                      {l3.top.map((t) => (
                        <span key={t.name}>
                          {t.name} <span className="n">{t.n}</span> ・{' '}
                        </span>
                      ))}
                      その他 <span className="n">{l3.others}</span>
                    </span>
                    {l3.few && <span className="text-[11px] text-warn-ink">L3 の実績が少ないため、三角分布の「最悪」は経験則に依存します</span>}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <div className="tile col-span-12 flex min-w-0 flex-col gap-1 px-2.5 pt-2 pb-3" style={{ animationDelay: '320ms' }}>
          <div className="flex flex-wrap items-center gap-2 px-3.5 pt-2.5 pb-1.5">
            <input
              type="search"
              aria-label="プロジェクトを検索"
              placeholder="プロジェクト名で検索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full min-w-0 rounded-full border border-muted bg-bg px-4 py-2 text-[13px] text-text transition-[border-color] focus:border-accent focus:outline-none sm:w-60"
            />
            <div role="group" aria-label="グループで絞り込む" className="flex flex-wrap gap-2">
              {[{ id: ALL, label: 'すべて' }, ...(bundle?.groups ?? []).map((g) => ({ id: g.id, label: `グループ ${g.id}` }))].map((g) => (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={group === g.id}
                  onClick={() => setGroup(g.id)}
                  className={`min-h-8 cursor-pointer rounded-full border-0 px-3 text-[12px] font-medium transition-[background,color] ${
                    group === g.id ? 'bg-raised text-text' : 'bg-transparent text-sub hover:text-text'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <div className="grow" />
            <span className="text-[12px] text-sub" aria-live="polite">
              {shown.length} 件表示 ・ レベル値は要因 01〜{String(spec?.factors.length ?? 8).padStart(2, '0')} の順（チップに要因名）
            </span>
          </div>
          {toggle.isError && (
            <p role="alert" className="mx-3.5 my-1 rounded-[10px] bg-coral-bg px-3 py-2 text-[12px] text-coral-ink">
              採用の切り替えを保存できませんでした（元に戻しました）。{describeApiError(toggle.error)}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0">
              <caption className="sr-only">実績データ一覧。数値の列見出しを押すと並べ替えます。</caption>
              <thead>
                <tr className="[&>th]:border-b [&>th]:border-line [&>th]:px-3.5 [&>th]:py-2.5 [&>th]:text-left [&>th]:text-[11px] [&>th]:font-medium [&>th]:tracking-[0.04em] [&>th]:whitespace-nowrap [&>th]:text-sub">
                  {COLUMNS.map((c) => {
                    const active = c.key !== null && sort?.key === c.key;
                    const ariaSort = active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : c.key ? 'none' : undefined;
                    return (
                      <th key={c.label} scope="col" aria-sort={ariaSort} className={c.numeric ? '!text-right' : ''}>
                        {c.key ? (
                          <button
                            type="button"
                            onClick={() => setSort((s) => nextSort(s, c.key!))}
                            className={`inline-flex min-h-6 cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[11px] font-medium tracking-[0.04em] hover:text-text ${
                              active ? 'text-text' : 'text-sub'
                            } ${c.numeric ? 'flex-row-reverse' : ''}`}
                          >
                            {c.label}
                            <span aria-hidden="true" className={`font-num text-[11px] ${active ? 'text-accent' : 'text-weak'}`}>
                              {active ? (sort!.dir === 'asc' ? '▲' : '▼') : '↕'}
                            </span>
                          </button>
                        ) : (
                          c.label
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {projects.isPending && (
                  <tr>
                    <td colSpan={9} className="px-3.5 py-6 text-[13px] text-sub">
                      読み込み中…
                    </td>
                  </tr>
                )}
                {!projects.isPending && shown.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3.5 py-6 text-[13px] text-sub">
                      {rows.length === 0
                        ? 'まだ実績がありません。「+ プロジェクトを追加」か CSV 取り込みで登録してください。'
                        : groupEmpty
                          ? (
                            <>
                              {groupName}にはまだ実績がありません。{' '}
                              <Link to={addHref} className="text-accent">{groupName}に実績を追加</Link>
                            </>
                          )
                          : '条件に合うプロジェクトはありません。'}
                    </td>
                  </tr>
                )}
                {shown.map((s) => {
                  const r = s.row;
                  const warn = warnIds.has(r.id);
                  const note = r.note || (warn ? 'ΣCO と生産性の不整合 (±25% 超)' : '');
                  const off = !r.adopted;
                  const num = off ? 'text-sub' : 'text-text';
                  return (
                    <tr
                      key={r.id}
                      className={`transition-[background] duration-300 hover:bg-card-2 [&>td]:border-b [&>td]:border-raised [&>td]:px-3.5 [&>td]:py-[11px] [&>td]:align-middle [&>td]:text-[13px] [&>td]:whitespace-nowrap ${
                        warn ? 'bg-coral-row' : ''
                      }`}
                    >
                      <td className={`n ${warn ? 'text-coral-ink' : 'text-sub'}`}>{r.id}</td>
                      <td className="max-w-[280px] min-w-[180px] font-medium !whitespace-normal">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <Link
                            to={`/model/projects/${encodeURIComponent(r.id)}`}
                            className={`no-underline hover:underline [overflow-wrap:anywhere] ${off ? 'text-sub' : 'text-text'}`}
                          >
                            {r.name}
                          </Link>
                          {off && (
                            <span className="rounded-full border border-muted px-1.5 py-px text-[11px] font-bold text-sub" title={r.excludedReason ?? undefined}>
                              除外
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="text-sub">{r.groupId}</td>
                      <td className={`text-right font-num font-medium tabular-nums ${num}`}>{Math.round(r.sizeFP).toLocaleString('en-US')}</td>
                      <td className={`text-right font-num font-medium tabular-nums ${num}`}>{r.effortMM.toFixed(1)}</td>
                      <td className={`text-right font-num font-medium tabular-nums ${warn ? 'text-coral-ink' : num}`}>{s.prod.toFixed(4)}</td>
                      <td>{spec && <FactorLevelChips items={factorLevels(spec, r.levels)} />}</td>
                      <td className={`min-w-[200px] !whitespace-normal ${warn ? 'text-coral-ink' : 'text-sub'}`}>
                        {off && r.excludedReason && r.excludedReason !== note ? (
                          <>
                            <span className="text-sub">除外理由: {r.excludedReason}</span>
                            {note && <span className="block">{note}</span>}
                          </>
                        ) : (
                          note
                        )}
                      </td>
                      <td>
                        <Switch checked={r.adopted} disabled={!canEdit} label={`モデル構築に使う: ${r.id} ${r.name}`} onChange={(adopted) => toggle.mutate({ id: r.id, adopted })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
