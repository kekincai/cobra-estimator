// シミュレーション設定ダイアログ（design/SimSettings.dc.html）。
// ネイティブ <dialog> の showModal() を使うので、フォーカス閉じ込め・Esc・背面の不活性化はブラウザ任せ。
import { useEffect, useId, useRef, useState } from 'react';
import { Segmented } from '../../ui/Segmented';
import { MAX_SEED, RUN_CHOICES, randomSeed, readSim, writeSim, type SimTarget } from './store';

type TargetChoice = SimTarget | 'both';

const RUN_DEFS: Record<number, { tag: string; time: string; err: string; errNum: number }> = {
  1_000: { tag: '速い ・ 粗い', time: '0.3 秒', err: '1.2%', errNum: 1.2 },
  10_000: { tag: '推奨', time: '2.4 秒', err: '0.4%', errNum: 0.4 },
  100_000: { tag: '精密', time: '24 秒', err: '0.1%', errNum: 0.1 },
};

const SEED_MODES = [
  { fixed: true, label: 'シードを固定', desc: '再現可能。レポート向き' },
  { fixed: false, label: '実行ごとに更新', desc: '毎回ちがう乱数列で試す' },
];

export interface SimSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  /** 開いた画面。適用先の初期値になる */
  target: SimTarget;
}

