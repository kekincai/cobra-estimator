// 顶栏の検索ボックス。検索そのものはコマンドパレット（⌘K / Ctrl+K、Layout に常駐）が行うので、
// ここはパレットの入口: クリック・Enter・文字入力（IME 確定後・貼り付けを含む）でパレットを開き、入力中の文字を渡す。
// フォーカスしただけでは開かない（Tab 移動で勝手にダイアログが開くと操作の文脈が変わる: WCAG 3.2.1）。
import { useState, type KeyboardEvent } from 'react';
import { openCommandPalette } from '../../ui/commandPalette';

const isMac = () => {
  if (typeof navigator === 'undefined') return true;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return /mac|iphone|ipad/i.test(nav.userAgentData?.platform ?? nav.platform ?? nav.userAgent ?? '');
};

export function SearchBox() {
  const [value, setValue] = useState('');
  const [composing, setComposing] = useState(false);
  const shortcut = isMac() ? '⌘K' : 'Ctrl K';

  const open = (q: string) => {
    openCommandPalette(q);
    setValue('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || composing) return;
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      open(value);
    }
  };

  return (
    <div className="relative inline-flex w-full max-w-[320px] min-w-0 items-center sm:w-[320px]">
      <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-weak)" strokeWidth="2.2" strokeLinecap="round" className="pointer-events-none absolute left-[13px]">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        type="search"
        aria-label="見積り・モデルを検索"
        aria-haspopup="dialog"
        aria-keyshortcuts={isMac() ? 'Meta+K' : 'Control+K'}
        placeholder="見積り、モデル、プロジェクトを検索"
        value={value}
        onClick={() => open(value)}
        onKeyDown={onKeyDown}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={(e) => {
          setComposing(false);
          const q = e.currentTarget.value;
          if (q.trim()) open(q);
        }}
        onChange={(e) => {
          const q = e.target.value;
          if (composing || (e.nativeEvent as InputEvent).isComposing) {
            setValue(q);
            return;
          }
          if (q.trim()) open(q);
          else setValue(q);
        }}
        className="dash-search box-border min-h-10 w-full min-w-0 text-ellipsis rounded-[10px] border border-line bg-card pr-[60px] pl-9 font-sans text-[13px] text-text"
      />
      <kbd aria-hidden="true" className="n pointer-events-none absolute right-2.5 rounded-[5px] border border-muted px-[5px] py-px font-sans text-[11px] font-medium tracking-normal text-sub">
        {shortcut}
      </kbd>
    </div>
  );
}
