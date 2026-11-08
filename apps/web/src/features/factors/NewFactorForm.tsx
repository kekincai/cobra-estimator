// 要因を追加 › 一から定義する: 入力フォーム + ライブプレビュー + 追加前チェック。
// 検査は formCheck.ts。エラーは各欄の下に出し（aria-invalid + aria-describedby）、保存を押したら最初のエラー欄へ移動する。
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { availableTargets } from '../../../shared/factor-rules';
import { HelpLink } from '../../ui/HelpLink';
import { LevelBadge } from '../../ui/LevelBadge';
import { TriangleShape, type TriangleSeries } from '../../ui/TriangleShape';
import { describeApiError } from '../../ui/apiError';
import { factorNo } from '../../ui/format';
import { issuesOf } from './api';
import { categoriesOf, expertsOf, useCreateFactors, type FactorRow } from './data';
import { checkNewFactor, errorsFromIssues, fid, type ExpertDraft, type NewFactorDraft } from './formCheck';
import { Segmented } from './Pills';
import { checkTri, fmtMultiplier, TRI_KEYS, TRI_LABEL, triValues, type TriKey } from './triangle';

type FormState = NewFactorDraft;

const DRAFT_KEY = 'estima.factorNew.draft';
const DEFAULT_TRIS: [string, string, string][] = [['10', '30', '80'], ['10', '25', '70']];
const PLACEHOLDERS = ['例: 最小限の文書で可', '例: 標準的な設計書一式', '例: 承認付きの詳細設計書', '例: 監査対応レベルの文書と履歴'];
const SERIES_COLORS = ['var(--accent)', 'var(--color-info)', 'var(--color-teal)', 'var(--color-warn)'];
const TRI_FIELD: Record<TriKey, 'best' | 'likely' | 'worst'> = { b: 'best', l: 'likely', w: 'worst' };

/** DOM の id */
const domId = (field: string) => `n-${field}`;
const errId = (field: string) => `n-${field}-err`;

function loadDraft(): FormState | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as FormState) : null;
  } catch {
    return null;
  }
}

