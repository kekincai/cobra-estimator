// 変動要因系の 3 画面で共用する「読み込み中 / 読み込めない」表示。
import { describeApiError } from '../../ui/apiError';

export function LoadState({ isLoading, error, refetch }: { isLoading: boolean; error: unknown; refetch: () => void }) {
  if (isLoading) {
    return (
      <div role="status" className="px-4 py-8 text-[13px] text-sub sm:px-8">
        読み込み中…
      </div>
    );
  }
  return (
    <div role="alert" className="flex flex-col items-start gap-3 px-4 py-8 text-[13px] sm:px-8">
      <span className="text-coral-soft">モデルを読み込めませんでした。{describeApiError(error)}</span>
      <button
        type="button"
        onClick={refetch}
        className="btn inline-flex min-h-10 cursor-pointer items-center rounded-[10px] border border-muted bg-transparent px-4 text-[13px] font-medium text-text"
      >
        再試行
      </button>
    </div>
  );
}
