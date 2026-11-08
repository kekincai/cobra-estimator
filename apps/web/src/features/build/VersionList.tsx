// モデルのバージョン一覧。行を押すと右側にその版の結果を表示、「見積りに使う」で見積りに使う版を切り替える。
// 用語: 実績の「採用 / 除外」と区別するため、版の側は「見積りに使う / 使用中」と呼ぶ。
// 切り替えは組織全体の見積りに効くので、確認ダイアログで「いま → 新しい版」と α・MMRE の差を見せてから実行し、
// 成功したら「元に戻す」付きで知らせる。
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { ModelVersionRow } from '../../../shared/types';
import { apiSend, qk } from '../../data/api';
import { describeApiError } from '../../ui/apiError';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { deltaTone, displayDelta, expertLabel, shortDate, signed } from './format';

interface Props {
  versions: ModelVersionRow[];
  viewedId: string | null;
  onView: (id: string) => void;
  canActivate: boolean;
}

const groupText = (v: ModelVersionRow) => (v.version === 1 ? '初回' : v.groupId ? `グループ ${v.groupId}` : 'すべてのグループ');
const mmreText = (v: ModelVersionRow) => (v.mmre === null ? '—' : `${(v.mmre * 100).toFixed(1)}%`);
const TONE = { worse: 'text-coral-soft', better: 'text-ok', same: 'text-sub' } as const;

