// 実績データ（design/ProjectData.dc.html）
import { resolveTriangle, triMean } from 'cobra-core';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toModelSpec } from '../../shared/types';
import { useEstimate, useMe, useModel, useProjects } from '../data/api';
import { alphaOf, gapOf, isInconsistent, levelArray, projectStats } from '../features/projects/calc';
import { useToggleAdopted } from '../features/projects/mutations';
import { ProjectScatter } from '../features/projects/ProjectScatter';
import { CURRENT_ESTIMATE_ID } from '../ui/Layout';
import { LevelChips } from '../ui/LevelChips';
import { ceilTo } from '../ui/scale';
import { Switch } from '../ui/Switch';

const ALL = '__all__';

export default function ProjectDataPage() {
  const model = useModel();
  const projects = useProjects();
  const me = useMe();
  const estimate = useEstimate(CURRENT_ESTIMATE_ID);
  const toggle = useToggleAdopted();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [group, setGroup] = useState<string>(ALL);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  const bundle = model.data;
  const spec = useMemo(() => (bundle ? toModelSpec(bundle, bundle.activeVersion?.expertMode) : null), [bundle]);
  const rows = projects.data ?? [];
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

  const avgProd = used.length ? used.reduce((a, s) => a + s.prod, 0) / used.length : null;
  const minProd = used.length ? Math.min(...used.map((s) => s.prod)) : null;
  const maxProd = used.length ? Math.max(...used.map((s) => s.prod)) : null;

  // 規模の分布（採用分）6 ビン
  const xMax = ceilTo(Math.max(0, ...stats.map((s) => s.row.sizeFP)), 500) || 2000;
  const bins = new Array<number>(6).fill(0);
  used.forEach((s) => bins[Math.min(5, Math.floor((s.row.sizeFP / xMax) * 6))]!++);
  const bmax = Math.max(...bins) || 1;
  const gen = estimate.data?.generations.find((g) => g.id === estimate.data?.reportGenerationId) ?? estimate.data?.generations.at(-1);
  const estSize = gen?.sizeFP ?? null;
  const estBin = estSize === null ? -1 : Math.min(5, Math.floor((estSize / xMax) * 6));
  const usedMin = used.length ? Math.min(...used.map((s) => s.row.sizeFP)) : 0;
  const usedMax = used.length ? Math.max(...used.map((s) => s.row.sizeFP)) : 0;

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
  const shown = allStats.filter(
    (s) => (group === ALL || s.row.groupId === group) && (!q || s.row.name.toLowerCase().includes(q) || s.row.id.toLowerCase().includes(q)),
  );
  const excludedCount = rows.filter((r) => !r.adopted).length;

  if (model.isError || projects.isError) {
    return (
      <div className="p-8">
        <div className="tile p-8 text-coral-ink">データを読み込めませんでした: {(model.error ?? projects.error)?.message}</div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-5 px-8 pt-6 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="inline-flex items-center gap-2 text-[11px] text-sub">
            <span className="size-1.5 rounded-full bg-teal" />
            {bundle ? `${bundle.model.name}${bundle.activeVersion ? ` v${bundle.activeVersion.version}` : ''}` : '読み込み中…'}
          </span>
          <h1 className="n m-0 text-[30px] leading-[1.1]">
            実績データ{' '}
            <span className="text-[16px] font-medium tracking-normal text-weak">
              {rows.length} 件 ・ 採用 {rows.length - excludedCount} ・ 除外 {excludedCount}
            </span>
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
        <div className="tile col-span-12 flex min-w-0 flex-col gap-2.5 px-[26px] py-[22px] xl:col-span-8" style={{ animationDelay: '0ms' }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] font-medium">規模 × 工数 — 採用スイッチで点が消え、名目線が動きます</span>
            <span className="flex gap-3 text-[11px] text-sub">
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
          <ProjectScatter stats={stats} alpha={alpha} warnIds={warnIds} />
        </div>

        <div className="col-span-12 flex min-w-0 flex-col gap-3 xl:col-span-4">
          <div className="tile flex flex-1 flex-col gap-1.5 px-[22px] py-[18px]" style={{ animationDelay: '80ms' }}>
            <span className="text-[12px] text-sub">採用データの平均生産性</span>
            <span className="n text-[28px] text-accent">
              {avgProd?.toFixed(4) ?? '—'} <span className="text-[12px] font-medium tracking-normal text-sub">人月/FP</span>
            </span>
            <span className="text-[11px] text-weak">
              範囲 {minProd?.toFixed(3) ?? '—'} – {maxProd?.toFixed(3) ?? '—'} ・ これが α の出発点
            </span>
          </div>
          <div className="tile flex flex-1 flex-col gap-2 px-[22px] py-[18px]" style={{ animationDelay: '160ms' }}>
            <span className="text-[12px] text-sub">規模の分布 (採用分)</span>
            <div className="flex h-9 items-end gap-1" role="img" aria-label={`規模の分布: ${bins.join(', ')} 件`}>
              {bins.map((b, i) => (
                <div
                  key={i}
                  className={`grow-h flex-1 rounded-[3px] ${i === estBin ? 'bg-accent' : 'bg-muted'}`}
                  style={{ height: `${mounted ? Math.max(6, (b / bmax) * 100) : 0}%`, transitionDelay: `${i * 40}ms` }}
                />
              ))}
            </div>
            <div className="flex justify-between font-num text-[10px] text-weak">
              <span>0</span>
              <span>{(xMax / 2).toLocaleString('en-US')}</span>
              <span>{xMax.toLocaleString('en-US')} FP</span>
            </div>
            {estSize !== null && used.length > 0 && (
              <span className="text-[11px] text-weak">
                見積り対象 {Math.round(estSize).toLocaleString('en-US')} FP は実績の範囲{estSize >= usedMin && estSize <= usedMax ? '内' : '外'}
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
        </div>

        <div className="tile col-span-12 flex min-w-0 flex-col gap-1 px-2.5 pt-2 pb-3" style={{ animationDelay: '320ms' }}>
          <div className="flex flex-wrap items-center gap-2 px-3.5 pt-2.5 pb-1.5">
            <input
              type="search"
              aria-label="プロジェクトを検索"
              placeholder="プロジェクト名で検索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-60 rounded-full border border-muted bg-bg px-4 py-2 text-[13px] text-text transition-[border-color] focus:border-accent focus:outline-none"
            />
            <div role="group" aria-label="グループで絞り込む" className="flex gap-2">
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
            <span className="text-[12px] text-weak">
              {shown.length} 件表示 ・ レベル値は要因 01〜{String(spec?.factors.length ?? 8).padStart(2, '0')} の順
            </span>
          </div>
          {toggle.isError && (
            <p role="alert" className="mx-3.5 my-1 rounded-[10px] bg-coral-bg px-3 py-2 text-[12px] text-coral-ink">
              採用の切り替えを保存できませんでした: {toggle.error.message}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0">
              <thead>
                <tr className="[&>th]:border-b [&>th]:border-line [&>th]:px-3.5 [&>th]:py-2.5 [&>th]:text-left [&>th]:text-[11px] [&>th]:font-medium [&>th]:tracking-[0.04em] [&>th]:whitespace-nowrap [&>th]:text-weak">
                  <th>ID</th>
                  <th>プロジェクト名</th>
                  <th>グループ</th>
                  <th className="!text-right">規模 FP</th>
                  <th className="!text-right">工数 人月</th>
                  <th className="!text-right">生産性</th>
                  <th>要因レベル</th>
                  <th>備考</th>
                  <th>採用</th>
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
                      {rows.length === 0 ? 'まだ実績がありません。「+ プロジェクトを追加」か CSV 取り込みで登録してください。' : '条件に合うプロジェクトはありません。'}
                    </td>
                  </tr>
                )}
                {shown.map((s) => {
                  const r = s.row;
                  const warn = warnIds.has(r.id);
                  const note = r.note || (warn ? 'ΣCO と生産性の不整合 (±25% 超)' : '');
                  return (
                    <tr
                      key={r.id}
                      className={`transition-[background,opacity] duration-300 hover:bg-card-2 [&>td]:border-b [&>td]:border-raised [&>td]:px-3.5 [&>td]:py-[11px] [&>td]:align-middle [&>td]:text-[13px] [&>td]:whitespace-nowrap ${
                        warn ? 'bg-coral-row' : ''
                      }`}
                      style={{ opacity: r.adopted ? 1 : 0.55 }}
                    >
                      <td className={`n ${warn ? 'text-coral' : 'text-weak'}`}>{r.id}</td>
                      <td className="font-medium">
                        <Link to={`/model/projects/${encodeURIComponent(r.id)}`} className="text-text no-underline hover:underline">
                          {r.name}
                        </Link>
                      </td>
                      <td className="text-sub">{r.groupId}</td>
                      <td className="text-right font-num font-medium tabular-nums">{Math.round(r.sizeFP).toLocaleString('en-US')}</td>
                      <td className="text-right font-num font-medium tabular-nums">{r.effortMM.toFixed(1)}</td>
                      <td className={`text-right font-num font-medium tabular-nums ${warn ? 'text-coral' : 'text-text'}`}>{s.prod.toFixed(3)}</td>
                      <td>{spec && <LevelChips levels={levelArray(spec, r.levels)} />}</td>
                      <td className={`min-w-[200px] !whitespace-normal ${warn ? 'text-coral-ink' : 'text-sub'}`}>{note}</td>
                      <td>
                        <Switch
                          checked={r.adopted}
                          disabled={!canEdit}
                          label={`${r.adopted ? '除外する' : '採用する'}: ${r.id}`}
                          onChange={(adopted) => toggle.mutate({ id: r.id, adopted })}
                        />
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