export function SimSettingsDialog({ open, onClose, target }: SimSettingsDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [applyTo, setApplyTo] = useState<TargetChoice>(target);
  const [runs, setRuns] = useState(10_000);
  const [fixed, setFixed] = useState(true);
  const [seedText, setSeedText] = useState('');

  // 開くたびに保存済みの値から下書きを作り直す
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open) {
      const v = readSim(target);
      setApplyTo(target);
      setRuns(v.runs);
      setFixed(v.fixedSeed);
      setSeedText(String(v.seed));
      if (!d.open) d.showModal();
    } else if (d.open) d.close();
  }, [open, target]);

  const seedNum = Number(seedText);
  const seedOk = seedText !== '' && Number.isInteger(seedNum) && seedNum <= MAX_SEED;
  const canSave = !fixed || seedOk;
  const r = RUN_DEFS[runs] ?? RUN_DEFS[10_000]!;

  const save = () => {
    if (!canSave) return;
    const patch = { runs, fixedSeed: fixed, ...(seedOk ? { seed: seedNum } : {}) };
    const targets: SimTarget[] = applyTo === 'both' ? ['build', 'estimate'] : [applyTo];
    targets.forEach((t) => writeSim(t, patch));
    onClose();
  };

  const summary = `${runs.toLocaleString('en-US')} 回 ・ ${fixed ? `シード ${seedText || '—'}` : '乱数は毎回更新'} ・ ${
    { build: '構築のみ', estimate: '見積りのみ', both: '構築と見積り' }[applyTo]
  }`;

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // 背景（dialog 自身）をクリックしたら閉じる
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-auto max-h-none max-w-[calc(100vw-32px)] overflow-visible border-0 bg-transparent p-0 text-text backdrop:bg-bg/75 backdrop:backdrop-blur-[2px]"
    >
      {open && (
        <div
          className="flex w-[512px] max-w-full flex-col gap-[18px] rounded-[20px] border border-muted bg-card px-[26px] py-6 shadow-[0_30px_80px_rgba(0,0,0,.6)]"
          style={{ animation: 'pop .5s var(--ease-out-rise) backwards' }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] tracking-[0.08em] text-weak">モンテカルロ・シミュレーション</span>
              <h2 id={titleId} className="n m-0 text-[20px]">シミュレーション設定</h2>
            </div>
            <button
              type="button"
              aria-label="閉じる"
              onClick={onClose}
              className="btn inline-flex size-8 cursor-pointer items-center justify-center rounded-[10px] border border-muted bg-transparent text-[16px] text-sub"
            >
              ×
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[11px] text-sub">適用先</span>
            <Segmented<TargetChoice>
              label="適用先"
              className="self-start"
              itemShape="box"
              size="sm"
              value={applyTo}
              onChange={setApplyTo}
              options={[
                { value: 'build', label: 'モデル構築' },
                { value: 'estimate', label: '工数見積り' },
                { value: 'both', label: '両方' },
              ]}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-sub">シミュレーション回数</span>
              <span className="text-[11px] text-weak">多いほど結果が安定、時間は比例</span>
            </div>
            <div role="group" aria-label="シミュレーション回数" className="grid grid-cols-3 gap-2">
              {RUN_CHOICES.map((n) => {
                const d = RUN_DEFS[n]!;
                const on = runs === n;
                return (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setRuns(n)}
                    className={`btn flex cursor-pointer flex-col items-start gap-1 rounded-[12px] border px-3.5 py-3 text-left text-text transition-[border-color,background] hover:border-line-strong ${
                      on ? 'border-accent bg-card-2' : 'border-line bg-bg'
                    }`}
                  >
                    <span className={`n text-[18px] ${on ? 'text-accent' : 'text-text'}`}>{n.toLocaleString('en-US')}</span>
                    <span className="text-[11px] text-sub">{d.tag}</span>
                    <span className="flex w-full justify-between text-[10.5px] text-weak">
                      <span>約 {d.time}</span>
                      <span>P50 ±{d.err}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2.5 text-[11px] text-sub">
              <span className="whitespace-nowrap">推定値のぶれ</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-bg">
                <div
                  className={`grow-w h-full rounded-[3px] ${r.errNum > 0.5 ? 'bg-coral' : 'bg-accent'}`}
                  style={{ width: `${(r.errNum / 1.2) * 100}%` }}
                />
              </div>
              <span className="n w-11 text-right text-text">±{r.err}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[11px] text-sub">乱数</span>
            <div role="group" aria-label="乱数" className="grid grid-cols-2 gap-2">
              {SEED_MODES.map((m) => {
                const on = fixed === m.fixed;
                return (
                  <button
                    key={m.label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFixed(m.fixed)}
                    className={`btn flex cursor-pointer flex-col items-start gap-[3px] rounded-[12px] border px-3.5 py-3 text-text transition-[border-color,background] hover:border-line-strong ${
                      on ? 'border-accent bg-card-2' : 'border-line bg-bg'
                    }`}
                  >
                    <span className="text-[13px] font-bold">{m.label}</span>
                    <span className="text-left text-[11px] leading-normal text-sub">{m.desc}</span>
                  </button>
                );
              })}
            </div>
            {fixed ? (
              <>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="シード値"
                    aria-invalid={!seedOk}
                    value={seedText}
                    onChange={(e) => setSeedText(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                    className={`min-h-10 w-full rounded-[10px] border bg-bg px-3 font-num text-[15px] font-bold tracking-[0.04em] text-text transition-[border-color] focus:border-accent focus:outline-none ${
                      seedOk ? 'border-line' : 'border-coral'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setSeedText(String(randomSeed()))}
                    className="btn min-h-10 cursor-pointer rounded-[10px] border border-muted bg-transparent px-3.5 text-[12px] font-bold whitespace-nowrap text-text"
                  >
                    新しいシード
                  </button>
                </div>
                <span className="text-[11px] leading-normal text-weak">
                  {seedOk
                    ? '同じシード・同じ条件なら同じ結果。レポートに載せる前は固定にしておくと、レビューで再現できます。'
                    : `シードは 0〜${MAX_SEED.toLocaleString('en-US')} の整数で入力してください。`}
                </span>
              </>
            ) : (
              <div className="flex items-start gap-2.5 rounded-[10px] border border-warn-line bg-warn-bg px-3 py-2.5">
                <span className="mt-[5px] size-2 shrink-0 rounded-full bg-warn" />
                <span className="text-[11.5px] leading-[1.6] text-warn-ink">
                  実行のたびに結果が少し変わります (推定値で ±{r.err} 程度)。世代を比べるときは固定を推奨。
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2.5 pt-1.5">
            <span className="text-[11px] text-weak">{summary}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="btn inline-flex min-h-[38px] cursor-pointer items-center rounded-[10px] border border-muted bg-transparent px-3.5 text-[12px] text-sub"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={save}
                disabled={!canSave}
                className="btn inline-flex min-h-[38px] cursor-pointer items-center rounded-[10px] border-0 bg-accent px-4 text-[13px] font-bold text-bg disabled:cursor-not-allowed disabled:bg-raised disabled:text-weak"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
