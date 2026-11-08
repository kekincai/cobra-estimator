// API エラーを画面に出す日本語メッセージへ変換する。英語の生メッセージ（Internal Server Error など）は出さない。
import { ApiError } from '../data/api';

const hasJapanese = (s: string) => /[぀-ヿ㐀-鿿]/.test(s);

export function describeApiError(e: unknown, fallback = '処理に失敗しました。時間をおいて再試行してください。'): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return 'ログインの有効期限が切れました。ページを再読み込みしてログインし直してください。';
    if (e.status === 403) return 'この操作を行う権限がありません。管理者に権限の付与を依頼してください。';
    if (e.status === 404) return '対象が見つかりません。削除された可能性があります。';
    if (e.status >= 500) return 'サーバーでエラーが発生しました。時間をおいて再試行してください。';
    // 400 / 409 などはサーバーの日本語メッセージをそのまま使う
    if (e.message && hasJapanese(e.message)) return e.message;
    return fallback;
  }
  if (e instanceof TypeError) return 'サーバーに接続できませんでした。通信状況を確認して再試行してください。';
  if (e instanceof Error && e.message && hasJapanese(e.message)) return e.message;
  return fallback;
}