export function NewFactorForm({
  factors,
  canEdit,
  k,
  onDirtyChange,
  onLeaving,
}: {
  factors: FactorRow[];
  canEdit: boolean;
  /** 間接要因の係数（L3 で 1 + k 倍） */
  k: number;
  onDirtyChange: (dirty: boolean) => void;
  /** 保存に成功して一覧へ移るとき（離脱の確認を出さない） */
  onLeaving: () => void;
}) {
  const navigate = useNavigate();
  const create = useCreateFactors();
  const formRef = useRef<HTMLFormElement>(null);
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
  const [baseline, setBaseline] = useState(() => JSON.stringify(f));
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});

  const dirty = JSON.stringify(f) !== baseline;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const edited = () => {
    setDraftNote(null);
    if (Object.keys(serverErrors).length) setServerErrors({});
  };
  const set = (patch: Partial<FormState>) => {
    edited();
    setF((s) => ({ ...s, ...patch }));
  };
  const setExpert = (i: number, key: keyof ExpertDraft) => (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    edited();
    setF((s) => ({ ...s, experts: s.experts.map((x, j) => (j === i ? { ...x, [key]: v } : x)) }));
  };
  const blur = (field: string) => () => setTouched((t) => (t.has(field) ? t : new Set(t).add(field)));

  const targets = availableTargets(factors);
  const indirect = f.kind === 'indirect';
  const check = checkNewFactor(f, factors, targets.length);
  const errors = { ...serverErrors, ...check.errors };
  // 未入力のエラーは、欄を離れたか保存を押してから出す。値の誤り（数値でない・負・順序・重複）はすぐ出す
  const visible = (field: string) => {
    const msg = errors[field];
    if (!msg) return undefined;
    if (submitted || touched.has(field) || serverErrors[field]) return msg;
    if (field.startsWith('exp-') && !msg.endsWith('入力してください')) return msg;
    if (field === fid.name && check.duplicateOf) return msg;
    return undefined;
  };
  const describedBy = (...fields: string[]) => fields.filter((x) => visible(x)).map(errId).join(' ') || undefined;
  const errorText = (field: string) => {
    const msg = visible(field);
    return msg ? (
      <span key={field} id={errId(field)} className="text-[11px] text-coral-soft">
        {msg}
      </span>
    ) : null;
  };
  const inputProps = (field: string, ...extra: string[]) => {
    const bad = !!visible(field) || extra.some((x) => !!visible(x));
    return {
      id: domId(field),
      'aria-invalid': bad || undefined,
      'aria-describedby': describedBy(field, ...extra),
      'aria-required': true,
      className: `fx-field ${bad ? 'fx-bad' : ''}`,
      onBlur: blur(field),
    } as const;
  };
  const focusField = (field: string | null) => {
    if (!field) return;
    formRef.current?.ownerDocument.getElementById(domId(field))?.focus();
  };

  const tris = f.experts.map((x) => triValues(checkTri({ b: x.best, l: x.likely, w: x.worst })));
  const okTris = tris.filter((t): t is [number, number, number] => t !== null);
  const avgLikely = okTris.length === tris.length && tris.length ? okTris.reduce((a, t) => a + t[1], 0) / okTris.length : null;
  const polys: TriangleSeries[] = tris.flatMap((t, i) => (t ? [{ tri: t, stroke: SERIES_COLORS[i % 4]!, fill: i === 0 ? 'var(--accent)' : undefined, dashed: i > 0 }] : []));
  const nErr = Object.keys(errors).length;

  const save = () => {
    setSubmitted(true);
    if (!check.ok) {
      focusField(check.first);
      return;
    }
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
          onLeaving();
          navigate(`/model/factors?f=${ids[0]}`);
        },
        onError: (e) => {
          const fe = errorsFromIssues(issuesOf(e));
          setServerErrors(fe);
          focusField(Object.keys(fe)[0] ?? null);
        },
      },
    );
  };
  const saveDraft = () => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(f));
      setBaseline(JSON.stringify(f));
      setDraftNote('下書きをこのブラウザに保存しました');
    } catch {
      setDraftNote('下書きを保存できませんでした');
    }
  };

  const status = create.error
    ? describeApiError(create.error, '保存できませんでした。時間をおいて再試行してください。')
    : !canEdit
      ? '読み取り専用です'
      : submitted && nErr
        ? `入力に誤りがあります (${nErr} 件)。赤枠の欄を確認してください。`
        : draftNote;
  const statusBad = !!create.error || (canEdit && submitted && nErr > 0);

  return (
    <section className="fx-pane grid grid-cols-12 items-start gap-4">
      <form
        ref={formRef}
        noValidate
        aria-label="新しい要因"
        className="tile fx-static col-span-12 flex min-w-0 flex-col gap-3.5 px-4 py-5 sm:px-6 sm:py-[22px] xl:col-span-7"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <p className="m-0 text-[11px] text-sub">すべての項目が必須です。</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor={domId(fid.name)} className="text-[11px] text-sub">名称</label>
            <input type="text" {...inputProps(fid.name)} value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="例: ドキュメント要求の厳しさ" />
            {errorText(fid.name)}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-sub">カテゴリ</span>
            <Segmented label="カテゴリ" value={f.cat} onChange={(cat) => set({ cat })} options={catOptions.map((c) => ({ value: c, label: c }))} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={domId(fid.def)} className="text-[11px] text-sub">定義 — 何を測る要因か</label>
          <textarea rows={2} {...inputProps(fid.def)} value={f.def} onChange={(e) => set({ def: e.target.value })} placeholder="例: 顧客が求める設計書・手順書の分量と承認の厳しさ" />
          {errorText(fid.def)}
        </div>

        <div role="group" aria-labelledby="n-levels-label" className="flex min-w-0 flex-col gap-1.5 border-t border-line pt-2.5">
          <span id="n-levels-label" className="text-[11px] text-sub">レベル定義 (L0 = 影響なし → L3 = 最大。見積り時にこの 4 段階で評価します)</span>
          {f.levels.map((t, i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className="flex items-center gap-2.5">
                <LevelBadge level={i} />
                <input
                  type="text"
                  {...inputProps(fid.level(i))}
                  aria-label={`L${i}`}
                  value={t}
                  placeholder={PLACEHOLDERS[i]}
                  onChange={(e) => {
                    const v = e.target.value;
                    edited();
                    setF((s) => {
                      const levels = [...s.levels] as FormState['levels'];
                      levels[i] = v;
                      return { ...s, levels };
                    });
                  }}
                />
              </div>
              {errorText(fid.level(i))}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 items-start gap-3 border-t border-line pt-2.5 sm:grid-cols-[190px_minmax(0,1fr)]">
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
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor={domId(fid.target)} className="text-[11px] text-sub">影響を強める直接要因 (間接要因は直接要因 1 つにつき 1 つまで)</label>
              {targets.length ? (
                <select {...inputProps(fid.target)} className={`${inputProps(fid.target).className} cursor-pointer`} value={f.targetFactorId} onChange={(e) => set({ targetFactorId: e.target.value })}>
                  <option value="">選択してください</option>
                  {targets.map((t) => (
                    <option key={t.id} value={t.id}>{factorNo(t.no)} {t.name}</option>
                  ))}
                </select>
              ) : (
                <span id={domId(fid.target)} tabIndex={-1} className="pt-2 text-[11px] text-coral-soft">すべての直接要因にすでに間接要因があります。</span>
              )}
              {targets.length > 0 && errorText(fid.target)}
              <span className="text-[11px] text-sub">
                間接要因は自身の CO を工数に加えません。レベルに応じて、選んだ直接要因の CO に倍率を掛けます (L3 で {fmtMultiplier(1 + k)})。
              </span>
            </div>
          ) : (
            <span className="text-[11px] text-sub sm:pt-6">
              直接要因は、レベルに応じた CO (工数増加率) が ΣCO に直接加算されます。
            </span>
          )}
        </div>

        <div role="group" aria-labelledby="n-tri-label" className="flex min-w-0 flex-col gap-2 border-t border-line pt-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span id="n-tri-label" className="text-[11px] text-sub">
              {indirect ? '三角分布 (参考値) — L3 のときの値 (%)。間接要因の分布は工数の計算には使われません' : '三角分布 — L3 のときの工数増加率 (%)'}
            </span>
            <span className="flex items-center gap-2">
              <HelpLink section="factors" className="size-6! text-[11px]!" />
              <button
                type="button"
                className="btn min-h-[28px] cursor-pointer rounded-full border border-muted bg-transparent px-2.5 font-[inherit] text-[11px] text-sub"
                onClick={() => {
                  edited();
                  setF((s) => ({ ...s, experts: [...s.experts, { name: `担当者${s.experts.length + 1}`, best: '10', likely: '30', worst: '70' }] }));
                }}
              >
                + 担当者
              </button>
            </span>
          </div>
          <div aria-hidden="true" className="hidden grid-cols-[90px_repeat(3,minmax(0,1fr))_28px] gap-2 text-[11px] text-sub sm:grid">
            <span>担当者</span><span>最良</span><span>最頻</span><span>最悪</span><span />
          </div>
          {f.experts.map((x, i) => {
            const who = x.name.trim() || `${i + 1} 行目`;
            const row = fid.row(i);
            return (
              <div key={i} className="flex flex-col gap-1">
                <div className="grid grid-cols-[repeat(3,minmax(0,1fr))_28px] items-center gap-2 sm:grid-cols-[90px_repeat(3,minmax(0,1fr))_28px]">
                  <input
                    type="text"
                    {...inputProps(fid.expertName(i))}
                    className={`${inputProps(fid.expertName(i)).className} col-span-3 px-2.5! py-[7px]! sm:col-span-1`}
                    aria-label={`${i + 1} 行目の担当者名`}
                    value={x.name}
                    onChange={setExpert(i, 'name')}
                  />
                  <button
                    type="button"
                    className="btn inline-flex size-7 cursor-pointer items-center justify-center rounded-full border border-muted bg-transparent text-[13px] text-sub hover:text-coral disabled:cursor-default disabled:opacity-40 sm:order-last"
                    aria-label={`担当者「${who}」の行を削除`}
                    disabled={f.experts.length <= 1}
                    onClick={() => {
                      edited();
                      setF((s) => ({ ...s, experts: s.experts.filter((_, j) => j !== i) }));
                    }}
                  >
                    ×
                  </button>
                  {TRI_KEYS.map((key) => {
                    const field = fid.tri(i, key);
                    const p = inputProps(field, row);
                    return (
                      <input
                        key={key}
                        type="text"
                        inputMode="decimal"
                        {...p}
                        className={`${p.className} n min-w-0`}
                        aria-label={`${who} ${TRI_LABEL[key]} (%)`}
                        placeholder={TRI_LABEL[key]}
                        value={x[TRI_FIELD[key]]}
                        onChange={setExpert(i, TRI_FIELD[key])}
                      />
                    );
                  })}
                </div>
                {errorText(fid.expertName(i))}
                {TRI_KEYS.map((key) => errorText(fid.tri(i, key)))}
                {errorText(row)}
              </div>
            );
          })}
          {errorText('experts')}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1.5">
          <button
            type="submit"
            className="btn inline-flex min-h-[42px] cursor-pointer items-center rounded-[10px] border-0 bg-accent px-[18px] font-[inherit] text-[13px] font-bold text-bg disabled:cursor-default disabled:bg-raised disabled:text-weak"
            disabled={!canEdit || create.isPending}
          >
            {create.isPending ? '保存中…' : '保存してモデルに追加'}
          </button>
          <button type="button" className="btn min-h-[42px] cursor-pointer rounded-[10px] border border-muted bg-transparent px-3.5 font-[inherit] text-[13px] font-medium text-text" onClick={saveDraft}>
            下書き保存
          </button>
          <Link to="/model/factors" className="inline-flex min-h-[42px] items-center px-3 text-[13px] text-sub! no-underline hover:text-text!">
            キャンセル
          </Link>
          <span role="status" className={`min-w-0 text-[11px] sm:ml-auto ${statusBad ? 'text-coral-soft' : 'text-sub'}`}>
            {status}
          </span>
        </div>
      </form>

      <aside aria-label="ライブプレビュー" className="tile fx-static col-span-12 flex min-w-0 flex-col gap-3.5 px-4 py-5 sm:px-6 sm:py-[22px] xl:col-span-5" style={{ animationDelay: '120ms' }}>
        <span className="text-[11px] text-sub">ライブプレビュー — 見積り画面ではこう見えます</span>
        <div className="flex flex-col gap-2 rounded-[14px] bg-bg px-4 py-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="n text-[12px] text-sub">{factorNo(factors.length + 1)}</span>
            <span className="min-w-0 text-[14px] font-bold [overflow-wrap:anywhere]">{f.name.trim() || '(名称未入力)'}</span>
            <span className="rounded-full bg-raised px-2 py-0.5 text-[11px] text-sub">{f.cat}</span>
            <span className="rounded-full bg-raised px-2 py-0.5 text-[11px] text-sub">{indirect ? '間接要因' : '直接要因'}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2.5">
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
          <div className="flex flex-col gap-0.5 rounded-[10px] bg-bg px-3 py-2.5">
            <span className="text-[11px] text-sub">平均の最頻値 (L3)</span>
            <span className="n text-[20px] text-accent">{avgLikely === null ? '—' : `+${Math.round(avgLikely)}%`}</span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-[10px] bg-bg px-3 py-2.5">
            <span className="text-[11px] text-sub">L1 / L2 の目安</span>
            <span className="n text-[20px]">{avgLikely === null ? '—' : `+${Math.round(avgLikely / 3)}% / +${Math.round((avgLikely * 2) / 3)}%`}</span>
          </div>
        </div>
        {indirect && <span className="text-[11px] text-sub">間接要因の値は参考表示です。工数には、強める直接要因の CO × 倍率 として入ります。</span>}
        <div className="mt-auto flex flex-col gap-1.5 border-t border-line pt-3">
          <span className="text-[11px] text-sub">追加前チェック</span>
          {check.checks.map((c) => {
            const state = c.state === 'todo' && submitted ? 'error' : c.state;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => focusField(c.field)}
                className="flex min-h-6 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left font-[inherit] text-[12px]"
              >
                <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${state === 'ok' ? 'bg-ok' : state === 'error' ? 'bg-coral' : 'bg-line-strong'}`} />
                <span className={state === 'ok' ? 'text-text' : state === 'error' ? 'text-coral-soft' : 'text-sub'}>
                  {c.label}
                  <span className="sr-only">{state === 'ok' ? '（済み）' : state === 'error' ? '（要修正）' : '（未入力）'}</span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>
    </section>
  );
}
