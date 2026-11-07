// モデルのバージョン一覧。行を押すと右側にその版の結果を表示、「採用する」で採用版を切り替える。
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ModelVersionRow } from '../../../shared/types';
import { apiSend, qk } from '../../data/api';
import { expertLabel, shortDate } from './format';

interface Props {
  versions: ModelVersionRow[];
  viewedId: string | null;
  onView: (id: string) => void;
  canActivate: boolean;
}

export function VersionList({ versions, viewedId, onView, canActivate }: Props) {
  const qc = useQueryClient();
  const activate = useMutation({
    mutationFn: (id: string) => apiSend('POST', `/model/versions/${encodeURIComponent(id)}/activate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.model }),
  });

  return (
    <div className="tile flex flex-col gap-2 px-[22px] py-5" style={{ animationDelay: '80ms' }}>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium">モデルのバージョン</span>
        <span className="text-[11px] text-weak">構築するたびに追加</span>
      </div>
      {versions.length === 0 && <span className="text-[12px] text-sub">まだ構築されていません。</span>}
      {versions.map((v) => {
        const viewed = v.id === viewedId;
        return (
          <div
            key={v.id}
            className={`grid grid-cols-[30px_minmax(0,1fr)_auto_auto] items-center gap-2.5 rounded-[10px] border px-2.5 py-2 transition-[background,border-color] hover:bg-raised ${
              v.active ? 'border-line-mid bg-raised' : viewed ? 'border-line-strong' : 'border-transparent'
            }`}
          >
            <span className={`n text-[12px] ${v.active ? 'text-accent' : 'text-weak'}`}>v{v.version}</span>
            <button
              type="button"
              onClick={() => onView(v.id)}
              aria-pressed={viewed}
              aria-label={`v${v.version} の結果を表示`}
              className="flex min-w-0 cursor-pointer flex-col items-start gap-0.5 border-0 bg-transparent p-0 text-left text-text"
            >
              <span className="max-w-full truncate text-[12px] font-medium">
                {v.expertMode.kind === 'average' ? '平均の' : `${expertLabel(v.expertMode)} の`}三角分布 ・ {v.version === 1 ? '初回' : v.groupId ? `グループ ${v.groupId}` : 'すべて'}
              </span>
              <span className="text-[11px] text-sub">
                {shortDate(v.builtAt)} ・ {v.n} 件
              </span>
            </button>
            <span className="flex flex-col items-end gap-0.5">
              <span className="n text-[14px]">{v.alpha.toFixed(4)}</span>
              <span className="text-[10px] text-sub">MMRE {v.mmre === null ? '—' : `${(v.mmre * 100).toFixed(1)}%`}</span>
            </span>
            {v.active ? (
              <span className="rounded-full bg-ok-bg px-2 py-[3px] text-[10px] font-bold whitespace-nowrap text-ok">採用中</span>
            ) : (
              <button
                type="button"
                disabled={!canActivate || activate.isPending}
                onClick={() => activate.mutate(v.id)}
                aria-label={`v${v.version} を採用する`}
                className="btn min-h-[26px] cursor-pointer rounded-full border border-muted bg-transparent px-2.5 text-[10px] whitespace-nowrap text-sub disabled:cursor-not-allowed disabled:opacity-50"
              >
                {activate.isPending && activate.variables === v.id ? '切替中…' : '採用する'}
              </button>
            )}
          </div>
        );
      })}
      {activate.isError && <span role="alert" className="text-[11px] text-coral-ink">採用版を切り替えられませんでした: {activate.error.message}</span>}
    </div>
  );
}
