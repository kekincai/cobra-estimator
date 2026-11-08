// モデル構築（design/Build.dc.html）
import { useQueryClient } from '@tanstack/react-query';
import { predictiveSigma, type BuildResult, type BuildStage, type ExpertMode, type Inconsistency, type LooPoint } from 'cobra-core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { toModelSpec, type ModelBundle, type ModelVersionRow, type ProjectRow } from '../../shared/types';
import { apiSend, qk, useMe, useModel, useProjects } from '../data/api';
import { InconsistencyCard, type InconsistentItem } from '../features/build/InconsistencyCard';
import { LooChart, looOutIds } from '../features/build/LooChart';
import { deltaTone, displayDelta, expertLabel, shortDateTime, signed } from '../features/build/format';
import { stageAt } from '../features/build/progress';
import { estimateWaitMs, formatElapsed, formatWait } from '../features/build/runEstimate';
import { STAGE_SPANS, useBuildRunner } from '../features/build/useBuildRunner';
import { VersionList } from '../features/build/VersionList';
import { gapOf, isInconsistent, projectStats } from '../features/projects/calc';
import { SimSettingsDialog, useSimSettings } from '../features/sim-settings';
import { describeApiError } from '../ui/apiError';
import { HelpLink } from '../ui/HelpLink';
import { CURRENT_ESTIMATE_ID } from '../ui/Layout';
import { Segmented } from '../ui/Segmented';
import { useCountUp } from '../ui/useCountUp';

const ALL = '__all__';
const AVERAGE = '__avg__';
const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 右側に表示する構築結果（保存済みの版、または保存に失敗した今回の結果） */
interface ShownResult {
  versionId: string | null;
  version: number | null;
  expertMode: ExpertMode;
  groupId: string | null;
  alpha: number;
  ci95: [number | null, number | null];
  mmre: number | null;
  pred25: number | null;
  n: number;
  loo: LooPoint[];
  inconsistencies: Inconsistency[];
}

const fromRow = (v: ModelVersionRow): ShownResult => ({
  versionId: v.id, version: v.version, expertMode: v.expertMode, groupId: v.groupId, alpha: v.alpha,
  ci95: [v.ciLo, v.ciHi], mmre: v.mmre, pred25: v.pred25, n: v.n, loo: v.loo, inconsistencies: v.inconsistencies,
});

