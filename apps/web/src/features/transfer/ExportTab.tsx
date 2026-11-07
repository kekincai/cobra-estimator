// タブ 2: JSON を書き出す（ファイルをダウンロード / 管理者へアップロード）
import { useMemo, useState } from 'react';
import type { ModelBundle, ProjectRow, Role, SubmissionRow } from '../../../shared/types';
import { logExport, useSubmissions, useSubmit } from './api';
import { buildExport, DEFAULT_EXPORT, EXPORT_ITEMS, exportFileName, exportItems, previewJson, toJsonText, type ExportPicked } from './exportModel';
import { CheckRow, cx, kb, mmdd, Notice, primaryBtn, Tile, TileHead } from './ui';

const DESTS = [
  { label: 'ファイルをダウンロード', desc: '自分の PC に保存。別環境への持ち込みやバックアップに' },
  { label: '管理者へアップロード', desc: '標準データへのフィードバック。承認されると CoBRA 標準データに反映' },
] as const;

const STATUS: Record<SubmissionRow['status'], { label: string; cls: string }> = {
  pending: { label: '管理者がレビュー中', cls: 'bg-warn/10 text-warn' },
  approved: { label: '承認済み', cls: 'bg-ok/10 text-ok' },
  rejected: { label: '差し戻し', cls: 'bg-coral/10 text-coral-soft' },
};

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportTab({ bundle, projects, role, userName }: { bundle: ModelBundle; projects: ProjectRow[]; role: Role | null; userName: string }) {
  const [picked, setPicked] = useState<ExportPicked>(DEFAULT_EXPORT);
  const [dest, setDest] = useState<0 | 1>(1);
  const [note, setNote] = useState('');
  const [downloaded, setDownloaded] = useState<string | null>(null);
  const upload = dest === 1;
  const items = useMemo(() => exportItems(bundle, projects), [bundle, projects]);
  const file = useMemo(() => buildExport(bundle, projects, picked, { exportedBy: userName, forUpload: upload }), [bundle, projects, picked, userName, upload]);
  const text = useMemo(() => toJsonText(file), [file]);
  const size = kb(new TextEncoder().encode(text).length);
  const fileName = exportFileName(bundle);
  const pjOn = picked.projects && !upload;
  const submit = useSubmit();
  const subs = useSubmissions(!!role);
  const mine = subs.data?.slice(0, 3) ?? [];
  const latest = mine[0];
  const chosen = EXPORT_ITEMS.filter((k) => picked[k] && !(k === 'projects' && upload));

  const onExport = () => {
    if (upload) {
      submit.mutate({ modelVersionId: bundle.activeVersion?.id ?? 'none', payload: file, note }, { onSuccess: () => setNote('') });
      return;
    }
    download(fileName, text);
    setDownloaded(new Date().toISOString());
    void logExport({ fileName, items: chosen, includesProjects: pjOn, bytes: text.length });
  };

  const step = latest?.status === 'approved' ? 3 : latest ? 2 : 1;
  const Step = ({ n, label }: { n: number; label: string }) => (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx('inline-flex size-[18px] items-center justify-center rounded-full text-[10px] font-bold', n <= step ? 'bg-accent text-bg' : 'border border-line-strong')}>{n}</span>
      {label}
    </span>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] items-start gap-4">
      <div className="flex flex-col gap-4">
        <Tile className="flex flex-col gap-3">
          <TileHead title="書き出す内容" aside="旧 J-MDL-006 の項目" />
          <div className="flex flex-col gap-1.5">
            {items.map((e) => {
              const locked = e.key === 'projects' && upload;
              return (
                <CheckRow
                  key={e.key}
                  on={picked[e.key]}
                  disabled={locked}
                  onToggle={() => setPicked((p) => ({ ...p, [e.key]: !p[e.key] }))}
                  name={e.name}
                  desc={locked ? '管理者へのアップロードには含めません (機密)' : e.desc}
                  tag={e.tag}
                />
              );
            })}
          </div>
        </Tile>
        <Tile delay={100} className="flex flex-col gap-3">
          <span className="text-[14px] font-bold">送り先</span>
          <div className="grid grid-cols-2 gap-2.5">
            {DESTS.map((d, i) => (
              <button
                key={d.label}
                type="button"
                aria-pressed={dest === i}
                onClick={() => setDest(i as 0 | 1)}
                className={cx('btn flex cursor-pointer flex-col gap-1 rounded-xl border px-4 py-3.5 text-left text-text', dest === i ? 'border-accent bg-card-2' : 'border-line bg-bg')}
              >
                <span className="text-[13px] font-bold">{d.label}</span>
                <span className="text-[11px] leading-normal text-sub">{d.desc}</span>
              </button>
            ))}
          </div>
          {upload && (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center text-[11px] text-sub">
                <Step n={1} label="アップロード" />
                <span className="mx-2 h-px flex-1 bg-line" />
                <Step n={2} label="管理者がレビュー" />
                <span className="mx-2 h-px flex-1 bg-line" />
                <Step n={3} label="標準データへ反映" />
              </div>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                aria-label="管理者へのメモ"
                placeholder="管理者へのメモ (任意) — 例: Web 系 11 件で構築。要因 05 の L3 定義を変えています。"
                className="w-full resize-none rounded-[10px] border border-line bg-bg px-3 py-2.5 text-[12px] leading-[1.6] text-text focus:border-accent focus:outline-none"
              />
              <span className="text-[11px] text-weak">旧版の「XML をメールで送付」(J-MDL-007) の置き換え。送付履歴と承認状況はダッシュボードの「最近の操作」に出ます。</span>
              {mine.length > 0 && (
                <div className="flex flex-col gap-1 text-[12px]" aria-live="polite">
                  {mine.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-2.5 border-b border-line py-2">
                      <span className="truncate">{mmdd(s.createdAt)} ・ {s.note || 'メモなし'}</span>
                      <span className={cx('shrink-0 rounded-full px-2 py-[3px] text-[10px] whitespace-nowrap', STATUS[s.status].cls)}>{STATUS[s.status].label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Tile>
      </div>
      <div className="sticky top-6 flex flex-col gap-4">
        <Tile delay={60} className="flex flex-col gap-3">
          <TileHead title="プレビュー" aside={<span className="font-num tabular-nums">{fileName} ・ 約 {size} KB</span>} />
          <pre className="m-0 max-h-[420px] overflow-auto rounded-xl border border-line bg-bg px-4 py-3.5 font-num text-[11.5px] leading-[1.65] whitespace-pre-wrap break-all text-text/80 tabular-nums">
            {previewJson(file)}
          </pre>
          {pjOn && <Notice tone="coral">実績データ {projects.length} 件を含めます。機密データです — 社外 (標準データ管理者) へ送る場合は含めないのが既定です。</Notice>}
          {submit.isError && <span role="alert" className="text-[12px] text-coral-soft">{submit.error.message}</span>}
          {submit.isSuccess && upload && <span role="status" className="text-[12px] text-ok">アップロードしました。管理者のレビューを待っています。</span>}
          {downloaded && !upload && <span role="status" className="text-[12px] text-ok">{fileName} を保存しました ({mmdd(downloaded)})。</span>}
          {upload && !role && <span className="text-[11px] text-coral-soft">読み取り専用モードです（ログインが必要）。</span>}
          <button type="button" onClick={onExport} disabled={(upload && (!role || submit.isPending)) || chosen.length === 0} className={primaryBtn}>
            {upload ? (submit.isPending ? 'アップロードしています…' : '管理者へアップロードする') : `JSON をダウンロード (${size} KB)`}
          </button>
        </Tile>
      </div>
    </div>
  );
}
