// 要因を追加 › 一から定義する: 入力フォーム + ライブプレビュー + 追加前チェック。
import { useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { availableTargets } from '../../../shared/factor-rules';
import { ApiError } from '../../data/api';
import { LevelBadge } from '../../ui/LevelBadge';
import { TriangleShape, type TriangleSeries } from '../../ui/TriangleShape';
import { factorNo } from '../../ui/format';
import { categoriesOf, expertsOf, fromPct, useCreateFactors, type FactorRow } from './data';
import { Segmented } from './Pills';

interface ExpertDraft {
  name: string;
  best: string;
  likely: string;
  worst: string;
}
interface FormState {
  name: string;
  cat: string;
  def: string;
  levels: [string, string, string, string];
  kind: 'direct' | 'indirect';
  targetFactorId: string;
  experts: ExpertDraft[];
}

const DRAFT_KEY = 'estima.factorNew.draft';
const DEFAULT_TRIS: [string, string, string][] = [['10', '30', '80'], ['10', '25', '70']];
const PLACEHOLDERS = ['例: 最小限の文書で可', '例: 標準的な設計書一式', '例: 承認付きの詳細設計書', '例: 監査対応レベルの文書と履歴'];
const SERIES_COLORS = ['var(--accent)', 'var(--color-info)', 'var(--color-teal)', 'var(--color-warn)'];

function loadDraft(): FormState | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as FormState) : null;
  } catch {
    return null;
  }
}

