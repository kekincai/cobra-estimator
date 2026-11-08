// タブ 1: JSON を取り込む（旧 XML は変換してから同じ流れ）
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { ModelBundle, ProjectRow, Role } from '../../../shared/types';
import { describeApiError } from '../../ui/apiError';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { fmtInt } from '../../ui/format';
import { useImportCommit, useTransferHistory } from './api';
import { downloadBackup } from './backup';
import { decodeAuto, decodeXml } from './decode';
import { wrongFileForJson, type ImportFailure } from './errors';
import {
  buildImportPlan,
  defaultPicked,
  findConflicts,
  importGroups,
  nextGroupIds,
  RESOLUTIONS,
  type ImportGroupKey,
  type ImportPlan,
  type Picked,
  type ProjectDup,
  type Resolution,
} from './importPlan';
import { PROJECT_RESOLUTIONS, type ProjectResolution } from './projectMatch';
import { parseModelJson, type ModelFile } from './schema';
import type { Handoff, SwitchTab } from './tabs';
import { CheckRow, cx, DiffList, DropZone, FileHead, ghostBtn, KV, kb, mmdd, Notice, primaryBtn, Seg, Tile, TileHead, WrongFileCard, ymd } from './ui';
import { parseLegacyXml } from './xml';

const MAX_BYTES = 5 * 1024 * 1024;

type Loaded = { fileName: string; size: number; kind: 'json' | 'xml'; encoding: string; file: ModelFile };
type State = { step: 'idle' } | { step: 'error'; source: File; failure: ImportFailure } | { step: 'preview'; loaded: Loaded };

export async function readModelFile(f: File): Promise<{ ok: true; loaded: Loaded } | ImportFailure> {
  if (f.size > MAX_BYTES) return { ok: false, errors: [`ファイルが大きすぎます（${kb(f.size)} KB）。5 MB までです。`], hint: '実績データを含めずに書き出し直すと小さくなります。' };
  const buf = await f.arrayBuffer();
  const head = new TextDecoder('latin1').decode(new Uint8Array(buf, 0, Math.min(64, buf.byteLength))).trimStart();
  const isXml = /\.xml$/i.test(f.name) || head.startsWith('<');
  const d = isXml ? decodeXml(buf) : decodeAuto(buf);
  if (!isXml) {
    const wrong = wrongFileForJson(f.name, d.text);
    if (wrong) return wrong;
  }
  const r = isXml ? parseLegacyXml(d.text) : parseModelJson(d.text);
  if (!r.ok) return r;
  return { ok: true, loaded: { fileName: f.name, size: f.size, kind: isXml ? 'xml' : 'json', encoding: d.encoding, file: r.data } };
}

/** 権限ごとに、取り込みで何ができるか（ファイルを選ぶ前に伝える） */
const ROLE_NOTE: Record<Role | 'none', string | null> = {
  admin: null,
  pmo: 'あなたの権限（PMO）では実績データの取り込みだけができます。要因・三角分布の取り込みはモデル管理者が行います。',
  estimator: 'あなたの権限（見積り担当）では取り込みはできません。ファイルの内容を確認することはできます。',
  none: '読み取り専用モードです（ログインが必要）。ファイルの内容を確認することはできます。',
};

interface Props {
  bundle: ModelBundle;
  projects: ProjectRow[];
  role: Role | null;
  userName: string;
  handoff: Handoff | null;
  onSwitchTab: SwitchTab;
}

