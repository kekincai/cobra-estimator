// タブ 2: JSON を書き出す（ファイルをダウンロード / 管理者へアップロード）
import { useMemo, useState } from 'react';
import type { ModelBundle, ProjectRow, Role, SubmissionRow } from '../../../shared/types';
import { describeApiError } from '../../ui/apiError';
import { logExport, useSubmissions, useSubmit } from './api';
import { downloadText } from './backup';
import { buildExport, DEFAULT_EXPORT, EXPORT_ITEMS, exportFileName, exportItems, previewJson, toJsonText, type ExportPicked } from './exportModel';
import { CheckRow, cx, kb, mmdd, Notice, primaryBtn, Tile, TileHead } from './ui';

const DESTS = [
  { label: 'ファイルをダウンロード', desc: '自分の PC に保存。別環境への持ち込みやバックアップに' },
  { label: '管理者へアップロード', desc: '標準データへのフィードバック。モデル管理者が確認し、承認されたものを CoBRA 標準データに反映' },
] as const;

export const SUBMISSION_STATUS: Record<SubmissionRow['status'], { label: string; cls: string }> = {
  pending: { label: '管理者がレビュー中', cls: 'bg-warn/10 text-warn' },
  approved: { label: '承認済み', cls: 'bg-ok/10 text-ok' },
  rejected: { label: '却下', cls: 'bg-coral/10 text-coral-soft' },
};

export function ExportTab({ bundle, projects, role, userName, userEmail }: { bundle: ModelBundle; projects: ProjectRow[]; role: Role | null; userName: string; userEmail: string | null }) {
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
  // 自分の申請だけ（管理者にはサーバーが全員分を返すので、ここで絞る）
  const mine = (subs.data ?? []).filter((x) => !userEmail || x.submittedBy.toLowerCase() === userEmail.toLowerCase()).slice(0, 5);
  const latest = mine[0];
  const chosen = EXPORT_ITEMS.filter((k) => picked[k] && !(k === 'projects' && upload));

  const onExport = () => {
    if (upload) {
      submit.mutate({ modelVersionId: bundle.activeVersion?.id ?? 'none', payload: file, note }, { onSuccess: () => setNote('') });
      return;
    }
    downloadText(fileName, text);
    setDownloaded(new Date().toISOString());
    void logExport({ fileName, items: chosen, includesProjects: pjOn, bytes: text.length });
  };

  const step = latest?.status === 'approved' ? 3 : latest ? 2 : 1;
  const Step = ({ n, label }: { n: number; label: string }) => (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx('inline-flex size-[18px] items-center justify-center rounded-full text-[11px] font-bold', n <= step ? 'bg-accent text-bg' : 'border border-line-strong')}>{n}</span>
      {label}
    </span>
  );

  return (
    <div className="grid grid-cols-1 items-start gap-4 @3xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-4">
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
          <div className="grid grid-cols-1 gap-2.5 @md:grid-cols-2">
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
              <div className="flex flex-wrap items-center gap-y-1 text-[11px] text-sub">
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
              <span className="text-[11px] leading-[1.6] text-sub">
                旧版の「XML をメールで送付」(J-MDL-007) の置き換え。あなたの申請の状況と管理者のコメントは下に表示されます。承認された内容は、モデル管理者が CoBRA 標準データへ反映します。
              </span>
              {subs.isError && (
                <span role="alert" className="flex flex-wrap items-center gap-2 text-[12px] text-coral-soft">
                  申請の状況を読み込めませんでした。{describeApiError(subs.error)}
                  <button type="button" onClick={() => void subs.refetch()} className="btn min-h-7 cursor-pointer rounded-lg border border-muted bg-transparent px-2.5 text-[12px] text-sub hover:text-text">
                    再試行
                  </button>
                </span>
              )}
              {mine.length > 0 && (
                <div className="flex flex-col gap-1 text-[12px]" aria-live="polite">
                  <span className="text-[11px] font-bold text-sub">あなたの申請</span>
                  {mine.map((s) => (
                    <div key={s.id} className="flex flex-col gap-1 border-b border-line py-2">
                      <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1">
                        <span className="min-w-0 truncate">
                          {mmdd(s.createdAt)} ・ {s.note || 'メモなし'}
                        </span>
                        <span className={cx('shrink-0 rounded-full px-2 py-[3px] text-[11px] whitespace-nowrap', SUBMISSION_STATUS[s.status].cls)}>{SUBMISSION_STATUS[s.status].label}</span>
                      </div>
                      {s.review?.note && (
                        <span className="text-[11px] leading-[1.6] break-words text-sub">
                          管理者のコメント（{s.review.by}・{mmdd(s.review.at)}）: {s.review.note}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Tile>
      </div>
      <div className="flex min-w-0 flex-col gap-4 @3xl:sticky @3xl:top-6">
        <Tile delay={60} className="flex flex-col gap-3">
          <TileHead title="プレビュー" aside={<span className="font-num tabular-nums">{fileName} ・ 約 {size} KB</span>} />
          <pre className="m-0 max-h-[420px] overflow-auto rounded-xl border border-line bg-bg px-4 py-3.5 font-num text-[11.5px] leading-[1.65] whitespace-pre-wrap break-all text-text/80 tabular-nums">
            {previewJson(file)}
          </pre>
          {pjOn && <Notice tone="coral">実績データ {projects.length} 件を含めます。機密データです — 社外 (標準データ管理者) へ送る場合は含めないのが既定です。</Notice>}
          {submit.isError && <span role="alert" className="text-[12px] text-coral-soft">アップロードできませんでした。{describeApiError(submit.error)}</span>}
          {submit.isSuccess && upload && <span role="status" className="text-[12px] text-ok">アップロードしました。モデル管理者の確認を待っています（状況は左の「あなたの申請」に出ます）。</span>}
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
