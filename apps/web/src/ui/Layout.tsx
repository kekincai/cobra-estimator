import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useEstimates, useMe } from '../data/api';
import { openCommandPalette } from './commandPalette';
import { CommandPalette } from './CommandPaletteDialog';
import { PageFallback, useScreenId } from './RouteShell';

const I = ({ d }: { d: ReactNode }) => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);

const icons = {
  dash: <I d={<><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="5" rx="2" /><rect x="13" y="11" width="8" height="10" rx="2" /><rect x="3" y="14" width="8" height="7" rx="2" /></>} />,
  factors: <I d={<path d="M4 6h16M4 12h10M4 18h6" />} />,
  projects: <I d={<><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>} />,
  build: <I d={<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />} />,
  transfer: <I d={<path d="M12 3v12M7 10l5 5 5-5M4 21h16" />} />,
  estimate: <I d={<><rect x="4" y="2" width="16" height="20" rx="3" /><path d="M8 7h8M8 12h3M13 12h3M8 17h3M13 17h3" /></>} />,
  risk: <I d={<><path d="M12 3l9 17H3z" /><path d="M12 10v4M12 17.5h.01" /></>} />,
  report: <I d={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8" /></>} />,
  users: <I d={<><circle cx="9" cy="8" r="4" /><path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7M16 4.1a4 4 0 0 1 0 7.8M22 21c0-3-1.8-5.6-4.5-6.6" /></>} />,
  guide: <I d={<><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" /></>} />,
  menu: <I d={<path d="M4 6h16M4 12h16M4 18h16" />} />,
  close: <I d={<path d="M6 6l12 12M18 6L6 18" />} />,
  search: <I d={<><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>} />,
};

/** ⌘K（Mac）/ Ctrl K（その他）の表示 */
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const SHORTCUT = IS_MAC ? '⌘K' : 'Ctrl K';

/** 現在の見積り（MVP では seed の 1 件） */
export const CURRENT_ESTIMATE_ID = 'portal';

/** この幅以上ではサイドバーを常に出す（未満は上部バー + 引き出し） */
const WIDE = '(min-width: 1024px)';
const NAV_ID = 'app-nav';

const navCls = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav on' : 'nav');

/**
 * サイドバーの見積り系リンクの行き先。
 * 見積り画面にいるときはその見積り・選択中の世代（?gen=）を保ち、それ以外はダッシュボードと同じ「最近更新した見積り」へ。
 */
export function estimateNavTarget(pathname: string, search: string, recentId: string | undefined) {
  const m = /^\/estimate\/([^/]+)/.exec(pathname);
  const id = m ? decodeURIComponent(m[1]!) : (recentId ?? CURRENT_ESTIMATE_ID);
  const gen = m ? new URLSearchParams(search).get('gen') : null;
  const q = gen ? `?gen=${encodeURIComponent(gen)}` : '';
  const base = `/estimate/${encodeURIComponent(id)}`;
  return { estimate: `${base}${q}`, risk: `${base}/risk${q}`, report: `${base}/report${q}` };
}

/** 変動要因の配下（関係図・新規作成）でも「変動要因」を選択中にする */
export const isFactorsArea = (pathname: string) => pathname.startsWith('/model/factors') || pathname.startsWith('/model/relations');
const Section = ({ children }: { children: ReactNode }) => (
  <span className="px-[14px] pt-4 pb-1.5 text-[11px] tracking-[0.06em] text-weak">{children}</span>
);

const ROLE_LABEL = { admin: 'モデル管理者', estimator: '見積り担当', pmo: 'PMO' } as const;

const Logo = ({ size = 30 }: { size?: number }) => (
  <span className="inline-flex shrink-0 items-center justify-center rounded-[9px] bg-accent text-bg" style={{ width: size, height: size }}>
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20L12 4l8 16H4z" /></svg>
  </span>
);

/** 狭い画面での引き出しの開閉（Esc・遮罩・画面遷移・広い画面への切替で閉じる） */
function useDrawer() {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) requestAnimationFrame(() => toggleRef.current?.focus());
  }, []);

  // 画面遷移で閉じる（フォーカスは RouteShell が新しい画面へ移す）
  useEffect(() => setOpen(false), [pathname]);

  // 広い画面に切り替わったら閉じる（inert が残らないように）
  useEffect(() => {
    const mq = matchMedia(WIDE);
    const onChange = () => mq.matches && setOpen(false);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // 開いたら引き出しの中へフォーカス。Esc で閉じてボタンへ戻す
  useEffect(() => {
    if (!open) return;
    const nav = navRef.current;
    (nav?.querySelector<HTMLElement>('a[aria-current="page"]') ?? nav?.querySelector<HTMLElement>('a'))?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  return { open, setOpen, close, toggleRef, navRef };
}

export function Layout() {
  const me = useMe();
  const user = me.data?.user;
  const initials = user?.name.split(/[\s.]+/).filter(Boolean).map((s) => s[0]).join('').slice(0, 2).toUpperCase() ?? '–';
  const screen = useScreenId();
  const { open, setOpen, close, toggleRef, navRef } = useDrawer();
  const { pathname, search } = useLocation();
  const estimates = useEstimates();
  const est = estimateNavTarget(pathname, search, estimates.data?.[0]?.id);

  return (
    <div className="min-h-screen bg-bg text-text lg:flex lg:items-stretch">
      <a
        inert={open}
        href="#main"
        className="sr-only z-[60] rounded-[10px] bg-accent px-4 py-2.5 text-[13px] font-bold text-bg no-underline focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        onClick={(e) => {
          e.preventDefault();
          const main = document.getElementById('main');
          main?.focus();
          main?.scrollIntoView({ block: 'start' });
        }}
      >
        メインへスキップ
      </a>

      {/* 狭い画面の上部バー（引き出しを開いている間は背面を操作不可にする） */}
      <header inert={open} className="sticky top-0 z-30 flex h-[52px] items-center gap-2 border-b border-nav-line bg-bg px-2 lg:hidden print:hidden">
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-controls={NAV_ID}
          aria-label="メニューを開く"
          onClick={() => setOpen(true)}
          className="inline-flex size-10 cursor-pointer items-center justify-center rounded-[10px] border-0 bg-transparent text-sub hover:bg-card-2 hover:text-text"
        >
          {icons.menu}
        </button>
        <Link to="/" className="flex items-center gap-2 text-text no-underline">
          <Logo size={26} />
          <span className="n text-[16px]">Estima</span>
        </Link>
        <button
          type="button"
          aria-label="検索"
          onClick={() => openCommandPalette()}
          className="ml-auto inline-flex size-10 cursor-pointer items-center justify-center rounded-[10px] border-0 bg-transparent text-sub hover:bg-card-2 hover:text-text"
        >
          {icons.search}
        </button>
      </header>

      {open && <div aria-hidden="true" onClick={() => close(true)} className="fixed inset-0 z-40 bg-bg/70 lg:hidden" />}

      <nav
        ref={navRef}
        id={NAV_ID}
        aria-label="メイン"
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(280px,86vw)] flex-col gap-1 overflow-y-auto overscroll-contain border-r border-nav-line bg-bg px-[14px] py-[22px] transition-[translate,visibility] duration-250 ease-out-rise print:hidden lg:visible lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-[232px] lg:shrink-0 lg:translate-x-0 lg:transition-none ${
          open ? 'visible translate-x-0' : 'invisible -translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <Link to="/" className="flex items-center gap-2.5 px-2.5 pt-1 pb-[22px] text-text no-underline">
            <Logo />
            <span className="n text-[18px]">Estima</span>
          </Link>
          <button
            type="button"
            aria-label="メニューを閉じる"
            onClick={() => close(true)}
            className="mb-[18px] inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border-0 bg-transparent text-sub hover:bg-card-2 hover:text-text lg:hidden"
          >
            {icons.close}
          </button>
        </div>
        {/* 広い画面: どの画面からでもコマンドパレットを開ける入口（狭い画面は上部バーの虫眼鏡） */}
        <button
          type="button"
          aria-label="検索"
          aria-keyshortcuts={IS_MAC ? 'Meta+K' : 'Control+K'}
          onClick={() => openCommandPalette()}
          className="mb-2 hidden min-h-10 cursor-pointer items-center gap-2.5 rounded-[12px] border border-line bg-card px-3 text-left text-[13px] text-sub hover:border-line-strong hover:text-text lg:flex"
        >
          {icons.search}
          <span className="grow">検索</span>
          <kbd className="rounded-[6px] border border-line px-1.5 py-px font-num text-[11px] text-weak">{SHORTCUT}</kbd>
        </button>
        <NavLink to="/" end className={navCls}>{icons.dash}ダッシュボード</NavLink>
        <Section>MODEL</Section>
        <NavLink to="/model/factors" className={() => navCls({ isActive: isFactorsArea(pathname) })}>{icons.factors}変動要因</NavLink>
        <NavLink to="/model/projects" className={navCls}>{icons.projects}実績データ</NavLink>
        <NavLink to="/model/build" className={navCls}>{icons.build}モデル構築</NavLink>
        <NavLink to="/transfer" className={navCls}>{icons.transfer}取り込み / 書き出し</NavLink>
        <Section>ESTIMATE</Section>
        <NavLink to={est.estimate} end className={navCls}>{icons.estimate}工数見積り</NavLink>
        <NavLink to={est.risk} className={navCls}>{icons.risk}リスク</NavLink>
        <NavLink to={est.report} className={navCls}>{icons.report}レポート</NavLink>
        <div className="min-h-4 grow" />
        {user?.role === 'admin' && <NavLink to="/admin/users" className={navCls}>{icons.users}利用者</NavLink>}
        <NavLink to="/guide" className={navCls}>{icons.guide}CoBRA法の解説</NavLink>
        <div className="flex items-center gap-2.5 px-[14px] pt-3 pb-1">
          <span className="inline-flex size-[30px] shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold">{initials}</span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[12px] font-medium">{user?.name ?? 'ゲスト'}</span>
            <span className="text-[11px] text-weak">{user ? ROLE_LABEL[user.role] : '読み取り専用'}</span>
          </span>
        </div>
      </nav>

      <main id="main" tabIndex={-1} inert={open} data-screen={screen} className="min-w-0 flex-1 outline-none">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </main>

      <CommandPalette />
    </div>
  );
}