export function NewFactorForm({ factors, canEdit }: { factors: FactorRow[]; canEdit: boolean }) {
  const navigate = useNavigate();
  const create = useCreateFactors();
  const cats = categoriesOf(factors);
  const catOptions = cats.length ? cats : ['プロダクト', '人', 'プロセス'];
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [f, setF] = useState<FormState>(() => {
    const saved = loadDraft();
    if (saved) return saved;
    const names = expertsOf(factors).filter((e) => e !== '標準');
    return {
      name: '',
      cat: catOptions[0]!,
      def: '',
      levels: ['', '', '', ''],
      kind: 'direct',
      targetFactorId: '',
      experts: (names.length ? names : ['担当者1']).map((name, i) => {
        const t = DEFAULT_TRIS[i] ?? ['10', '30', '70'];
        return { name, best: t[0], likely: t[1], worst: t[2] };
      }),
    };
  });
  const set = (patch: Partial<FormState>) => setF((s) => ({ ...s, ...patch }));
  const setExpert = (i: number, k: keyof ExpertDraft) => (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setF((s) => ({ ...s, experts: s.experts.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));
  };

  const tris = f.experts.map((x) => [fromPct(x.best), fromPct(x.likely), fromPct(x.worst)] as [number, number, number]);
  const bad = tris.some((t) => !(t[0] <= t[1] && t[1] <= t[2]));
  const avgLikely = tris.reduce((a, t) => a + t[1], 0) / (tris.length || 1);
  const targets = availableTargets(factors);
  const indirect = f.kind === 'indirect';
  const duplicate = factors.some((x) => x.name === f.name.trim());

  const nameOk = f.name.trim().length > 0 && !duplicate;
  const defOk = f.def.trim().length > 0;
  const lvOk = f.levels.every((l) => l.trim().length > 0);
  const triOk = !bad && tris.length > 0 && f.experts.every((x) => x.name.trim());
  const targetOk = !indirect || !!f.targetFactorId;
  const allOk = nameOk && defOk && lvOk && triOk && targetOk;
  const checks: [boolean, string][] = [
    [nameOk, duplicate ? '同じ名称の要因がすでにある' : '名称が入っている'],
    [defOk, '定義が書かれている'],
    [lvOk, 'レベル 0〜3 がすべて埋まっている'],
    [triOk, '三角分布が 最良 ≤ 最頻 ≤ 最悪'],
    ...(indirect ? ([[targetOk, '強める直接要因を選んでいる']] as [boolean, string][]) : []),
  ];
  const polys: TriangleSeries[] = tris.map((t, i) => ({ tri: t, stroke: SERIES_COLORS[i % 4]!, fill: i === 0 ? 'var(--accent)' : undefined, dashed: i > 0 }));

  const save = () => {
    if (!allOk) return;
    create.mutate(
      [
        {
          name: f.name.trim(),
          category: f.cat,
          kind: f.kind,
          targetFactorId: indirect ? f.targetFactorId : null,
          definition: f.def.trim(),
          levels: f.levels.map((l) => l.trim()) as FormState['levels'],
          origin: 'custom',
          triangles: f.experts.map((x, i) => ({ expert: x.name.trim(), best: tris[i]![0] / 100, likely: tris[i]![1] / 100, worst: tris[i]![2] / 100 })),
        },
      ],
      {
        onSuccess: (ids) => {
          try {
            localStorage.removeItem(DRAFT_KEY);
          } catch {
            /* 保存できない環境では何もしない */
          }
          navigate(`/model/factors?f=${ids[0]}`);
        },
      },
    );
  };
  const saveDraft = () => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(f));
      setDraftNote('下書きをこのブラウザに保存しました');
    } catch {
      setDraftNote('下書きを保存できませんでした');
    }
  };

  return (
    <section className="fx-pane grid grid-cols-12 items-start gap-4">
      <form
        className="tile fx-static col-span-12 flex min-w-0 flex-col gap-3.5 px-6 py-[22px] xl:col-span-7"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="n-name" className="text-[11px] text-sub">名称</label>
            <input id="n-name" type="text" className="fx-field" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="例: ドキュメント要求の厳しさ" />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-sub">カテゴリ</span>
            <Segmented label="カテゴリ" value={f.cat} onChange={(cat) => set({ cat })} options={catOptions.map((c) => ({ value: c, label: c }))} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="n-def" className="text-[11px] text-sub">定義 — 何を測る要因か</label>
          <textarea id="n-def" rows={2} className="fx-field" value={f.def} onChange={(e) => set({ def: e.target.value })} placeholder="例: 顧客が求める設計書・手順書の分量と承認の厳しさ" />
        </div>

        <div className="flex flex-col gap-1.5 border-t border-line pt-2.5">
          <span className="text-[11px] text-sub">レベル定義 (L0 = 影響なし → L3 = 最大。見積り時にこの 4 段階で評価します)</span>
          {f.levels.map((t, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <LevelBadge level={i} />
              <input
                type="text"
                className="fx-field"
                aria-label={`L${i}`}
                value={t}
                placeholder={PLACEHOLDERS[i]}
                onChange={(e) => {
                  const v = e.target.value;
                  setF((s) => {
                    const levels = [...s.levels] as FormState['levels'];
                    levels[i] = v;
                    return { ...s, levels };
                  });
                }}
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-[190px_minmax(0,1fr)] items-start gap-3 border-t border-line pt-2.5">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-sub">種別</span>
            <Segmented
              label="種別"
              value={f.kind}
              onChange={(kind) => set({ kind })}
              options={[
                { value: 'direct', label: '直接要因' },
                { value: 'indirect', label: '間接要因' },
              ]}
            />
          </div>
          {indirect ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="n-target" className="text-[11px] text-sub">影響を強める直接要因 (間接要因は直接要因 1 つにつき 1 つまで)</label>
              {targets.length ? (
                <select id="n-target" className="fx-field" value={f.targetFactorId} onChange={(e) => set({ targetFactorId: e.target.value })}>
                  <option value="">選択してください</option>
                  {targets.map((t) => (
                    <option key={t.id} value={t.id}>{factorNo(t.no)} {t.name}</option>
                  ))}
                </select>
              ) : (
                <span className="pt-2 text-[11px] text-coral-soft">すべての直接要因にすでに間接要因があります。</span>
              )}
            </div>
          ) : (
            <span className="pt-6 text-[11px] text-weak">直接要因は ΣCO に直接加算されます。</span>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-line pt-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-sub">三角分布 — L3 のときの工数増加率 (%)</span>
            <button
              type="button"
              className="btn min-h-[26px] cursor-pointer rounded-full border border-muted bg-transparent px-2.5 font-[inherit] text-[11px] text-sub"
              onClick={() => setF((s) => ({ ...s, experts: [...s.experts, { name: `担当者${s.experts.length + 1}`, best: '10', likely: '30', worst: '70' }] }))}
            >
              + 担当者
            </button>
          </div>
          <div className="grid grid-cols-[90px_repeat(3,minmax(0,1fr))] gap-2 text-[10px] text-weak"><span /><span>最良</span><span>最頻</span><span>最悪</span></div>
          {f.experts.map((x, i) => {
            const t = tris[i]!;
            const rowBad = !(t[0] <= t[1] && t[1] <= t[2]);
            return (
              <div key={i} className="grid grid-cols-[90px_repeat(3,minmax(0,1fr))] items-center gap-2">
                <input type="text" className="fx-field px-2.5! py-[7px]!" aria-label="担当者名" value={x.name} onChange={setExpert(i, 'name')} />
                <input type="text" inputMode="decimal" className={`fx-field n ${rowBad ? 'fx-bad' : ''}`} aria-label="最良" value={x.best} onChange={setExpert(i, 'best')} />
                <input type="text" inputMode="decimal" className={`fx-field n ${rowBad ? 'fx-bad' : ''}`} aria-label="最頻" value={x.likely} onChange={setExpert(i, 'likely')} />
                <input type="text" inputMode="decimal" className={`fx-field n ${rowBad ? 'fx-bad' : ''}`} aria-label="最悪" value={x.worst} onChange={setExpert(i, 'worst')} />
              </div>
            );
          })}
          {bad && <span className="text-[11px] text-coral-soft">最良 ≤ 最頻 ≤ 最悪 の順になるように入力してください。</span>}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1.5">
          <button
            type="submit"
            className="btn inline-flex min-h-[42px] cursor-pointer items-center rounded-[10px] border-0 px-[18px] font-[inherit] text-[13px] font-bold enabled:bg-accent enabled:text-bg disabled:cursor-default disabled:bg-raised disabled:text-weak"
            disabled={!allOk || !canEdit || create.isPending}
          >
            {create.isPending ? '保存中…' : '保存してモデルに追加'}
          </button>
          <button type="button" className="btn min-h-[42px] cursor-pointer rounded-[10px] border border-muted bg-transparent px-3.5 font-[inherit] text-[13px] font-medium text-text" onClick={saveDraft}>
            下書き保存
          </button>
          <Link to="/model/factors" className="inline-flex min-h-[42px] items-center px-3 text-[13px] text-sub! no-underline hover:text-text!">
            キャンセル
          </Link>
          <span role="status" className={`ml-auto text-[11px] ${create.error ? 'text-coral-soft' : 'text-weak'}`}>
            {create.error ? (create.error instanceof ApiError ? create.error.message : '保存できませんでした。') : !canEdit ? '読み取り専用です' : draftNote}
          </span>
        </div>
      </form>

      <aside aria-label="ライブプレビュー" className="tile fx-static col-span-12 flex min-w-0 flex-col gap-3.5 px-6 py-[22px] xl:col-span-5" style={{ animationDelay: '120ms' }}>
        <span className="text-[11px] text-sub">ライブプレビュー — 見積り画面ではこう見えます</span>
        <div className="flex flex-col gap-2 rounded-[14px] bg-bg px-4 py-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="n text-[12px] text-weak">{factorNo(factors.length + 1)}</span>
            <span className="text-[14px] font-bold">{f.name.trim() || '(名称未入力)'}</span>
            <span className="rounded-full bg-raised px-2 py-0.5 text-[10px] text-sub">{f.cat}</span>
            <span className="rounded-full bg-raised px-2 py-0.5 text-[10px] text-sub">{indirect ? '間接要因' : '直接要因'}</span>
          </div>
          <div className="flex items-center justify-between gap-2.5">
            <span className="text-[12px] text-sub">レベルを選ぶ</span>
            <span aria-hidden="true" className="inline-flex gap-0.5 rounded-full bg-card p-[3px]">
              {[0, 1, 2, 3].map((l) => (
                <span key={l} className={`n inline-flex h-[26px] w-[30px] items-center justify-center rounded-full text-[11px] ${l === 3 ? 'bg-coral text-bg' : 'text-sub'}`}>
                  {l}
                </span>
              ))}
            </span>
          </div>
        </div>
        <TriangleShape height={130} label="入力した三角分布の形状" series={polys} />
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-0.5 rounded-[10px] bg-bg px-3 py-2.5"><span className="text-[10px] text-sub">平均の最頻値 (L3)</span><span className="n text-[20px] text-accent">+{Math.round(avgLikely)}%</span></div>
          <div className="flex flex-col gap-0.5 rounded-[10px] bg-bg px-3 py-2.5"><span className="text-[10px] text-sub">L1 / L2 の目安</span><span className="n text-[20px]">+{Math.round(avgLikely / 3)}% / +{Math.round((avgLikely * 2) / 3)}%</span></div>
        </div>
        <div className="mt-auto flex flex-col gap-1.5 border-t border-line pt-3">
          <span className="text-[11px] text-sub">追加前チェック</span>
          {checks.map(([ok, label]) => (
            <span key={label} className="flex items-center gap-2 text-[12px]">
              <span className={`size-2 shrink-0 rounded-full ${ok ? 'bg-ok' : 'bg-line-strong'}`} />
              <span className={ok ? 'text-text' : 'text-sub'}>{label}</span>
            </span>
          ))}
        </div>
      </aside>
    </section>
  );
}
