// タブ 1: JSON を取り込む（旧 XML は変換してから同じ流れ）
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { ModelBundle, ProjectRow, Role } from '../../../shared/types';
import { fmtInt } from '../../ui/format';
import { useImportCommit, useTransferHistory } from './api';
import { decodeAuto, decodeXml } from './decode';
import { buildImportPlan, findConflicts, importGroups, IMPORT_GROUPS, nextGroupIds, RESOLUTIONS, type ImportGroupKey, type Picked, type Resolution } from './importPlan';
import { parseModelJson, type ModelFile } from './schema';
import { CheckRow, cx, DropZone, FileHead, ghostBtn, KV, kb, mmdd, Notice, primaryBtn, Seg, Tile, TileHead, ymd } from './ui';
import { parseLegacyXml } from './xml';

const MAX_BYTES = 5 * 1024 * 1024;

type Loaded = { fileName: string; size: number; kind: 'json' | 'xml'; encoding: string; file: ModelFile };
type State = { step: 'idle' } | { step: 'error'; fileName: string; errors: string[] } | { step: 'preview'; loaded: Loaded };

export async function readModelFile(f: File): Promise<{ ok: true; loaded: Loaded } | { ok: false; errors: string[] }> {
  if (f.size > MAX_BYTES) return { ok: false, errors: ['ファイルが大きすぎます (5 MB まで)'] };
  const buf = await f.arrayBuffer();
  const head = new TextDecoder('latin1').decode(new Uint8Array(buf, 0, Math.min(64, buf.byteLength))).trimStart();
  const isXml = /\.xml$/i.test(f.name) || head.startsWith('<');
  const d = isXml ? decodeXml(buf) : decodeAuto(buf);
  const r = isXml ? parseLegacyXml(d.text) : parseModelJson(d.text);
  if (!r.ok) return r;
  return { ok: true, loaded: { fileName: f.name, size: f.size, kind: isXml ? 'xml' : 'json', encoding: d.encoding, file: r.data } };
}

export function ImportTab({ bundle, projects, role }: { bundle: ModelBundle; projects: ProjectRow[]; role: Role | null }) {
  const [state, setState] = useState<State>({ step: 'idle' });
  const [busy, setBusy] = useState(false);
  const onFile = async (f: File) => {
    setBusy(true);
    try {
      const r = await readModelFile(f);
      setState(r.ok ? { step: 'preview', loaded: r.loaded } : { step: 'error', fileName: f.name, errors: r.errors });
    } finally {
      setBusy(false);
    }
  };
  const reset = () => setState({ step: 'idle' });

  if (state.step === 'preview') return <ImportPreview key={state.loaded.fileName + state.loaded.size} loaded={state.loaded} bundle={bundle} projects={projects} role={role} onReset={reset} />;
  return (
    <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4">
      <div className="flex flex-col gap-4">
        {state.step === 'error' && (
          <div role="alert" className="tile flex flex-col gap-2.5 border-coral/40 px-[22px] py-5">
            <TileHead title={`${state.fileName} を読み込めませんでした`} />
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[12px] text-coral-soft">
              {state.errors.map((e, i) => (
                <li key={i} className="font-num break-all">{e}</li>
              ))}
            </ul>
            <span className="text-[11px] text-weak">形式は estima-model/1 の JSON、または旧 Excel 版の XML (&lt;CoBRAModel&gt;) です。</span>
          </div>
        )}
        <DropZone
          accept=".json,.xml,application/json,application/xml,text/xml"
          onFile={onFile}
          busy={busy}
          title="モデルパラメータ JSON をここにドロップ"
          sub={<>または <span className="text-accent underline">ファイルを選ぶ</span> ・ .json / 旧 .xml (Shift-JIS は自動変換)</>}
          note="取り込む前に内容を確認できます。確認なしで反映されることはありません。"
        />
      </div>
      <div className="flex flex-col gap-4">
        <Tile delay={80} className="flex flex-col gap-2.5">
          <span className="text-[14px] font-bold">取り込めるもの</span>
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-[3px] rounded-xl border border-line bg-bg px-3.5 py-3">
              <span className="text-[12px] font-bold">CoBRA 標準データ</span>
              <span className="text-[11px] leading-normal text-sub">デフォルトの変動要因と三角分布。「要因を追加」の標準リストに入ります</span>
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
          const d = r.detail as { kind: string; fileName: string; factorsAdded?: number; factorsUpdated?: number; projectsAdded?: number };
          const what = d.kind === 'xml' ? 'XML を変換' : `要因 ${(d.factorsAdded ?? 0) + (d.factorsUpdated ?? 0)}${d.projectsAdded ? ` ・ 実績 ${d.projectsAdded}` : ''}`;
          return (
            <div key={r.id} className="flex justify-between gap-2.5 border-b border-line py-2">
              <span className="truncate">{d.fileName}</span>
              <span className="shrink-0 text-weak">{mmdd(r.at)} ・ {what}</span>
            </div>
          );
        })}
        {!rows.length && <span className="py-2 text-weak">{h.isLoading ? '読み込み中…' : 'まだありません'}</span>}
      </div>
    </Tile>
  );
}

