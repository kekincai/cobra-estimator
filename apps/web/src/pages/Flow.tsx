// 業務フロー（design/Flow.dc.html）。6 段階をクリック / 自動再生で辿り、各段の詳細を下に出す。
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { FlowDiagram } from '../features/guide/FlowDiagram';
import { AUTOPLAY_MS, FLOW_STAGES } from '../features/guide/flowStages';
import '../features/guide/flow.css';
import '../features/guide/guide.css';

export default function FlowPage() {
  const [active, setActive] = useState(3);
  const [playing, setPlaying] = useState(false);
  const [tick, setTick] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);

  const toggle = () => {
    if (playing) {
      stop();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    setActive(0);
    setTick((t) => t + 1);
    stop();
    timer.current = setInterval(() => {
      setActive((a) => (a + 1) % FLOW_STAGES.length);
      setTick((t) => t + 1);
    }, AUTOPLAY_MS);
  };

  const pick = (i: number) => {
    stop();
    setPlaying(false);
    setActive(i);
    setTick((t) => t + 1);
  };

  const cur = FLOW_STAGES[active]!;
  const lane = 'flex flex-col gap-2 border-b border-line pb-3 text-[11px] tracking-[0.08em] text-sub';

  return (
    <div className="flex min-w-0 flex-col gap-6 px-4 pt-8 pb-10 text-[13px] sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[12px] text-sub">CoBRA 法 ・ 業務フローと画面の対応 (旧 Excel 版 2.1 / 3.3 に相当)</span>
          <h1 className="n m-0 text-[20px] leading-[1.3] sm:text-[24px]">モデルを作る → 見積もる → リスクを見る → 報告する</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3.5">
          <div className="flex items-center gap-1" aria-hidden="true">
            {FLOW_STAGES.map((s, i) => (
              <span
                key={s.no}
                className="h-1.5 rounded-[3px] transition-[width,background-color] duration-300"
                style={{ width: i === active ? 22 : 10, background: i <= active ? 'var(--color-accent)' : 'var(--color-line)' }}
              />
            ))}
          </div>
          {/* 自動再生中は 1.8 秒ごとの読み上げを止める */}
          <span className="n text-[13px] text-sub" aria-live={playing ? 'off' : 'polite'}>
            {active + 1} / {FLOW_STAGES.length}
          </span>
          <button
            type="button"
            onClick={toggle}
            aria-pressed={playing}
            className={`flow-btn inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-[10px] px-3.5 text-[12px] font-bold ${playing ? 'border border-muted bg-transparent text-text' : 'border-0 bg-accent text-bg'}`}
          >
            {playing ? (
              <>
                <svg aria-hidden="true" className="flow-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <path d="M21 12a9 9 0 1 1-6.2-8.6" />
                </svg>
                <span>停止</span>
              </>
            ) : (
              <>
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12">
                  <path d="M2 1.5v9l8-4.5z" fill="currentColor" />
                </svg>
                <span>流れを再生</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3.5">
        <div className="hidden grid-cols-2 gap-11 lg:grid">
          <span className={lane}>
            <span>
              1. モデル構築 <span className="text-sub">— モデル管理者</span>
            </span>
          </span>
          <span className={lane}>
            <span>
              2. 見積り ・ 3. リスク ・ 4. レポート <span className="text-sub">— 見積り担当 / PMO</span>
            </span>
          </span>
        </div>
        <FlowDiagram active={active} onPick={pick} />
      </div>

      <section
        key={tick}
        aria-label={`STEP ${cur.no} の詳細`}
        className="flow-panel grid min-w-0 gap-8 rounded-[18px] border border-line bg-card px-5 py-6 sm:px-7 lg:min-h-[316px] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.25fr)_minmax(0,0.95fr)]"
        style={{ animationDelay: tick === 0 ? '500ms' : '0ms' }}
      >
        <div className="flex min-w-0 flex-col gap-2.5">
          <span className="text-[11px] tracking-[0.08em] text-sub">
            STEP {cur.no} ・ {cur.who}
          </span>
          <h2 className="n m-0 text-[22px] leading-[1.2]">{cur.t}</h2>
          <p className="m-0 text-[13px] leading-[1.7] text-sub">{cur.desc}</p>
          <div className="mt-auto flex flex-wrap gap-2">
            {cur.screens.map(([l, href]) => (
              <Link key={href} to={href} className="guide-lk inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-muted bg-bg px-3 text-[12px] font-bold text-text no-underline">
                {l}
                <span aria-hidden="true" className="text-accent">→</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="grid min-w-0 grid-cols-1 items-start gap-2.5 sm:grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-2">
            <span className="text-[11px] tracking-[0.08em] text-sub">入力</span>
            <div className="flex flex-wrap gap-1.5">
              {cur.inp.map((c) => (
                <span key={c} className="flow-chip">
                  {c}
                </span>
              ))}
            </div>
          </div>
          <div className="flex h-full items-center justify-center text-[18px] text-accent sm:pt-[18px]" aria-hidden="true">
            <span className="rotate-90 sm:rotate-0">→</span>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <span className="text-[11px] tracking-[0.08em] text-sub">出力</span>
            <div className="flex flex-wrap gap-1.5">
              {cur.out.map((c) => (
                <span key={c} className="flow-chip out">
                  {c}
                </span>
              ))}
            </div>
          </div>
          <div className="col-span-full mt-1.5 flex items-start gap-2.5 rounded-xl border border-line bg-bg px-3.5 py-3">
            <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent" />
            <span className="text-[12px] leading-[1.6] text-body">{cur.tip}</span>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-3.5">
          <div className="flex flex-col gap-2">
            <span className="text-[11px] tracking-[0.08em] text-sub">旧 Excel 版の要件 ID</span>
            <div className="flex flex-wrap gap-1.5">
              {cur.old.map((c) => (
                <span key={c} className="flow-chip n font-medium tracking-normal">
                  {c}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[11px] tracking-[0.08em] text-sub">Web 版で変わること</span>
            <span className="text-[12px] leading-[1.6] text-sub">{cur.diff}</span>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,808fr)_minmax(0,512fr)]">
        <div className="flow-card flex min-w-0 flex-col gap-3.5 rounded-[18px] border border-line bg-card px-4 py-5 sm:px-[22px]" style={{ animationDelay: '700ms' }}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="m-0 text-[14px] font-bold">データの出入り</h2>
            <span className="text-[11px] text-sub">旧 3.2 外部ファイル (XML, Shift-JIS) → JSON / CSV</span>
          </div>
          <div className="grid items-stretch md:grid-cols-[minmax(0,1fr)_28px_minmax(0,1.1fr)_28px_minmax(0,1fr)]">
            <IoCard tag="IN ・ JSON" tagClass="text-info" title="モデルパラメータの取り込み" body="標準要因・三角分布・要因間の関係。簡易ツールからの持ち込みも同形式" to="/transfer" />
            <Arrow />
            <IoCard tag="サーバ保存" tagClass="text-accent" title="見積りモデル v1 → v3" body="組織内で共有。α と精度の推移を版ごとに保持" strong />
            <Arrow />
            <IoCard tag="OUT ・ JSON / PDF" tagClass="text-ok" title="エクスポートとレポート" body="標準データへのフィードバック。実績データは「含める / 含めない」を選択" to="/transfer?tab=export" />
          </div>
          <Link to="/transfer?tab=csv" className="guide-lk flex items-center gap-2.5 rounded-xl border border-transparent px-1 py-1 text-[11px] text-sub no-underline hover:text-text">
            <span className="n shrink-0 text-[11px] text-info">IN ・ CSV</span>
            <span className="min-w-0">実績データの一括取り込み — プロジェクト名・規模・工数・レベル値。列の対応付けを画面で確認してから登録</span>
            <span aria-hidden="true" className="shrink-0 text-accent">→</span>
          </Link>
        </div>
        <div className="flow-card flex min-w-0 flex-col gap-2.5 rounded-[18px] border border-line bg-card px-4 py-5 sm:px-[22px]" style={{ animationDelay: '780ms' }}>
          <h2 className="m-0 text-[14px] font-bold">旧 Excel 版からの置き換え</h2>
          <div className="grid grid-cols-[minmax(0,1fr)_20px_minmax(0,1.2fr)] items-center gap-x-2 gap-y-1.5 text-[12px]">
            {[
              ['ワークシート 10 枚 + ダイアログ', '画面 8 つ。手順は同じ、解説は画面内に常駐'],
              // 設計稿は「サーバ側で計算」。実装はブラウザ内 Web Worker（IMPLEMENTATION_BRIEF.md §7）
              ['VBA の構築・見積り処理', 'ブラウザ内で計算、進捗を表示 (旧 5.1 性能要件)'],
              ['XML をメールで送付', 'JSON をアップロード、管理者が承認'],
              ['レポート・シート', 'A4 印刷レイアウト + PDF、モデル情報を同梱'],
              ['1 人 1 ファイル', '組織で 1 モデルを共有、版と世代で履歴管理'],
            ].map(([a, b]) => (
              <Row key={a} from={a!} to={b!} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function IoCard({ tag, tagClass, title, body, strong, to }: { tag: string; tagClass: string; title: string; body: string; strong?: boolean; to?: string }) {
  const cls = `flex min-w-0 flex-col gap-1 rounded-xl border px-3.5 py-3 ${strong ? 'border-line-strong bg-card-2' : 'border-line bg-bg'}`;
  const inner = (
    <>
      <span className={`n text-[11px] ${tagClass}`}>{tag}</span>
      <span className="text-[12px] font-bold">
        {title}
        {to && (
          <span aria-hidden="true" className="ml-1 text-accent">
            →
          </span>
        )}
      </span>
      <span className="text-[11px] leading-[1.5] text-sub">{body}</span>
    </>
  );
  // 取り込み / 書き出しの画面へ（JSON は ?tab= で該当タブを開く）
  return to ? (
    <Link to={to} className={`guide-lk ${cls} text-text no-underline`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

const Arrow = () => (
  <div className="flex items-center justify-center py-1 text-weak" aria-hidden="true">
    <span className="rotate-90 md:rotate-0">→</span>
  </div>
);

function Row({ from, to }: { from: string; to: string }) {
  return (
    <>
      <span className="text-sub">{from}</span>
      <span className="text-center text-weak" aria-hidden="true">
        →
      </span>
      <span>{to}</span>
    </>
  );
}
