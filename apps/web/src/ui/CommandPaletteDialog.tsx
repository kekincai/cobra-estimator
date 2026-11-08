// コマンドパレット（⌘K / Ctrl+K、または openCommandPalette()）。Layout に 1 つだけ置く。
// 画面・見積り・変動要因・実績データを横断して探し、Enter / クリックで開く。
// ネイティブ <dialog> の showModal() でフォーカス閉じ込め・背面の不活性化・Esc をブラウザに任せる。
// 見積り・要因・実績は開いたときにだけ取得する（本体 PaletteBody が開いている間だけマウントされる）。
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useEstimates, useFactors, useMe, useProjects } from '../data/api';
import { describeApiError } from './apiError';
import { COMMAND_PALETTE_EVENT } from './commandPalette';
import { estimateItems, factorItems, flattenSections, projectItems, screenItems, searchPalette, type PaletteItem } from './commandPaletteSearch';
import { CURRENT_ESTIMATE_ID } from './Layout';

const PER_GROUP = 6;

export function CommandPalette() {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState('');
  // 開くたびに本体を作り直して、検索語・選択位置を初期化する
  const [session, setSession] = useState(0);
  const returnFocus = useRef<HTMLElement | null>(null);
  // 閉じてフォーカスを戻す間は開く合図を無視する（検索ボックスの onFocus で開く実装でも再度開かないように）
  const restoring = useRef(false);

  const show = useCallback((query: string) => {
    if (restoring.current) return;
    const d = ref.current;
    if (!d?.open) {
      const a = document.activeElement;
      returnFocus.current = a instanceof HTMLElement && a !== document.body ? a : null;
    }
    setInitialQuery(query);
    setSession((n) => n + 1);
    setOpen(true);
    // 本体の描画より先に開いておく（本体の effect で入力欄へフォーカスを移せるように）
    if (d && !d.open) d.showModal();
  }, []);

  const close = useCallback((restoreFocus = true) => {
    const d = ref.current;
    restoring.current = true;
    try {
      if (d?.open) d.close();
      const el = returnFocus.current;
      if (restoreFocus && el?.isConnected) el.focus({ preventScroll: true });
    } finally {
      restoring.current = false;
      returnFocus.current = null;
    }
    setOpen(false);
  }, []);

  // 合図（openCommandPalette）と ⌘K / Ctrl+K。入力欄の中でも効くが、IME 変換中のキーは奪わない。
  useEffect(() => {
    const onOpen = (e: Event) => {
      const q = (e as CustomEvent<{ query?: string } | undefined>).detail?.query;
      show(typeof q === 'string' ? q : '');
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'k') return;
      e.preventDefault();
      e.stopPropagation();
      if (ref.current?.open) close();
      else show('');
    };
    window.addEventListener(COMMAND_PALETTE_EVENT, onOpen);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener(COMMAND_PALETTE_EVENT, onOpen);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [show, close]);

  return (
    <dialog
      ref={ref}
      aria-label="検索して移動"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        // 背景（dialog 自身）をクリックしたら閉じる
        if (e.target === e.currentTarget) close();
      }}
      className="mx-auto mt-3 mb-auto max-h-none w-[640px] max-w-[calc(100vw-24px)] overflow-visible border-0 bg-transparent p-0 text-text backdrop:bg-bg/75 backdrop:backdrop-blur-[2px] sm:mt-[12vh]"
    >
      {open && <PaletteBody key={session} initialQuery={initialQuery} onClose={close} />}
    </dialog>
  );
}

