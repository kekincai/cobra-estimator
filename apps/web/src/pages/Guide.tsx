// CoBRA法の解説（design/Guide.dc.html）。8 節を目次で切り替える。節は URL の #<id> と同期（features/guide/sections.ts）。
import { useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { SECTION_BODIES, SECTION_HEADINGS } from '../features/guide/SectionBodies';
import { GUIDE_FLOW_HREF, GUIDE_SECTIONS, isGuideSectionId, type GuideSectionId } from '../features/guide/sections';
import '../features/guide/guide.css';

export default function GuidePage() {
  const { hash } = useLocation();
  const navigate = useNavigate();
  const raw = decodeURIComponent(hash.replace(/^#/, ''));
  const current: GuideSectionId = isGuideSectionId(raw) ? raw : 'about';
  const index = GUIDE_SECTIONS.findIndex((s) => s.id === current);
  const sec = GUIDE_SECTIONS[index]!;
  const prev = GUIDE_SECTIONS[index - 1];
  const next = GUIDE_SECTIONS[index + 1];

  const heading = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const userNav = useRef(false);

  const go = (id: GuideSectionId) => {
    userNav.current = true;
    navigate({ hash: id }, { replace: true });
  };

  // 目次・前後ボタンで切り替えたら見出しにフォーカスし、本文の先頭が見えるようにする
  useEffect(() => {
    if (!userNav.current) return;
    userNav.current = false;
    heading.current?.focus({ preventScroll: true });
    const top = panel.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) panel.current?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [current]);

  // 他画面の「?」から #id 付きで来たときはページ先頭へ
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  const Body = SECTION_BODIES[current];
  const pager = 'btn min-h-9 cursor-pointer rounded-[10px] border border-muted bg-transparent px-3.5 font-sans text-[12px] font-bold text-text';

  return (
    <div className="flex min-w-0 flex-col gap-5 px-8 pt-7 pb-9">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] text-sub">解説 ・ 旧 Excel 版の「解説文の表示」(F-INF01) に相当</span>
          <h1 className="n m-0 text-[28px]">CoBRA 法と、このツールの使い方</h1>
          <span className="text-[13px] text-sub">数式は動かして確かめられます。各画面の「?」からも該当する節が開きます。</span>
        </div>
        <Link to={GUIDE_FLOW_HREF} className="guide-lk inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-muted bg-card px-3.5 text-[13px] font-bold text-text no-underline">
          業務フロー図を見る <span className="text-accent">↗</span>
        </Link>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav aria-label="解説の目次" className="tile flex flex-col gap-0.5 p-3 lg:sticky lg:top-6">
          {GUIDE_SECTIONS.map((s) => {
            const on = s.id === current;
            return (
              <a
                key={s.id}
                href={`#${s.id}`}
                aria-current={on ? 'true' : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  go(s.id);
                }}
                className={`guide-toc flex min-h-[42px] items-center gap-3 rounded-[10px] px-3 text-[13px] no-underline ${on ? 'bg-raised font-bold text-text' : 'font-medium text-sub'}`}
              >
                <span className={`n w-5 text-[11px] ${on ? 'text-accent' : 'text-weak'}`}>{s.no}</span>
                <span>{s.title}</span>
              </a>
            );
          })}
          <div className="mx-1 mt-2.5 mb-1 rounded-xl border border-line bg-bg px-3.5 py-3 text-[11px] leading-[1.6] text-sub">
            出典: IPA/SEC「CoBRA 法に基づく見積り支援ツール」要件定義書 v1.3 (2009) をもとに、Web 版の用語に合わせて再構成。
          </div>
        </nav>

        <div ref={panel} className="tile flex min-h-[860px] scroll-mt-6 flex-col gap-[18px] px-8 py-7" style={{ animationDelay: '80ms' }}>
          <section key={current} id={current} aria-labelledby={`guide-h-${current}`} className="guide-body">
            <span className="text-[11px] tracking-[0.08em] text-weak">
              {sec.no} ・ {sec.kicker}
            </span>
            <h2 ref={heading} id={`guide-h-${current}`} tabIndex={-1} className="n">
              {SECTION_HEADINGS[current]}
            </h2>
            <Body />
          </section>
          <div className="mt-auto flex items-center justify-between border-t border-nav-line pt-4">
            <button type="button" className={pager} style={{ visibility: prev ? 'visible' : 'hidden' }} onClick={() => prev && go(prev.id)} tabIndex={prev ? 0 : -1}>
              ← {prev?.title}
            </button>
            <span className="n text-[12px] text-weak">
              {index + 1} / {GUIDE_SECTIONS.length}
            </span>
            <button type="button" className={pager} style={{ visibility: next ? 'visible' : 'hidden' }} onClick={() => next && go(next.id)} tabIndex={next ? 0 : -1}>
              {next?.title} →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