function ImportPreview({ loaded, bundle, projects, role, onReset }: { loaded: Loaded; bundle: ModelBundle; projects: ProjectRow[]; role: Role | null; onReset: () => void }) {
  const { file } = loaded;
  const newGroup = nextGroupIds(bundle.groups.map((g) => g.id), 1)[0]!;
  const groups = useMemo(() => importGroups(file, bundle.factors, newGroup), [file, bundle.factors, newGroup]);
  const [picked, setPicked] = useState<Picked>(() => {
    const p = Object.fromEntries(IMPORT_GROUPS.map((k) => [k, false])) as Picked;
    // 既定: 実績（機密）以外で中身のあるものを選ぶ
    for (const g of groups) p[g.key] = g.count > 0 && g.key !== 'projects';
    return p;
  });
  const [resolutions, setResolutions] = useState<Record<number, Resolution>>({});
  const conflicts = useMemo(() => findConflicts(file, bundle.factors, picked), [file, bundle.factors, picked]);
  const commit = useImportCommit();
  // 実績の ID・グループは確定時に採番する。ID は確定のたびに作り直さないよう固定する。
  const [ids] = useState(() => new Map<number, string>());
  const plan = useMemo(() => {
    let i = 0;
    return buildImportPlan({
      file, fileName: loaded.fileName, sourceKind: loaded.kind, picked, resolutions,
      existingFactors: bundle.factors, existingProjects: projects, existingGroups: bundle.groups,
      newId: () => {
        const k = i++;
        if (!ids.has(k)) ids.set(k, crypto.randomUUID());
        return ids.get(k)!;
      },
    });
  }, [file, loaded, picked, resolutions, bundle, projects, ids]);

  const triangleGroup: Partial<Record<ImportGroupKey, ImportGroupKey>> = { stdTriangles: 'stdFactors', userTriangles: 'userFactors' };
  const isDisabled = (k: ImportGroupKey) => {
    const g = groups.find((x) => x.key === k)!;
    const parent = triangleGroup[k];
    return g.count === 0 || (parent ? !picked[parent] : false);
  };
  const pickedCount = groups.filter((g) => picked[g.key] && !isDisabled(g.key)).length;
  const r = plan.request;
  const changes = r.factorsInsert.length + r.factorsUpdate.length + r.projects.length;
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
  ].filter(Boolean).join(' ・ ');

  if (commit.isSuccess) {
    const d = commit.data;
    return (
      <div className="grid grid-cols-[minmax(0,1.5fr)_360px] items-start gap-4">
        <Tile className="flex flex-col gap-3.5">
          <TileHead title={`${loaded.fileName} を取り込みました`} />
          <div className="flex flex-col gap-2 text-[12px]">
            <KV k="追加した要因"><span className="n">{d.factorsAdded}</span></KV>
            <KV k="上書きした要因"><span className="n">{d.factorsUpdated}</span></KV>
            <KV k="追加した実績"><span className="n">{d.projectsAdded}</span></KV>
            {d.groupsAdded > 0 && <KV k="追加したグループ">{commit.variables?.groups.map((g) => `${g.id} (${g.name})`).join(', ')}</KV>}
          </div>
          <Notice tone="warn">要因や実績が変わったので、モデルの再構築が必要です (v{curVersion + 1} になります)。現在の v{curVersion} はそのまま残ります。</Notice>
          <div className="flex gap-2.5">
            <Link to="/model/build" className={cx(primaryBtn, 'inline-flex items-center no-underline')}>モデル構築へ</Link>
            <button type="button" onClick={onReset} className={ghostBtn}>別のファイルを取り込む</button>
          </div>
        </Tile>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1.5fr)_360px] items-start gap-4">
      <div className="flex flex-col gap-4">
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
                <div key={c.fileNo} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3.5 rounded-xl border border-line bg-bg px-3.5 py-3">
                  <div className="flex min-w-0 flex-col gap-[3px]">
                    <span className="text-[13px] font-bold">{c.name}</span>
                    <span className="text-[11px] text-sub">{c.diff}</span>
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
      </div>
      <div className="sticky top-6 flex flex-col gap-4">
        <Tile delay={120} className="flex flex-col gap-3.5">
          <span className="text-[14px] font-bold">取り込み後のモデル</span>
          <div className="flex flex-col gap-2 text-[12px]">
            <KV k="変動要因"><span className="n">{bundle.factors.length} → {plan.after.factors}</span></KV>
            <KV k="三角分布"><span className="n">{triNow} → {plan.after.triangles}</span></KV>
            <KV k="実績データ"><span className="n">{fmtInt(projects.length)} → {fmtInt(plan.after.projects)}</span></KV>
            <KV k="うち標準要因"><span className="n">{stdNow} → {plan.after.standard}</span></KV>
          </div>
          {plan.warnings.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[11px] leading-normal text-warn">
              {plan.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
          <Notice tone="warn">要因や実績が変わるので、取り込み後はモデルの再構築が必要です (v{curVersion + 1} になります)。現在の v{curVersion} はそのまま残ります。</Notice>
          {picked.projects && !isDisabled('projects') && (
            <Notice tone="coral">実績データ {file.projects?.length ?? 0} 件は機密です。グループ {r.groups.map((g) => g.id).join(', ')} として追加します。</Notice>
          )}
          {!allowed && (
            <span className="text-[11px] text-coral-soft">
              {role ? (needsAdmin ? '要因の取り込みはモデル管理者のみです。' : '実績の取り込みは PMO またはモデル管理者のみです。') : '読み取り専用モードです（ログインが必要）。'}
            </span>
          )}
          {commit.isError && <span role="alert" className="text-[12px] text-coral-soft">{commit.error.message}</span>}
          <button type="button" disabled={!pickedCount || !changes || !allowed || commit.isPending} onClick={() => commit.mutate(r)} className={primaryBtn}>
            {commit.isPending ? '取り込んでいます…' : changes ? `${pickedCount} 項目を取り込む` : '取り込む変更がありません'}
          </button>
          <button type="button" onClick={onReset} className={ghostBtn}>やり直す</button>
        </Tile>
      </div>
    </div>
  );
}