export function ImportTab({ bundle, projects, role, userName, handoff, onSwitchTab }: Props) {
  const [state, setState] = useState<State>({ step: 'idle' });
  const [busy, setBusy] = useState(false);
  const onFile = async (f: File) => {
    setBusy(true);
    try {
      const r = await readModelFile(f);
      setState(r.ok ? { step: 'preview', loaded: r.loaded } : { step: 'error', source: f, failure: r });
    } catch {
      setState({ step: 'error', source: f, failure: { ok: false, errors: ['ファイルを読み込めませんでした。'], hint: 'ファイルが開けるか、別のアプリで使用中でないかを確かめてください。' } });
    } finally {
      setBusy(false);
    }
  };
  // 別のタブから回ってきたファイル
  const handled = useRef(0);
  useEffect(() => {
    if (handoff && handoff.seq !== handled.current) {
      handled.current = handoff.seq;
      void onFile(handoff.file);
    }
  }, [handoff]);
  const reset = () => setState({ step: 'idle' });
  const roleNote = ROLE_NOTE[role ?? 'none'];

  if (state.step === 'preview')
    return (
      <ImportPreview
        key={state.loaded.fileName + state.loaded.size}
        loaded={state.loaded}
        bundle={bundle}
        projects={projects}
        role={role}
        userName={userName}
        onReset={reset}
      />
    );
  return (
    <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-4">
        {state.step === 'error' && (
          <WrongFileCard
            fileName={state.source.name}
            failure={state.failure}
            fallbackHint="形式は estima-model/1 の JSON、または旧 Excel 版の XML (<CoBRAModel>) です。"
            switchLabel={state.failure.suggestTab === 'csv' ? 'CSV で実績を取り込む で開く' : undefined}
            onSwitch={state.failure.suggestTab === 'csv' ? () => onSwitchTab('csv', state.source) : undefined}
          />
        )}
        <DropZone
          accept=".json,.xml,application/json,application/xml,text/xml"
          onFile={onFile}
          busy={busy}
          title="モデルパラメータ JSON をここにドロップ"
          sub={<>または <span className="text-accent underline">ファイルを選ぶ</span> ・ .json / 旧 .xml (Shift-JIS は自動変換)</>}
          note="取り込む前に内容を確認できます。確認なしで反映されることはありません。"
        />
        {roleNote && <p className="m-0 text-[12px] leading-[1.6] text-sub">{roleNote}</p>}
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <Tile delay={80} className="flex flex-col gap-2.5">
          <span className="text-[14px] font-bold">取り込めるもの</span>
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-[3px] rounded-xl border border-line bg-bg px-3.5 py-3">
              <span className="text-[12px] font-bold">CoBRA 標準データ</span>
              <span className="text-[11px] leading-normal text-sub">
                デフォルトの変動要因と三角分布。既定では取り込みません。選ぶと現在のモデルに要因として追加されます（「要因を追加」の標準リストは変わりません）
              </span>
            </div>
            <div className="flex flex-col gap-[3px] rounded-xl border border-line bg-bg px-3.5 py-3">
              <span className="text-[12px] font-bold">ユーザデータ</span>
              <span className="text-[11px] leading-normal text-sub">簡易見積りモデルツールで構築したモデル — 使った要因、三角分布、要因間の関係、入力した実績データ</span>
            </div>
          </div>
        </Tile>
        <RecentImports />
      </div>
    </div>
  );
}

function RecentImports() {
  const h = useTransferHistory();
  const rows = (h.data ?? []).filter((r) => r.action === 'transfer.import' && ['json', 'xml'].includes((r.detail as { kind?: string } | null)?.kind ?? '')).slice(0, 5);
  return (
    <Tile delay={160} className="flex flex-col gap-2.5">
      <span className="text-[14px] font-bold">最近の取り込み</span>
      <div className="flex flex-col gap-1.5 text-[12px]">
        {rows.map((r) => {
          const d = r.detail as { kind: string; fileName: string; factorsAdded?: number; factorsUpdated?: number; projectsAdded?: number; projectsUpdated?: number };
          const pj = (d.projectsAdded ?? 0) + (d.projectsUpdated ?? 0);
          const what = d.kind === 'xml' ? 'XML を変換' : `要因 ${(d.factorsAdded ?? 0) + (d.factorsUpdated ?? 0)}${pj ? ` ・ 実績 ${pj}` : ''}`;
          return (
            <div key={r.id} className="flex flex-wrap justify-between gap-x-2.5 border-b border-line py-2">
              <span className="min-w-0 truncate">{d.fileName}</span>
              <span className="shrink-0 text-sub">
                {mmdd(r.at)} ・ {what}
              </span>
            </div>
          );
        })}
        {h.isError ? (
          <span role="alert" className="flex flex-wrap items-center gap-2 py-2 text-coral-soft">
            {describeApiError(h.error)}
            <button type="button" onClick={() => void h.refetch()} className="btn min-h-7 cursor-pointer rounded-lg border border-muted bg-transparent px-2.5 text-[12px] text-sub hover:text-text">
              再試行
            </button>
          </span>
        ) : (
          !rows.length && <span className="py-2 text-sub">{h.isLoading ? '読み込み中…' : 'まだありません'}</span>
        )}
      </div>
    </Tile>
  );
}