function PaletteBody({ initialQuery, onClose }: { initialQuery: string; onClose: (restoreFocus?: boolean) => void }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const me = useMe();
  const estimates = useEstimates();
  const factors = useFactors();
  const projects = useProjects();

  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optId = (i: number) => `${baseId}-opt-${i}`;

  // 見積り系の画面は、いま開いている見積りがあればそれを、なければ既定の見積りを開く
  const estimateId = estimateIdFromPath(pathname) ?? CURRENT_ESTIMATE_ID;
  const isAdmin = me.data?.user?.role === 'admin';

  const items = useMemo<PaletteItem[]>(
    () => [
      ...screenItems({ estimateId, isAdmin }),
      ...estimateItems(estimates.data ?? []),
      ...factorItems(factors.data ?? []),
      ...projectItems(projects.data ?? []),
    ],
    [estimateId, isAdmin, estimates.data, factors.data, projects.data],
  );
  const sections = useMemo(() => searchPalette(items, query, { limit: PER_GROUP }), [items, query]);
  const flat = useMemo(() => flattenSections(sections), [sections]);
  const cur = Math.min(active, Math.max(0, flat.length - 1));

  const sources = [
    { name: '見積り', q: estimates },
    { name: '変動要因', q: factors },
    { name: '実績データ', q: projects },
  ];
  const loading = sources.some(({ q }) => q.isPending && q.fetchStatus !== 'idle');
  const failed = sources.filter(({ q }) => q.isError);
  const searching = query.trim() !== '';

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    // 合図で渡された検索語は末尾から続けて打てるように
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  // 選択中の候補を見える位置へ
  useEffect(() => {
    if (!flat.length) return;
    document.getElementById(`${baseId}-opt-${cur}`)?.scrollIntoView({ block: 'nearest' });
  }, [baseId, cur, flat.length]);

  const go = (item: PaletteItem | undefined) => {
    if (!item) return;
    onClose(false);
    navigate(item.to);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const n = flat.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!n) return;
      setActive((cur + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
    } else if (e.key === 'Home' && e.ctrlKey) {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End' && e.ctrlKey) {
      e.preventDefault();
      setActive(Math.max(0, n - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(flat[cur]);
    }
  };

  const retry = () => failed.forEach(({ q }) => void q.refetch());
  const count = flat.length;
  let idx = -1;

  return (
    <div
      className="flex max-h-[calc(100dvh-24px)] flex-col overflow-hidden rounded-[16px] border border-muted bg-card shadow-[0_30px_80px_rgba(0,0,0,.6)] sm:max-h-[min(600px,76dvh)]"
      style={{ animation: 'pop .35s var(--ease-out-rise) backwards' }}
    >
      <div className="flex items-center gap-2.5 border-b border-line px-4 transition-[border-color] focus-within:border-accent">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="shrink-0 text-sub">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="画面・見積り・要因・実績を検索"
          aria-expanded={count > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={count > 0 ? optId(cur) : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder="画面・見積り・要因・実績を検索"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="min-h-[52px] min-w-0 flex-1 border-0 bg-transparent font-sans text-[15px] text-text outline-none! placeholder:text-weak"
        />
        <button
          type="button"
          aria-label="閉じる"
          onClick={() => onClose()}
          className="btn inline-flex min-h-7 shrink-0 cursor-pointer items-center rounded-[6px] border border-muted bg-transparent px-2 text-[11px] font-medium text-sub"
        >
          Esc
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
        <div id={listId} role="listbox" aria-label="検索結果">
          {sections.map((s) => {
            const hid = `${baseId}-g-${s.group}`;
            return (
              <div key={s.group} role="group" aria-labelledby={hid} className="pb-1.5">
                <div id={hid} role="presentation" className="flex items-baseline justify-between px-2.5 pt-2 pb-1 text-[11px] tracking-[0.06em] text-sub">
                  <span>{s.label}</span>
                  {s.total > s.items.length && (
                    <span className="tracking-normal">
                      {s.total} 件中 {s.items.length} 件 ・ 語を足して絞り込めます
                    </span>
                  )}
                </div>
                {s.items.map((item) => {
                  idx += 1;
                  const i = idx;
                  const on = i === cur;
                  return (
                    <div
                      key={item.key}
                      id={optId(i)}
                      role="option"
                      aria-selected={on}
                      onMouseMove={() => i !== cur && setActive(i)}
                      onClick={() => go(item)}
                      className={`relative flex min-h-10 cursor-pointer items-center gap-3 rounded-[10px] px-2.5 py-1.5 ${on ? 'bg-raised' : ''}`}
                    >
                      {on && <span aria-hidden="true" className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-accent" />}
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                        <span className={`min-w-0 truncate text-[13.5px] ${on ? 'font-bold text-text' : 'text-text'}`}>{item.label}</span>
                        {item.sub && <span className="shrink-0 truncate text-[11.5px] text-sub sm:ml-auto">{item.sub}</span>}
                      </span>
                      <span aria-hidden="true" className={`hidden shrink-0 text-[12px] text-accent sm:inline ${on ? '' : 'invisible'}`}>
                        ↵
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {searching && count === 0 && !loading && failed.length === 0 && (
          <p className="m-0 px-3 py-6 text-center text-[13px] text-sub">「{query.trim()}」に一致する画面・見積り・要因・実績はありません。</p>
        )}
        {loading && (
          <p role="status" className="m-0 flex items-center gap-2 px-3 py-3 text-[12px] text-sub">
            <span aria-hidden="true" className="size-3 rounded-full border-2 border-muted border-t-accent" style={{ animation: 'spin .8s linear infinite' }} />
            見積り・変動要因・実績データを読み込み中…
          </p>
        )}
        {failed.length > 0 && (
          <div role="alert" className="mx-1 my-2 flex flex-wrap items-center gap-2.5 rounded-[10px] border border-coral-line bg-coral-bg px-3 py-2.5">
            <span className="min-w-0 flex-1 text-[12px] leading-[1.6] text-coral-ink">
              {failed.map((f) => f.name).join('・')}
              を読み込めませんでした。{describeApiError(failed[0]!.q.error)}
            </span>
            <button
              type="button"
              onClick={retry}
              className="btn inline-flex min-h-8 cursor-pointer items-center rounded-[8px] border border-coral-btn-line bg-transparent px-3 text-[12px] font-bold text-coral-ink"
            >
              再試行
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-[11px] text-weak">
        <span>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> 移動
        </span>
        <span>
          <Kbd>Enter</Kbd> 開く
        </span>
        <span>
          <Kbd>Esc</Kbd> 閉じる
        </span>
        <span className="grow" />
        <span aria-live="polite" className="text-sub">{searching ? `${count} 件` : '画面の一覧'}</span>
      </div>
    </div>
  );
}

function estimateIdFromPath(pathname: string): string | null {
  const raw = /^\/estimate\/([^/]+)/.exec(pathname)?.[1];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

const Kbd = ({ children }: { children: string }) => (
  <kbd className="mr-1 inline-flex min-w-[18px] items-center justify-center rounded-[4px] border border-muted px-1 font-sans text-[11px] text-sub">{children}</kbd>
);