export default function BuildPage() {
  const model = useModel();
  const projects = useProjects();
  if (model.isError || projects.isError) {
    return (
      <div className="px-4 py-8 sm:px-8">
        <div role="alert" className="tile flex flex-col items-start gap-3 p-8">
          <span className="text-coral-ink">モデルと実績データを読み込めませんでした。{describeApiError(model.error ?? projects.error)}</span>
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
  if (!model.data || !projects.data) return <div className="px-4 py-8 text-[13px] text-sub sm:px-8">読み込み中…</div>;
  return <BuildView bundle={model.data} rows={projects.data} />;
}

function BuildView({ bundle, rows }: { bundle: ModelBundle; rows: ProjectRow[] }) {
  const qc = useQueryClient();
  const me = useMe();
  const sim = useSimSettings('build');
  const [simOpen, setSimOpen] = useState(false);
  const isAdmin = me.data?.user?.role === 'admin';
  const canEditProjects = !!me.data?.user && ['admin', 'pmo'].includes(me.data.user.role);

  const active = bundle.activeVersion;
  const experts = useMemo(() => [...new Set(bundle.factors.flatMap((f) => f.triangles.map((t) => t.expert)))], [bundle.factors]);
  const [group, setGroup] = useState<string>(active?.groupId ?? bundle.groups[0]?.id ?? ALL);
  const [expert, setExpert] = useState<string>(active?.expertMode.kind === 'expert' ? active.expertMode.expert : AVERAGE);
  const [viewId, setViewId] = useState<string | null>(null);
  const [local, setLocal] = useState<ShownResult | null>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  const expertMode: ExpertMode = expert === AVERAGE ? { kind: 'average' } : { kind: 'expert', expert };
  const inGroup = (r: ProjectRow, g: string | null) => g === null || g === ALL || r.groupId === g;
  const groupRows = rows.filter((r) => inGroup(r, group));
  const adopted = groupRows.filter((r) => r.adopted);
  const excluded = groupRows.filter((r) => !r.adopted);

  const runner = useBuildRunner(async (r: BuildResult, meta) => {
    const body = {
      expertMode, groupId: group === ALL ? null : group, runs: meta.runs, seed: meta.seed, alpha: r.alpha, ci95: r.ci95,
      mmre: r.mmre, pred25: r.pred25, n: r.n, loo: r.loo, inconsistencies: r.inconsistencies, activate: false,
    };
    const shown: ShownResult = { versionId: null, version: null, ...body, ci95: r.ci95 };
    try {
      const res = await apiSend<{ id: string; version: number }>('POST', '/model/versions', body);
      setSaveError(null);
      setLocal(null);
      setViewId(res.id);
      await qc.invalidateQueries({ queryKey: qk.model });
    } catch (e) {
      setSaveError(e);
      setLocal(shown);
    }
  });
  const running = runner.phase === 'running';

  // 表示する結果: 今回の未保存結果 > 選んだ版 > 採用版 > 最新版
  const viewed = bundle.versions.find((v) => v.id === viewId) ?? active ?? bundle.versions[0] ?? null;
  const shown: ShownResult | null = local ?? (viewed ? fromRow(viewed) : null);
  const prev = shown
    ? shown.version === null
      ? bundle.versions[0] ?? null
      : bundle.versions.filter((v) => v.version < shown.version!).sort((a, b) => b.version - a.version)[0] ?? null
    : null;

  // 構築中も前回の結果は消さずに残す（淡く表示）。新しい結果が出たら数値が動く
  const revealed = mounted && !!shown;
  const alphaAnim = useCountUp(shown?.alpha ?? 0, 1000);

  // 不整合: 表示中の版の α・専門家で、その版のグループの実績（採用・除外とも）を判定
  const inconsistent: InconsistentItem[] = useMemo(() => {
    if (!shown) return [];
    const spec = toModelSpec(bundle, shown.expertMode);
    return projectStats(spec, rows.filter((r) => inGroup(r, shown.groupId)))
      .map((stat) => ({ stat, gap: gapOf(stat, shown.alpha) }))
      .filter((x) => isInconsistent(x.gap));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, rows, shown?.alpha, shown?.groupId, shown?.expertMode]);

  // 構築前チェック
  const badFactors = bundle.factors.filter(
    (f) =>
      f.levels.some((l) => !l.trim()) ||
      (expertMode.kind === 'expert' ? !f.triangles.some((t) => t.expert === expertMode.expert) : f.triangles.length === 0),
  );
  const nOk = adopted.length >= 10;
  const canBuild = adopted.length >= 2 && !running;
  type Check = { tone: 'ok' | 'warn' | 'bad'; text: string };
  const checks: Check[] = [
    badFactors.length === 0
      ? { tone: 'ok', text: `要因 ${bundle.factors.length} 件すべてにレベル定義と三角分布がある` }
      : { tone: 'warn', text: `${badFactors.map((f) => String(f.no).padStart(2, '0')).join('・')} のレベル定義か三角分布が足りません` },
    adopted.length < 2
      ? { tone: 'bad', text: `採用実績 ${adopted.length} 件 — α の推定には 2 件以上必要です` }
      : { tone: nOk ? 'ok' : 'warn', text: `採用実績 ${adopted.length} 件 (推奨 10 件以上)` },
    excluded.length > 0
      ? { tone: 'warn', text: `${excluded.map((r) => r.id).join('・')} が除外のまま — 不整合を確認してください` }
      : { tone: 'ok', text: '除外中の実績はありません' },
  ];

  const build = () => {
    if (!canBuild) return;
    setSaveError(null);
    const spec = toModelSpec(bundle, expertMode);
    const rec = (r: ProjectRow) => ({ id: r.id, sizeFP: r.sizeFP, effortMM: r.effortMM, levels: r.levels });
    // 除外中の実績も渡す: α には使わず、不整合の判定だけ行う（保存される inconsistencies に excluded: true で入る）
    runner.run(spec, adopted.map(rec), { runs: sim.runs, seed: sim.seedForRun() }, excluded.map(rec));
  };

  // 3 段の表示
  const p = runner.shown;
  const stageDefs: { key: BuildStage; label: string; total: number }[] = [
    { key: 'alpha', label: 'α を推定', total: adopted.length },
    { key: 'montecarlo', label: `モンテカルロ ${sim.runs.toLocaleString('en-US')} 回`, total: sim.runs },
    { key: 'loo', label: '交差検証 (1 件抜き)', total: adopted.length },
  ];

  const groupLabel = (g: string) => {
    const rs = rows.filter((r) => inGroup(r, g));
    const a = rs.filter((r) => r.adopted).length;
    const x = rs.length - a;
    return `${g === ALL ? 'すべて' : `グループ ${g}`} — ${a} 件採用${x ? ` / ${x} 件除外` : ''}`;
  };

  // 差分は表示精度に丸めた値どうしで引く（α 4 桁、MMRE 0.1 pt）
  const dAlpha = shown && prev ? displayDelta(shown.alpha, prev.alpha, 4) : null;
  const dMmre = shown?.mmre != null && prev?.mmre != null ? displayDelta(shown.mmre * 100, prev.mmre * 100, 1) : null;
  const toneCls = (d: number | null) => {
    const t = deltaTone(d);
    return t === 'worse' ? 'text-coral-soft' : t === 'better' ? 'text-ok' : 'text-sub';
  };
  const prevLabel = prev ? `v${prev.version}` : null;
  const predN = shown?.pred25 != null ? Math.round(shown.pred25 * shown.n) : null;
  const outIds = shown ? looOutIds(shown.loo) : [];
  // 予測のモデル誤差 σ（LOO 残差の対数 RMS）。保存済みの版は loo から再計算できる（BuildResult.sigma と同じ値）
  const sigma = shown && shown.loo.length > 0 ? predictiveSigma(shown.loo) : null;
  const lastBuilt = bundle.versions[0]?.builtAt;
  const revStyle = {
    opacity: revealed ? (running ? 0.6 : 1) : 0,
    transform: revealed ? 'none' : 'translateY(8px)',
    transition: 'opacity .6s, transform .6s var(--ease-out-rise)',
  };
  const waitText = formatWait(estimateWaitMs(adopted.length, sim.runs, reducedMotion()));
  // 読み上げは段の切り替えと完了だけ（毎フレームの件数は読ませない）
  const stageNow = running ? stageAt(p) : null;
  const announce =
    runner.phase === 'running'
      ? `${stageDefs.find((s) => s.key === stageNow)?.label ?? ''} を実行中`
      : runner.phase === 'done'
        ? '構築が完了しました'
        : runner.phase === 'cancelled'
          ? '構築を取りやめました。結果は保存していません'
          : '';
  const cancelRef = useRef<HTMLButtonElement>(null);
  const buildRef = useRef<HTMLButtonElement>(null);
  const wasRunning = useRef(false);
  useEffect(() => {
    if (running && !wasRunning.current) cancelRef.current?.focus();
    if (!running && wasRunning.current && document.activeElement === document.body) buildRef.current?.focus();
    wasRunning.current = running;
  }, [running]);
  const shownExcluded = shown ? rows.filter((r) => inGroup(r, shown.groupId) && !r.adopted).length : 0;

  return (
    <div className="flex min-w-0 flex-col gap-5 px-4 pt-6 pb-10 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="inline-flex flex-wrap items-center gap-2 text-[11px] text-sub">
            <span className="size-1.5 rounded-full bg-teal" />
            {bundle.model.name}
            {active ? ` ・ 見積りに使用中 v${active.version}` : ''}
          </span>
          <h1 className="n m-0 flex items-center gap-2 text-[30px] leading-[1.1]">
            モデル構築
            <HelpLink section="build" />
          </h1>
          <span className="text-[12px] text-sub">実績データと三角分布から α (名目生産性) を推定し、1 件抜き交差検証で精度を確かめます。</span>
        </div>
        <nav aria-label="モデル" className="flex flex-wrap gap-1.5">
          <Link to="/model/factors" className="inline-flex min-h-[30px] items-center rounded-full px-3 text-[12px] font-medium text-sub no-underline hover:text-text">要因</Link>
          <Link to="/model/projects" className="inline-flex min-h-[30px] items-center rounded-full px-3 text-[12px] font-medium text-sub no-underline hover:text-text">実績</Link>
          <span aria-current="page" className="inline-flex min-h-[30px] items-center rounded-full bg-raised px-3 text-[12px] font-medium text-text">構築</span>
        </nav>
      </header>

      <section className="grid grid-cols-12 items-start gap-4">
        <div className="col-span-12 flex min-w-0 flex-col gap-4 xl:col-span-4">
          <form
            className="tile flex flex-col gap-3.5 px-4 py-[22px] sm:px-6"
            onSubmit={(e) => {
              e.preventDefault();
              build();
            }}
          >
            <span className="text-[13px] font-medium">構築条件</span>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="b-group" className="text-[11px] text-sub">対象グループ</label>
              <select
                id="b-group"
                value={group}
                disabled={running}
                onChange={(e) => setGroup(e.target.value)}
                className="w-full rounded-[10px] border border-muted bg-bg px-3 py-[9px] text-[13px] text-text"
              >
                {bundle.groups.map((g) => (
                  <option key={g.id} value={g.id}>{groupLabel(g.id)}</option>
                ))}
                <option value={ALL}>{groupLabel(ALL)}</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-sub">使用する三角分布</span>
              <Segmented
                label="使用する三角分布"
                frame="pill"
                size="sm"
                className="self-start"
                disabled={running}
                value={expert}
                onChange={setExpert}
                options={[...experts.map((x) => ({ value: x, label: x })), { value: AVERAGE, label: '平均' }]}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-sub">シミュレーション回数</span>
                <span className="n flex items-baseline gap-2 text-[18px]">
                  {sim.runsLabel}
                  <button
                    type="button"
                    onClick={() => setSimOpen(true)}
                    className="cursor-pointer border-0 bg-transparent p-0 font-sans text-[11px] font-medium tracking-normal text-accent hover:underline"
                  >
                    設定
                  </button>
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-sub">乱数</span>
                <span className="text-[13px]" title={sim.fixedSeed ? `シード ${sim.seed}` : undefined}>{sim.seedLabel}</span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 border-t border-line pt-2.5">
              <span className="text-[11px] text-sub">構築前チェック</span>
              {checks.map((c) => (
                <span key={c.text} className="flex items-center gap-2 text-[12px]">
                  <span className={`size-2 shrink-0 rounded-full ${c.tone === 'ok' ? 'bg-ok' : c.tone === 'warn' ? 'bg-warn' : 'bg-coral'}`} />
                  <span className="sr-only">{c.tone === 'ok' ? 'OK: ' : '要確認: '}</span>
                  <span className={c.tone === 'ok' ? '' : c.tone === 'warn' ? 'text-warn-ink' : 'text-coral-ink'}>{c.text}</span>
                </span>
              ))}
            </div>

            <div className="flex flex-col gap-2 border-t border-line pt-2.5">
              {stageDefs.map((s) => {
                const [a, b] = STAGE_SPANS[s.key];
                const done = runner.phase === 'done' || (running && p >= b) || ((runner.phase === 'idle' || runner.phase === 'cancelled') && !!shown);
                const act = running && p >= a && p < b;
                const frac = act ? Math.min(1, (p - a) / (b - a)) : done ? 1 : 0;
                const meta = act
                  ? `${Math.round(frac * s.total).toLocaleString('en-US')} / ${s.total.toLocaleString('en-US')}`
                  : done ? '完了' : '待機';
                return (
                  <div key={s.key} className="flex items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className={`inline-flex size-[18px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-bg transition-[background,border-color] duration-300 ${
                        done ? 'border border-accent bg-accent' : act ? 'border-2 border-accent bg-raised' : 'border border-muted bg-bg'
                      }`}
                    >
                      {done ? '✓' : ''}
                    </span>
                    <span className={`text-[12px] ${done || act ? 'text-text' : 'text-sub'}`}>{s.label}</span>
                    <span className="n ml-auto text-[11px] text-sub">{meta}</span>
                  </div>
                );
              })}
              <div
                className="h-1.5 overflow-hidden rounded-[3px] bg-raised"
                role="progressbar"
                aria-label="構築の進捗"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(p * 100)}
              >
                <div className="h-full rounded-[3px] bg-accent" style={{ width: `${running ? p * 100 : 0}%`, opacity: running ? 1 : 0 }} />
              </div>
            </div>

            <span className="sr-only" aria-live="polite" aria-atomic="true">{announce}</span>
            <div className="flex gap-2">
            <button
              ref={buildRef}
              type="submit"
              disabled={!canBuild}
              aria-busy={running}
              className={`btn inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-[12px] border-0 text-[14px] font-bold ${
                running ? 'cursor-progress bg-accent text-bg' : canBuild ? 'cursor-pointer bg-accent text-bg' : 'cursor-not-allowed bg-raised text-sub'
              }`}
            >
              {running ? (
                <>
                  <svg className="spin" aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <path d="M21 12a9 9 0 1 1-6.2-8.6" />
                  </svg>
                  <span>構築中 {Math.round(p * 100)}%</span>
                </>
              ) : (
                <span>モデルを構築する</span>
              )}
            </button>
            {running && (
              <button
                ref={cancelRef}
                type="button"
                onClick={runner.cancel}
                className="btn inline-flex min-h-[46px] cursor-pointer items-center rounded-[12px] border border-muted bg-transparent px-4 text-[13px] font-medium text-text"
              >
                キャンセル
              </button>
            )}
            </div>
            <div className="flex flex-wrap justify-between gap-x-3 text-[11px] text-sub">
              <span>前回 {lastBuilt ? shortDateTime(lastBuilt) : '—'}</span>
              {runner.phase === 'done' && runner.elapsedMs !== null ? (
                <span>
                  計算 <span className="n text-text">{formatElapsed(runner.elapsedMs)}</span>
                </span>
              ) : (
                <span title="実績の件数とシミュレーション回数からの目安">
                  目安 <span className="n text-text">{waitText}</span>
                </span>
              )}
            </div>
            {runner.phase === 'cancelled' && (
              <p role="status" className="m-0 text-[12px] text-sub">構築を取りやめました。結果は保存していません。</p>
            )}
            {(runner.error || saveError != null) && (
              <p role="alert" className="m-0 rounded-[10px] bg-coral-bg px-3 py-2 text-[12px] leading-normal text-coral-ink">
                {runner.error
                  ? `構築できませんでした。${describeApiError(new Error(runner.error), '計算中にエラーが発生しました。条件を見直して再試行してください。')}`
                  : `結果を保存できませんでした（表示のみ）。${describeApiError(saveError)}`}
              </p>
            )}
          </form>

          <VersionList
            versions={bundle.versions}
            viewedId={local ? null : (viewed?.id ?? null)}
            onView={(id) => {
              setLocal(null);
              setViewId(id);
            }}
            canActivate={isAdmin}
          />
        </div>

        <div className="col-span-12 flex min-w-0 flex-col gap-4 xl:col-span-8">
          <div className="tile flex flex-wrap items-center gap-6 px-4 py-6 sm:px-7" style={{ animationDelay: '100ms' }} aria-busy={running}>
            <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-1.5">
              <span className="text-[12px] text-sub">
                工数算定式{shown && shown.version !== null && viewed && !viewed.active ? ` — v${shown.version} を表示中` : ''}
                {shown && shown.version === null ? ' — 今回の結果 (未保存)' : ''}
                {running && <span className="ml-1.5 font-bold text-accent">・ 構築中… 新しい結果が出るまで前の値を表示しています</span>}
              </span>
              <span className="n text-[30px] leading-[1.2] [overflow-wrap:anywhere]">
                工数 = <span className="text-accent" style={{ opacity: running ? 0.6 : 1, transition: 'opacity .4s' }}>{revealed ? alphaAnim.toFixed(4) : '—'}</span> × 規模{' '}
                <span className="whitespace-nowrap">× (1 + ΣCO)</span>
              </span>
              {shown && (
                <span className="text-[12px] text-sub" style={revStyle}>
                  α = {shown.alpha.toFixed(4)} 人月 / FP
                  {shown.ci95[0] != null && shown.ci95[1] != null && ` ・ 95% CI ${shown.ci95[0].toFixed(4)} – ${shown.ci95[1].toFixed(4)}`}
                  {sigma !== null && (
                    <span title="予測のモデル誤差 (1 件抜き残差の対数 RMS)。見積りの分布の幅に加わります。"> ・ σ {sigma.toFixed(3)}</span>
                  )}
                  {dAlpha !== null && (
                    <>
                      {' '}・ 前回 {prevLabel} 比 <span className={toneCls(dAlpha)}>{signed(dAlpha, 4)}</span>
                    </>
                  )}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              <div className="flex flex-col gap-0.5" style={revStyle}>
                <span className="text-[12px] text-sub" title="平均相対誤差。1 件抜きで推定したときの誤差の平均。小さいほど良い">MMRE</span>
                <span className="n text-[34px]">{revealed && shown?.mmre != null ? `${(shown.mmre * 100).toFixed(1)}%` : '—'}</span>
                <span className={`text-[11px] ${toneCls(dMmre)}`}>
                  {dMmre !== null ? `${signed(dMmre, 1)} pt vs ${prevLabel}` : ' '}
                </span>
              </div>
              <div className="flex flex-col gap-0.5" style={revStyle}>
                <span className="text-[12px] text-sub" title="誤差が ±25% 以内に収まった実績の割合。大きいほど良い">PRED(25)</span>
                <span className="n text-[34px]">{revealed && shown?.pred25 != null ? `${Math.round(shown.pred25 * 100)}%` : '—'}</span>
                <span className="text-[11px] text-sub">{predN !== null && shown ? `${predN} / ${shown.n} 件` : ' '}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[12px] text-sub">採用件数</span>
                <span className="n text-[34px]">{shown?.n ?? adopted.length}</span>
                <span className="text-[11px] text-sub">除外 {shownExcluded}</span>
              </div>
            </div>
          </div>

          <div className="tile flex min-w-0 flex-col gap-3 px-4 py-[22px] sm:px-[26px]" style={{ animationDelay: '200ms' }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="m-0 text-[13px] font-medium">交差検証 — 実績に対する推定の誤差 (1 件抜き)</h2>
              <span className="flex gap-3.5 text-[11px] text-sub">
                <span><span className="mr-[5px] inline-block size-2.5 rounded-full bg-accent align-[-1px]" />±25% 以内</span>
                <span><span className="mr-[5px] inline-block size-2.5 rounded-full bg-coral align-[-1px]" />帯の外</span>
              </span>
            </div>
            {shown && shown.loo.length > 0 ? (
              <>
                <LooChart loo={shown.loo} revealed={revealed} />
                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-[11px] text-sub">
                  <span className="shrink-0">上 = 過大見積り</span>
                  <span className="text-center">
                    {outIds.length > 0
                      ? `${outIds.join(' と ')} が帯の外。実績データのレベル値を確認する候補です。`
                      : 'すべての実績が ±25% の帯に収まっています。'}
                  </span>
                  <span className="shrink-0">下 = 過小見積り</span>
                </div>
              </>
            ) : (
              <div className="flex h-[176px] items-center justify-center rounded-[12px] border border-dashed border-line text-[12px] text-sub">
                {shown ? `v${shown.version} には交差検証の記録がありません。構築すると表示されます。` : 'まだ構築されていません。「モデルを構築する」を押してください。'}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <InconsistencyCard
              key={shown?.versionId ?? 'local'}
              items={inconsistent}
              canEdit={canEditProjects}
              basis={{
                version: shown?.version ?? null,
                alpha: shown?.alpha ?? 0,
                isActive: !!shown && !!active && shown.versionId === active.id,
                activeVersion: active?.version ?? null,
              }}
            />
            <div className="tile flex flex-col gap-2 px-[22px] py-5" style={{ animationDelay: '380ms' }}>
              <span className="text-[13px] font-medium">このモデルで</span>
              <Link
                to={`/estimate/${CURRENT_ESTIMATE_ID}`}
                className="btn flex min-h-[42px] items-center justify-between rounded-[10px] bg-accent px-3.5 text-[13px] font-bold text-bg no-underline"
              >
                <span>見積りをする</span>
                <span aria-hidden="true">→</span>
              </Link>
              <Link
                to="/transfer?tab=export"
                className="btn flex min-h-[42px] items-center justify-between rounded-[10px] bg-raised px-3.5 text-[13px] font-medium text-text no-underline"
              >
                <span>パラメータを書き出す (JSON)</span>
                <span aria-hidden="true">→</span>
              </Link>
              <span className="text-[11px] text-sub">実績データを含めるかは書き出し時に選べます。</span>
            </div>
          </div>
        </div>
      </section>

      <SimSettingsDialog open={simOpen} onClose={() => setSimOpen(false)} target="build" />
      {shown && <span className="sr-only" aria-live="polite">{revealed && !running ? `α ${shown.alpha.toFixed(4)}、${expertLabel(shown.expertMode)} の三角分布` : ''}</span>}
    </div>
  );
}
