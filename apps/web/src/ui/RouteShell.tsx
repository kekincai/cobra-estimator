// すべての画面（Layout の内側と、Layout 外のレポート）を包む根。
// - 画面ごとの document.title（「<画面名> | Estima」）
// - 画面が変わったら主内容（h1、なければ <main>）へフォーカスを移し、先頭へスクロールし、aria-live で画面名を読み上げる
// - 画面のコード（React.lazy）を読み込む間の Suspense 境界
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Outlet, useLocation, useMatches, useParams } from 'react-router';
import { useEstimate } from '../data/api';

/** router.tsx の各ルートの handle */
export interface RouteHandle {
  /** 画面名（サイドバーの日本語名。下位画面は「要因を追加 — 変動要因」のように親を添える） */
  title: string | ((params: Record<string, string | undefined>) => string);
  /** 見積り系の画面: 見積り名をタイトルに添える */
  estimate?: boolean;
  /** <main data-screen> に入れる識別子（画面別の CSS 用。例: 仪表板だけ tile を持ち上げる） */
  screen?: string;
}

const APP = 'Estima';

function useRouteHandle(): RouteHandle | undefined {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i--) {
    const h = matches[i]!.handle as RouteHandle | undefined;
    if (h && h.title) return h;
  }
  return undefined;
}

/** 今の画面の識別子（Layout が <main data-screen> に使う） */
export function useScreenId(): string | undefined {
  return useRouteHandle()?.screen;
}

/** 今の画面のタイトル（見積り名は読み込めたら添える） */
function useRouteTitle(): string {
  const handle = useRouteHandle();
  const params = useParams();
  const est = useEstimate(handle?.estimate ? params.id : undefined);
  if (!handle) return APP;
  const name = typeof handle.title === 'function' ? handle.title(params) : handle.title;
  const estName = handle.estimate ? est.data?.name : undefined;
  return `${estName ? `${name} — ${estName}` : name} | ${APP}`;
}

/** 画面の読み込み中に出す、動かない占位（外枠は出したまま） */
export function PageFallback({ paper }: { paper?: boolean }) {
  return (
    <div role="status" aria-busy="true" className={`min-h-[60vh] px-8 pt-8 text-[13px] ${paper ? 'bg-paper text-ink-sub' : 'text-sub'}`}>
      <span className="fade-in-late">読み込み中…</span>
    </div>
  );
}

/** 主内容（h1、なければ <main>）へフォーカス。移せたら true（引き出しを閉じた直後は inert が残っていることがある） */
function focusMainContent(allowMain: boolean): boolean {
  const main = document.getElementById('main');
  const scope: ParentNode = main ?? document;
  const target = scope.querySelector<HTMLElement>('h1') ?? (allowMain ? main : null);
  if (!target || target.closest('[inert]')) return false;
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
  return document.activeElement === target;
}

function RouteAnnouncer({ title }: { title: string }) {
  const { pathname } = useLocation();
  const prev = useRef(pathname);
  const [message, setMessage] = useState('');
  const latest = useRef(title);
  latest.current = title;

  useEffect(() => {
    document.title = title;
  }, [title]);

  // パスが変わったときだけ（?gen= や #節 の変更では動かさない）。初回表示ではフォーカスを奪わない
  useEffect(() => {
    // StrictMode の二重実行や初回表示では同じパスなので何もしない
    if (prev.current === pathname) return;
    prev.current = pathname;
    window.scrollTo(0, 0);
    // 新しい画面の描画後に移す（h1 がまだ無い・inert が残っているときは数フレーム待つ）
    let raf = 0;
    let tries = 0;
    const tick = () => {
      if (!focusMainContent(tries >= 10) && ++tries < 30) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(() => {
      setMessage(`${latest.current.replace(` | ${APP}`, '')} を表示しました`);
      tick();
    });
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}

export function RouteShell({ children }: { children?: ReactNode }) {
  const title = useRouteTitle();
  return (
    <>
      <RouteAnnouncer title={title} />
      <Suspense fallback={<PageFallback />}>{children ?? <Outlet />}</Suspense>
    </>
  );
}