export function VersionList({ versions, viewedId, onView, canActivate }: Props) {
  const qc = useQueryClient();
  const active = versions.find((v) => v.active) ?? null;
  const [target, setTarget] = useState<ModelVersionRow | null>(null);
  const [done, setDone] = useState<{ to: number; from: ModelVersionRow | null } | null>(null);
  const activate = useMutation({
    mutationFn: (id: string) => apiSend('POST', `/model/versions/${encodeURIComponent(id)}/activate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.model }),
  });
  const undo = useMutation({
    mutationFn: (id: string) => apiSend('POST', `/model/versions/${encodeURIComponent(id)}/activate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.model }),
  });

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), 15000);
    return () => clearTimeout(t);
  }, [done]);

  const confirm = () => {
    if (!target) return;
    const from = active;
    activate.mutate(target.id, {
      onSuccess: () => {
        setDone({ to: target.version, from });
        setTarget(null);
      },
    });
  };

  const dAlpha = target && active ? displayDelta(target.alpha, active.alpha, 4) : null;
  const dMmre = target && active && target.mmre != null && active.mmre != null ? displayDelta(target.mmre * 100, active.mmre * 100, 1) : null;

  return (
    <div className="tile flex flex-col gap-2 px-4 py-5 sm:px-[22px]" style={{ animationDelay: '80ms' }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-[13px] font-medium">モデルのバージョン</h2>
        <span className="text-[11px] text-sub">構築するたびに追加</span>
      </div>
      {done && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-ok-bg px-3 py-2 text-[12px] text-ok">
          <span>
            v{done.to} を見積りに使う版にしました。{done.from ? `（それまでは v${done.from.version}）` : ''}
          </span>
          {done.from && canActivate && (
            <button
              type="button"
              disabled={undo.isPending}
              onClick={() =>
                undo.mutate(done.from!.id, {
                  onSuccess: () => setDone(null),
                })
              }
              className="btn inline-flex min-h-[32px] cursor-pointer items-center rounded-full border border-ok bg-transparent px-3 text-[12px] font-bold text-ok disabled:opacity-60"
            >
              {undo.isPending ? '戻しています…' : `元に戻す (v${done.from.version})`}
            </button>
          )}
        </div>
      )}
      {undo.isError && (
        <span role="alert" className="text-[12px] text-coral-ink">
          元に戻せませんでした。{describeApiError(undo.error)}
        </span>
      )}
      {versions.length === 0 && <span className="text-[12px] text-sub">まだ構築されていません。</span>}
      {versions.map((v) => {
        const viewed = v.id === viewedId;
        return (
          <div
            key={v.id}
            className={`grid grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5 rounded-[10px] border px-2.5 py-2 transition-[background,border-color] hover:bg-raised ${
              v.active ? 'border-line-mid bg-raised' : viewed ? 'border-line-strong' : 'border-transparent'
            }`}
          >
            <span className={`n text-[12px] ${v.active ? 'text-accent' : 'text-sub'}`}>v{v.version}</span>
            <button
              type="button"
              onClick={() => onView(v.id)}
              aria-pressed={viewed}
              aria-label={`v${v.version} の結果を表示（${expertLabel(v.expertMode)} の三角分布・${groupText(v)}）`}
              className="flex min-w-0 cursor-pointer flex-col items-start gap-0.5 border-0 bg-transparent p-0 text-left text-text"
            >
              <span className="text-[12px] font-medium">{v.expertMode.kind === 'average' ? '平均の' : `${expertLabel(v.expertMode)} の`}三角分布</span>
              <span className="text-[11px] text-sub">
                {groupText(v)} ・ {shortDate(v.builtAt)} ・ {v.n} 件
              </span>
            </button>
            <span className="flex flex-col items-end gap-0.5">
              <span className="n text-[14px]">{v.alpha.toFixed(4)}</span>
              <span className="text-[11px] text-sub">MMRE {mmreText(v)}</span>
            </span>
            <span className="col-start-2 col-end-4 flex justify-end">
              {v.active ? (
                <span className="inline-flex min-h-[32px] items-center rounded-full bg-ok-bg px-3 text-[12px] font-bold whitespace-nowrap text-ok">見積りに使用中</span>
              ) : (
                <button
                  type="button"
                  disabled={!canActivate || activate.isPending}
                  title={canActivate ? undefined : '切り替えには管理者の権限が必要です'}
                  onClick={() => {
                    activate.reset();
                    setTarget(v);
                  }}
                  aria-label={`v${v.version} を見積りに使う`}
                  className="btn inline-flex min-h-[32px] cursor-pointer items-center rounded-full border border-muted bg-transparent px-3 text-[12px] font-medium whitespace-nowrap text-text hover:border-line-strong disabled:cursor-not-allowed disabled:text-sub disabled:opacity-70"
                >
                  見積りに使う
                </button>
              )}
            </span>
          </div>
        );
      })}
      {!canActivate && versions.length > 1 && <span className="text-[11px] text-sub">見積りに使う版の切り替えは管理者が行います。</span>}

      <ConfirmDialog
        open={!!target}
        title={target ? `v${target.version} を見積りに使いますか？` : ''}
        confirmLabel={target ? `v${target.version} に切り替える` : '切り替える'}
        busy={activate.isPending}
        error={activate.isError ? `切り替えられませんでした。${describeApiError(activate.error)}` : null}
        onConfirm={confirm}
        onCancel={() => setTarget(null)}
      >
        {target && (
          <div className="flex flex-col gap-3">
            <p className="m-0">
              組織全体で、これから実行する工数見積りとダッシュボードが v{target.version} の α・誤差 σ を使います。
              すでに保存された見積りの世代の結果は変わりません。あとから別の版に戻せます。
            </p>
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="text-left text-[11px] text-sub [&>th]:pb-1 [&>th]:font-medium">
                  <th scope="col"></th>
                  <th scope="col" className="!text-right">{active ? `いま (v${active.version})` : 'いま'}</th>
                  <th scope="col" className="!text-right">切り替え後 (v{target.version})</th>
                  <th scope="col" className="!text-right">差</th>
                </tr>
              </thead>
              <tbody className="font-num tabular-nums [&_td]:py-0.5 [&_th]:py-0.5">
                <tr>
                  <th scope="row" className="text-left font-sans font-medium text-sub">α</th>
                  <td className="text-right">{active ? active.alpha.toFixed(4) : '—'}</td>
                  <td className="text-right text-text">{target.alpha.toFixed(4)}</td>
                  <td className={`text-right ${dAlpha === null ? 'text-sub' : TONE[deltaTone(dAlpha)!]}`}>{dAlpha === null ? '—' : signed(dAlpha, 4)}</td>
                </tr>
                <tr>
                  <th scope="row" className="text-left font-sans font-medium text-sub">MMRE</th>
                  <td className="text-right">{active ? mmreText(active) : '—'}</td>
                  <td className="text-right text-text">{mmreText(target)}</td>
                  <td className={`text-right ${dMmre === null ? 'text-sub' : TONE[deltaTone(dMmre)!]}`}>{dMmre === null ? '—' : `${signed(dMmre, 1)} pt`}</td>
                </tr>
              </tbody>
            </table>
            <p className="m-0 text-[12px]">
              v{target.version}: {expertLabel(target.expertMode)} の三角分布 ・ {groupText(target)} ・ 実績 {target.n} 件 ・ {shortDate(target.builtAt)} 構築
            </p>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
