// 取り込み / 書き出し画面の小さな部品（design/Transfer.dc.html のスタイル）。
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ImportFailure } from './errors';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Tile({ delay = 0, className, children }: { delay?: number; className?: string; children: ReactNode }) {
  return (
    <div className={cx('tile px-[22px] py-5', className)} style={delay ? { animationDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}

export function TileHead({ title, aside }: { title: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <span className="min-w-0 text-[14px] font-bold">{title}</span>
      {aside != null && <span className="min-w-0 text-right text-[11px] text-sub">{aside}</span>}
    </div>
  );
}

export function Tag({ text }: { text: string }) {
  if (!text) return null;
  const tone = text === '機密' ? 'bg-coral/10 text-coral-soft' : text.startsWith('同名') ? 'bg-warn/10 text-warn' : 'bg-raised text-sub';
  return <span className={cx('ml-3 inline-block rounded-full px-2 py-[3px] text-[11px] whitespace-nowrap', tone)}>{text}</span>;
}

/** チェック付きの行ボタン（内容の選択・書き出す内容） */
export function CheckRow(p: { on: boolean; onToggle: () => void; name: string; desc: ReactNode; count?: number; tag?: string; disabled?: boolean }) {
  const on = p.on && !p.disabled;
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={p.disabled}
      onClick={p.onToggle}
      className={cx(
        'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-text transition-[background,border-color] duration-200',
        on ? 'border-line-strong bg-card-2' : 'border-line bg-transparent hover:bg-card-2',
        p.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
      )}
    >
      <span
        aria-hidden="true"
        className={cx('inline-flex size-5 shrink-0 items-center justify-center rounded-md text-[12px] font-bold text-bg', on ? 'bg-accent' : 'border border-line-strong')}
      >
        {on ? '✓' : ''}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 text-left">
        <span className="text-[13px] font-bold">{p.name}</span>
        <span className="text-[11px] text-sub">{p.desc}</span>
      </span>
      {p.count != null && <span className="n ml-auto shrink-0 text-[16px]">{p.count}</span>}
      {p.tag ? <Tag text={p.tag} /> : p.count == null && <span className="ml-auto" />}
    </button>
  );
}

/** 丸いセグメントボタン（単位・衝突の解決） */
export function Seg<K extends string>(p: { options: { key: K; label: string; danger?: boolean }[]; value: K; onChange: (k: K) => void; label: string; className?: string }) {
  return (
    <div role="group" aria-label={p.label} className={cx('inline-flex max-w-full flex-wrap gap-0.5 rounded-[17px] p-[3px]', p.className ?? 'bg-bg')}>
      {p.options.map((o) => {
        const on = o.key === p.value;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            onClick={() => p.onChange(o.key)}
            className={cx(
              'btn min-h-7 cursor-pointer rounded-full border-0 px-2.5 text-[11px] font-bold whitespace-nowrap',
              on ? (o.danger ? 'bg-coral text-bg' : 'bg-accent text-bg') : 'bg-transparent text-sub hover:text-text',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Notice({ tone, children }: { tone: 'warn' | 'coral'; children: ReactNode }) {
  const box = tone === 'warn' ? 'bg-warn/10 border-warn/30 text-warn' : 'bg-coral/10 border-coral/30 text-coral-soft';
  const dot = tone === 'warn' ? 'bg-warn' : 'bg-coral';
  return (
    <div className={cx('flex items-start gap-2.5 rounded-xl border px-3.5 py-3', box)}>
      <span aria-hidden="true" className={cx('mt-[5px] size-2 shrink-0 rounded-full', dot)} />
      <span className="text-[12px] leading-[1.6]">{children}</span>
    </div>
  );
}

export function KV({ k, children }: { k: ReactNode; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line py-2">
      <span className="min-w-0 text-sub">{k}</span>
      <span className="min-w-0 text-right break-words">{children}</span>
    </div>
  );
}

export const primaryBtn = 'btn min-h-[46px] cursor-pointer rounded-xl border-0 bg-accent px-4 text-[14px] font-bold text-bg disabled:cursor-not-allowed disabled:bg-raised disabled:text-weak';
export const ghostBtn = 'btn inline-flex min-h-10 cursor-pointer items-center justify-center rounded-xl border border-muted bg-transparent px-3 text-[13px] text-sub no-underline hover:text-text';

/** ファイル名の行（JSON / XML / CSV のバッジ付き） */
export function FileHead(p: { badge: string; badgeClass?: string; name: string; meta: ReactNode; onReset?: () => void; children?: ReactNode }) {
  return (
    <div className="tile flex flex-wrap items-center gap-3.5 px-5 py-4">
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-line bg-bg">
        <span className={cx('n text-[11px]', p.badgeClass ?? 'text-accent')}>{p.badge}</span>
      </span>
      <div className="flex min-w-0 flex-[1_1_12rem] flex-col gap-0.5">
        <span className="truncate text-[14px] font-bold">{p.name}</span>
        <span className="text-[11px] text-sub">{p.meta}</span>
      </div>
      {p.children}
      {p.onReset && (
        <button type="button" onClick={p.onReset} className="btn ml-auto min-h-8 cursor-pointer rounded-[10px] border border-muted bg-transparent px-3 text-[12px] text-sub hover:text-text">
          別のファイル
        </button>
      )}
    </div>
  );
}

/** ドロップ領域（クリックでファイル選択）。キーボードでも Enter / Space で選べる。 */
export function DropZone(p: { accept: string; onFile: (f: File) => void; title: string; sub: ReactNode; note: string; style?: CSSProperties; busy?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-busy={p.busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files[0];
          if (f) p.onFile(f);
        }}
        style={p.style}
        className={cx(
          'tile flex min-h-[320px] w-full cursor-pointer flex-col items-center justify-center gap-3.5 border-dashed px-6 py-8 text-center text-text transition-[border-color,background] duration-[250ms] @3xl:min-h-[420px]',
          over ? 'border-accent bg-accent/5' : 'border-line-strong bg-bg hover:border-accent hover:bg-accent/5',
        )}
      >
        <span className="inline-flex size-16 items-center justify-center rounded-[20px] border border-line bg-card">
          <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
          </svg>
        </span>
        <span className="text-[16px] font-bold">{p.busy ? '読み込んでいます…' : p.title}</span>
        <span className="text-[12px] text-sub">{p.sub}</span>
        <span className="mt-2.5 text-[11px] text-sub">{p.note}</span>
      </button>
      <input
        ref={input}
        type="file"
        accept={p.accept}
        className="hidden"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) p.onFile(f);
        }}
      />
    </>
  );
}

export const kb = (bytes: number) => (bytes / 1024).toFixed(1);
export const mmdd = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')}`;
};
export const ymd = (iso: string | null | undefined) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}` : null;
};

export const thCls = 'whitespace-nowrap border-b border-line px-2.5 py-2 text-left text-[11px] font-medium text-sub';
export const tdCls = 'border-b border-line/60 px-2.5 py-2 align-middle text-[12px]';

/** 差分の要約 1 行。2 点以上あれば展開してすべて見られる */
export function DiffList({ summary, diffs }: { summary: string; diffs: string[] }) {
  if (diffs.length <= 1) return <span className="text-[11px] break-words text-sub">{diffs[0] ?? summary}</span>;
  return (
    <details className="text-[11px] text-sub">
      <summary className="cursor-pointer break-words">
        {diffs[0]} <span className="text-accent underline">ほか {diffs.length - 1} 点を表示</span>
      </summary>
      <ul className="m-0 mt-1.5 flex list-disc flex-col gap-1 pl-4">
        {diffs.map((d, i) => (
          <li key={i} className={cx('break-words', d.startsWith('三角分布') && 'text-warn')}>
            {d}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** 読み込めなかったファイルの説明（何が・直し方・タブ違いなら行き先） */
export function WrongFileCard(p: { fileName: string; failure: ImportFailure; fallbackHint: string; switchLabel?: string; onSwitch?: () => void }) {
  return (
    <div role="alert" className="tile flex flex-col gap-2.5 border-coral/40 px-[22px] py-5">
      <TileHead title={<span className="break-all">{p.fileName} を読み込めませんでした</span>} />
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[12px] leading-[1.6] text-coral-soft">
        {p.failure.errors.map((e, i) => (
          <li key={i} className="break-words">
            {e}
          </li>
        ))}
      </ul>
      <p className="m-0 text-[12px] leading-[1.6] text-sub">
        <span className="font-bold text-text">直し方: </span>
        {p.failure.hint ?? p.fallbackHint}
      </p>
      {p.onSwitch && p.switchLabel && (
        <button type="button" onClick={p.onSwitch} className={cx(ghostBtn, 'self-start text-text')}>
          {p.switchLabel}
        </button>
      )}
    </div>
  );
}
