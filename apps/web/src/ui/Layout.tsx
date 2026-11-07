import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useMe } from '../data/api';

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
  guide: <I d={<><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" /></>} />,
};

/** 現在の見積り（MVP では seed の 1 件） */
export const CURRENT_ESTIMATE_ID = 'portal';

const navCls = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav on' : 'nav');
const Section = ({ children }: { children: ReactNode }) => (
  <span className="px-[14px] pt-4 pb-1.5 text-[11px] tracking-[0.06em] text-weak">{children}</span>
);

const ROLE_LABEL = { admin: 'モデル管理者', estimator: '見積り担当', pmo: 'PMO' } as const;

export function Layout() {
  const me = useMe();
  const user = me.data?.user;
  const initials = user?.name.split(/[\s.]+/).filter(Boolean).map((s) => s[0]).join('').slice(0, 2).toUpperCase() ?? '–';
  return (
    <div className="flex min-h-screen items-stretch bg-bg text-text">
      <nav aria-label="メイン" className="sticky top-0 flex h-screen w-[232px] shrink-0 flex-col gap-1 border-r border-nav-line px-[14px] py-[22px] print:hidden">
        <NavLink to="/" className="flex items-center gap-2.5 px-2.5 pt-1 pb-[22px] text-text no-underline">
          <span className="inline-flex size-[30px] items-center justify-center rounded-[9px] bg-accent">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0B0D12" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20L12 4l8 16H4z" /></svg>
          </span>
          <span className="n text-[18px]">Estima</span>
        </NavLink>
        <NavLink to="/" end className={navCls}>{icons.dash}ダッシュボード</NavLink>
        <Section>MODEL</Section>
        <NavLink to="/model/factors" className={navCls}>{icons.factors}変動要因</NavLink>
        <NavLink to="/model/projects" className={navCls}>{icons.projects}実績データ</NavLink>
        <NavLink to="/model/build" className={navCls}>{icons.build}モデル構築</NavLink>
        <NavLink to="/transfer" className={navCls}>{icons.transfer}取り込み / 書き出し</NavLink>
        <Section>ESTIMATE</Section>
        <NavLink to={`/estimate/${CURRENT_ESTIMATE_ID}`} end className={navCls}>{icons.estimate}工数見積り</NavLink>
        <NavLink to={`/estimate/${CURRENT_ESTIMATE_ID}/risk`} className={navCls}>{icons.risk}リスク</NavLink>
        <NavLink to={`/estimate/${CURRENT_ESTIMATE_ID}/report`} className={navCls}>{icons.report}レポート</NavLink>
        <div className="grow" />
        <NavLink to="/guide" className={navCls}>{icons.guide}CoBRA法の解説</NavLink>
        <div className="flex items-center gap-2.5 px-[14px] pt-3 pb-1">
          <span className="inline-flex size-[30px] items-center justify-center rounded-full bg-muted text-[11px] font-bold">{initials}</span>
          <span className="flex flex-col">
            <span className="text-[12px] font-medium">{user?.name ?? 'ゲスト'}</span>
            <span className="text-[11px] text-weak">{user ? ROLE_LABEL[user.role] : '読み取り専用'}</span>
          </span>
        </div>
      </nav>
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