function ImportPreview({ loaded, bundle, projects, role, userName, onReset }: { loaded: Loaded; bundle: ModelBundle; projects: ProjectRow[]; role: Role | null; userName: string; onReset: () => void }) {
  const { file } = loaded;
  const newGroup = nextGroupIds(bundle.groups.map((g) => g.id), 1)[0]!;
  const groups = useMemo(() => importGroups(file, bundle.factors, newGroup), [file, bundle.factors, newGroup]);
  // 既定: 実績（機密）と CoBRA 標準データ（モデルの要因表に入る）は選ばない
  const [picked, setPicked] = useState<Picked>(() => defaultPicked(groups));
  const [resolutions, setResolutions] = useState<Record<number, Resolution>>({});
  const [pjResolutions, setPjResolutions] = useState<Record<string, ProjectResolution>>({});
  const conflicts = useMemo(() => findConflicts(file, bundle.factors, picked), [file, bundle.factors, picked]);
  const commit = useImportCommit();
  const [confirming, setConfirming] = useState(false);
  const [backup, setBackup] = useState<string | null>(null);
  // 実績の ID・グループは確定時に採番する。ID は確定のたびに作り直さないよう固定する。
  const [ids] = useState(() => new Map<number, string>());
  // 取り込み後に一覧が再取得されても、結果の表示は確定時の計画を使う
  const [donePlan, setDonePlan] = useState<ImportPlan | null>(null);
  const plan = useMemo(() => {
    let i = 0;
    return buildImportPlan({
      file, fileName: loaded.fileName, sourceKind: loaded.kind, picked, resolutions, projectResolutions: pjResolutions,
      existingFactors: bundle.factors, existingProjects: projects, existingGroups: bundle.groups,
      newId: () => {
        const k = i++;
        if (!ids.has(k)) ids.set(k, crypto.randomUUID());
        return ids.get(k)!;
      },
    });
  }, [file, loaded, picked, resolutions, pjResolutions, bundle, projects, ids]);

  const triangleGroup: Partial<Record<ImportGroupKey, ImportGroupKey>> = { stdTriangles: 'stdFactors', userTriangles: 'userFactors' };
  const isDisabled = (k: ImportGroupKey) => {
    const g = groups.find((x) => x.key === k)!;
    const parent = triangleGroup[k];
    return g.count === 0 || (parent ? !picked[parent] : false);
  };
  const pickedCount = groups.filter((g) => picked[g.key] && !isDisabled(g.key)).length;
  const r = plan.request;
  const sum = plan.summary;
  const changes = r.factorsInsert.length + r.factorsUpdate.length + r.projects.length + (r.projectsUpdate?.length ?? 0);
  const needsAdmin = r.factorsInsert.length + r.factorsUpdate.length > 0;
  const allowed = role === 'admin' || (!needsAdmin && role === 'pmo');
  const curVersion = bundle.activeVersion?.version ?? 0;
  const triNow = bundle.factors.reduce((s, f) => s + f.triangles.length, 0);
  const stdNow = bundle.factors.filter((f) => f.origin === 'standard').length;
  const exportedOn = ymd(file.exportedAt);
  const meta = [
    `${kb(loaded.size)} KB`,
    loaded.kind === 'xml' ? `旧 XML (${loaded.encoding}) を変換` : `形式 ${file.format}`,
    file.model.name || null,
    exportedOn ? `${exportedOn} に書き出し` : null,
    file.exportedBy ? `作成者 ${file.exportedBy}` : null,
  ]
    .filter(Boolean)
    .join(' ・ ');
  const pjPicked = picked.projects && !isDisabled('projects');
  const sameDups = plan.projectDups.filter((d) => d.status === 'same');
  const changedDups = plan.projectDups.filter((d) => d.status === 'changed');
  const destructive = sum.factorsUpdate > 0 || sum.projectsUpdate > 0;

  const confirm = () =>
    commit.mutate(r, {
      onSuccess: () => {
        setDonePlan(plan);
        setConfirming(false);
      },
    });

  if (commit.isSuccess && donePlan) {
    const d = commit.data;
    const s = donePlan.summary;
    return (
      <div className="grid grid-cols-1 items-start gap-4 @4xl:grid-cols-[minmax(0,1.5fr)_360px]">
        <Tile className="flex flex-col gap-3.5">
          <TileHead title={`${loaded.fileName} を取り込みました`} />
          <div role="status" className="flex flex-col gap-2 text-[12px]">
            <KV k="追加した要因"><span className="n">{d.factorsAdded}</span></KV>
            <KV k="上書きした要因"><span className="n">{s.factorsUpdate}</span></KV>
            {s.factorsKeep > 0 && <KV k="既存を残した要因（同名）"><span className="n">{s.factorsKeep}</span></KV>}
            <KV k="追加した実績"><span className="n">{d.projectsAdded}</span></KV>
            {(d.projectsUpdated ?? 0) > 0 && <KV k="更新した実績"><span className="n">{d.projectsUpdated}</span></KV>}
            {s.projectsSame > 0 && <KV k="既に取り込み済みの実績（取り込まず）"><span className="n">{s.projectsSame}</span></KV>}
            {s.projectsSkip > 0 && <KV k="取り込まなかった実績（同じ ID）"><span className="n">{s.projectsSkip}</span></KV>}
            {d.groupsAdded > 0 && <KV k="追加したグループ">{commit.variables?.groups.map((g) => `${g.id} (${g.name})`).join(', ')}</KV>}
          </div>
          {changes > 0 && (
            <Notice tone="warn">
              要因や実績が変わったので、モデルの再構築が必要です (v{curVersion + 1} になります)。現在の v{curVersion} はそのまま残ります。
            </Notice>
          )}
          <span className="text-[11px] leading-[1.6] text-sub">
            取り込みは元に戻せません。戻すときは、取り込み前に書き出したバックアップを取り込むか、「実績データ」「変動要因」で個別に直してください。
          </span>
          <div className="flex flex-wrap gap-2.5">
            <Link to="/model/build" className={cx(primaryBtn, 'inline-flex items-center no-underline')}>
              モデル構築へ
            </Link>
            {d.projectsAdded + (d.projectsUpdated ?? 0) > 0 && (
              <Link to="/model/projects" className={ghostBtn}>
                実績データを確認
              </Link>
            )}
            <button type="button" onClick={onReset} className={ghostBtn}>
              別のファイルを取り込む
            </button>
          </div>
        </Tile>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 @4xl:grid-cols-[minmax(0,1.5fr)_360px]">
      <div className="flex min-w-0 flex-col gap-4">
        <FileHead badge={loaded.kind === 'xml' ? 'XML' : 'JSON'} name={loaded.fileName} meta={meta} onReset={onReset} />
        <Tile delay={80} className="flex flex-col gap-3">
          <TileHead title="内容 — 取り込むものを選ぶ" aside={`${pickedCount} / ${groups.length} を選択`} />
          <div className="flex flex-col gap-1.5">
            {groups.map((g) => (
              <CheckRow
                key={g.key}
                on={picked[g.key]}
                disabled={isDisabled(g.key)}
                onToggle={() => setPicked((p) => ({ ...p, [g.key]: !p[g.key] }))}
                name={g.name}
                desc={g.desc}
                count={g.count}
                tag={g.tag}
              />
            ))}
          </div>
        </Tile>
        {conflicts.length > 0 && (
          <Tile delay={160} className="flex flex-col gap-3">
            <TileHead title={`同じ名前の要因が ${conflicts.length} 件 — どうしますか`} aside={`既存のモデル v${curVersion} と比較`} />
            <div className="flex flex-col gap-2">
              {conflicts.map((c) => (
                <div key={c.fileNo} className="flex flex-wrap items-center justify-between gap-x-3.5 gap-y-2 rounded-xl border border-line bg-bg px-3.5 py-3">
                  <div className="flex min-w-[min(100%,16rem)] flex-1 flex-col gap-[3px]">
                    <span className="text-[13px] font-bold">{c.name}</span>
                    <DiffList summary={c.diff} diffs={c.diffs} />
                  </div>
                  <Seg
                    label={`${c.name} の扱い`}
                    className="bg-card"
                    options={RESOLUTIONS.map((o) => ({ ...o, danger: o.key === 'overwrite' }))}
                    value={resolutions[c.fileNo] ?? 'keep'}
                    onChange={(k) => setResolutions((s) => ({ ...s, [c.fileNo]: k }))}
                  />
                </div>
              ))}
            </div>
          </Tile>
        )}
        {pjPicked && plan.projectDups.length > 0 && (
          <ProjectDupsTile sameDups={sameDups} changedDups={changedDups} value={pjResolutions} onChange={(id, k) => setPjResolutions((s) => ({ ...s, [id]: k }))} />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-4 @4xl:sticky @4xl:top-6">
        <Tile delay={120} className="flex flex-col gap-3.5">
          <span className="text-[14px] font-bold">取り込み後のモデル</span>
          <div className="flex flex-col gap-2 text-[12px]">
            <KV k="変動要因"><span className="n">{bundle.factors.length} → {plan.after.factors}</span></KV>
            <KV k="三角分布"><span className="n">{triNow} → {plan.after.triangles}</span></KV>
            <KV k="実績データ">
              <span className="n">{fmtInt(projects.length)} → {fmtInt(plan.after.projects)}</span>
              {sum.projectsSame > 0 && <span className="block text-[11px] text-sub">既に取り込み済み {sum.projectsSame} 件は除く</span>}
            </KV>
            <KV k="うち標準由来の要因"><span className="n">{stdNow} → {plan.after.standard}</span></KV>
          </div>
          {plan.warnings.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[11px] leading-normal text-warn">
              {plan.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          {changes > 0 && (
            <Notice tone="warn">
              要因や実績が変わるので、取り込み後はモデルの再構築が必要です (v{curVersion + 1} になります)。現在の v{curVersion} はそのまま残ります。
            </Notice>
          )}
          {pjPicked && r.projects.length > 0 && (
            <Notice tone="coral">
              実績データ {r.projects.length} 件は機密です。グループ {r.groups.map((g) => g.id).join(', ')} として追加します。
            </Notice>
          )}
          {!allowed && (
            <span className="text-[12px] text-coral-soft">
              {role ? (needsAdmin ? '要因の取り込みはモデル管理者のみです。実績だけを選べば PMO でも取り込めます。' : '実績の取り込みは PMO またはモデル管理者のみです。') : '読み取り専用モードです（ログインが必要）。'}
            </span>
          )}
          <button type="button" disabled={!pickedCount || !changes || !allowed || commit.isPending} onClick={() => setConfirming(true)} className={primaryBtn}>
            {commit.isPending ? '取り込んでいます…' : changes ? `${pickedCount} 項目を取り込む` : sum.projectsSame > 0 ? 'すべて取り込み済みです' : '取り込む変更がありません'}
          </button>
          <button type="button" onClick={onReset} className={ghostBtn}>
            やり直す
          </button>
        </Tile>
      </div>

      <ConfirmDialog
        open={confirming}
        title={`${loaded.fileName} を取り込みますか`}
        confirmLabel="取り込む"
        danger={destructive}
        busy={commit.isPending}
        error={commit.isError ? describeApiError(commit.error) : null}
        onConfirm={confirm}
        onCancel={() => {
          setConfirming(false);
          commit.reset();
        }}
      >
        <div className="flex flex-col gap-3">
          <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[12px]">
            <dt className="text-sub">要因</dt>
            <dd className="m-0 text-text">
              追加 {sum.factorsAdd} ・ <span className={cx(sum.factorsUpdate > 0 && 'text-coral-soft')}>上書き {sum.factorsUpdate}</span> ・ 既存を残す {sum.factorsKeep}
            </dd>
            <dt className="text-sub">実績</dt>
            <dd className="m-0 text-text">
              {pjPicked ? (
                <>
                  追加 {sum.projectsAdd} ・ <span className={cx(sum.projectsUpdate > 0 && 'text-coral-soft')}>更新 {sum.projectsUpdate}</span> ・ 取り込まない {sum.projectsSame + sum.projectsSkip}
                  {sum.projectsSame > 0 && <span className="text-sub">（うち既に取り込み済み {sum.projectsSame}）</span>}
                </>
              ) : (
                '取り込まない'
              )}
            </dd>
          </dl>
          <p className="m-0">
            <strong className="text-text">取り込みは元に戻せません。</strong>
            {destructive ? '上書き・更新した内容は、取り込み前の状態に戻すボタンがありません。' : ''}
            必要なら先に現在のモデル（実績を含む）をバックアップしてください。
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            <button type="button" onClick={() => setBackup(downloadBackup(bundle, projects, userName))} className={ghostBtn}>
              現在のモデルを JSON でバックアップ
            </button>
            {backup && (
              <span role="status" className="text-[12px] text-ok">
                {backup} を保存しました
              </span>
            )}
          </div>
        </div>
      </ConfirmDialog>
    </div>
  );
}

function ProjectDupsTile(p: { sameDups: ProjectDup[]; changedDups: ProjectDup[]; value: Record<string, ProjectResolution>; onChange: (id: string, k: ProjectResolution) => void }) {
  return (
    <Tile delay={200} className="flex flex-col gap-3">
      <TileHead title={`既存と同じ ID の実績が ${p.sameDups.length + p.changedDups.length} 件`} aside="ID で突き合わせ" />
      {p.sameDups.length > 0 && (
        <details className="rounded-xl border border-line bg-bg px-3.5 py-3 text-[12px]">
          <summary className="cursor-pointer">
            <span className="font-bold">既に取り込み済み {p.sameDups.length} 件</span>
            <span className="text-sub"> — 内容が同じなので取り込みません</span>
          </summary>
          <span className="mt-2 block font-num text-[11px] leading-[1.7] break-words text-sub">{p.sameDups.map((d) => d.fileId).join('、')}</span>
        </details>
      )}
      {p.changedDups.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[12px] text-sub">ID が同じで内容が違う実績 {p.changedDups.length} 件 — どうしますか</span>
          {p.changedDups.map((d) => (
            <div key={d.fileId} className="flex flex-wrap items-center justify-between gap-x-3.5 gap-y-2 rounded-xl border border-line bg-bg px-3.5 py-3">
              <div className="flex min-w-[min(100%,16rem)] flex-1 flex-col gap-[3px]">
                <span className="text-[13px] font-bold">
                  <span className="font-num">{d.fileId}</span>
                  {d.name !== d.fileId && <span className="font-normal text-sub"> ・ {d.name}</span>}
                </span>
                <DiffList summary={d.diffs.length > 1 ? `${d.diffs[0]} ほか ${d.diffs.length - 1} 点` : (d.diffs[0] ?? '')} diffs={d.diffs} />
              </div>
              <Seg
                label={`${d.fileId} の扱い`}
                className="bg-card"
                options={PROJECT_RESOLUTIONS.map((o) => ({ ...o, danger: o.key === 'update' }))}
                value={p.value[d.fileId] ?? d.resolution ?? 'rename'}
                onChange={(k) => p.onChange(d.fileId, k)}
              />
            </div>
          ))}
          <span className="text-[11px] leading-[1.6] text-sub">「既存を更新」は規模・工数・レベル値・備考を書き換えます（グループと採用は変えません）。「別 ID で追加」は末尾に -2 などを付けた新しい実績になります。</span>
        </div>
      )}
    </Tile>
  );
}
