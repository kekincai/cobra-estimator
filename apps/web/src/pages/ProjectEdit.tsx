// 実績を追加・編集（design/ProjectEdit.dc.html）
import { DEFAULT_UNITS, expectedCO, type ModelSpec, type UnitFactors } from 'cobra-core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toModelSpec, type ModelBundle, type ProjectRow } from '../../shared/types';
import { useModel, useProject, useProjects } from '../data/api';
import { bandPct } from '../features/projects/bandFormat';
import { alphaOf, projectStats } from '../features/projects/calc';
import {
  formGap,
  gapStatus,
  mapServerIssues,
  NAME_MAX,
  validateProjectForm,
  type EffUnit,
  type FieldErrors,
  type FieldKey,
  type SizeUnit,
} from '../features/projects/formValidation';
import { ProjectSaveError, useDeleteProject, useSaveProject, type ProjectInput } from '../features/projects/mutations';
import { PositionScatter } from '../features/projects/PositionScatter';
import { describeApiError } from '../ui/apiError';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { HelpLink } from '../ui/HelpLink';
import { Segmented } from '../ui/Segmented';
import { useUnsavedChangesPrompt } from '../ui/useUnsavedChangesPrompt';

const NEW_GROUP = '__new__';

export default function ProjectEditPage() {
  const { id } = useParams();
  const model = useModel();
  const projects = useProjects();
  const project = useProject(id);

  if (model.isError || projects.isError || project.isError) {
    const err = model.error ?? projects.error ?? project.error;
    const notFound = !!id && project.isError && (project.error as { status?: number } | null)?.status === 404;
    return (
      <div className="px-4 py-8 sm:px-8">
        <div role="alert" className="tile flex flex-col items-start gap-3 p-8">
          <span className="text-coral-ink">
            {notFound ? `プロジェクト ${id} が見つかりません。削除された可能性があります。` : `データを読み込めませんでした。${describeApiError(err)}`}
          </span>
          <div className="flex flex-wrap gap-2">
            {!notFound && (
              <button
                type="button"
                onClick={() => {
                  void model.refetch();
                  void projects.refetch();
                  if (id) void project.refetch();
                }}
                className="btn inline-flex min-h-10 cursor-pointer items-center rounded-[10px] border-0 bg-accent px-4 text-[13px] font-bold text-bg"
              >
                再試行
              </button>
            )}
            <Link to="/model/projects" className="btn inline-flex min-h-10 items-center rounded-[10px] border border-muted px-3.5 text-[13px] text-text no-underline">
              実績データへ戻る
            </Link>
          </div>
        </div>
      </div>
    );
  }
  if (!model.data || !projects.data || (id && !project.data)) {
    return <div className="px-4 py-8 text-[13px] text-sub sm:px-8">読み込み中…</div>;
  }
  return <ProjectForm key={id ?? 'new'} bundle={model.data} all={projects.data} initial={project.data ?? null} />;
}

const blankLevels = (spec: ModelSpec) => Object.fromEntries(spec.factors.map((f) => [f.id, 1]));

function nextGroupId(groups: { id: string }[]): string {
  const letters = groups.map((g) => g.id).filter((g) => /^[A-Z]$/.test(g));
  const max = letters.length ? Math.max(...letters.map((g) => g.charCodeAt(0))) : 64;
  return String.fromCharCode(Math.min(90, max + 1));
}

interface FormState {
  name: string;
  group: string;
  size: string;
  sizeUnit: SizeUnit;
  effort: string;
  effUnit: EffUnit;
  levels: Record<string, number>;
  note: string;
  adopted: boolean;
}

const snapshot = (s: FormState) => JSON.stringify({ ...s, name: s.name.trim(), size: s.size.trim(), effort: s.effort.trim() });

function ProjectForm({ bundle, all, initial }: { bundle: ModelBundle; all: ProjectRow[]; initial: ProjectRow | null }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const save = useSaveProject(initial?.id);
  const del = useDeleteProject();
  const nameRef = useRef<HTMLInputElement>(null);
  const sizeRef = useRef<HTMLInputElement>(null);
  const effortRef = useRef<HTMLInputElement>(null);
  const leaving = useRef(false);
  const spec = useMemo(() => toModelSpec(bundle, bundle.activeVersion?.expertMode), [bundle]);
  const units: UnitFactors = bundle.model.units ?? DEFAULT_UNITS;
  const factors = useMemo(() => [...spec.factors].sort((a, b) => a.no - b.no), [spec]);
  const newGroupId = nextGroupId(bundle.groups);
  // 一覧の「このグループに実績を追加」から来たときはそのグループを選んでおく
  const presetGroup = params.get('group');
  const startGroup = initial?.groupId ?? (presetGroup && bundle.groups.some((g) => g.id === presetGroup) ? presetGroup : bundle.groups[0]?.id ?? 'A');

  const blank = (group: string): FormState => ({
    name: '', group, size: '', sizeUnit: 'FP', effort: '', effUnit: 'MM', levels: blankLevels(spec), note: '', adopted: true,
  });
  const [form, setForm] = useState<FormState>(() =>
    initial
      ? {
          name: initial.name, group: initial.groupId, size: String(initial.sizeFP), sizeUnit: 'FP', effort: String(initial.effortMM), effUnit: 'MM',
          levels: { ...blankLevels(spec), ...initial.levels }, note: initial.note, adopted: initial.adopted,
        }
      : blank(startGroup),
  );
  const [baseline, setBaseline] = useState(() => snapshot(form));
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((s) => ({ ...s, [k]: v }));
    setSavedMsg('');
  };
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const dirty = snapshot(form) !== baseline;
  useUnsavedChangesPrompt(dirty, { allow: () => leaving.current });

  const groupId = form.group === NEW_GROUP ? newGroupId : form.group;
  const v = validateProjectForm({ name: form.name, size: form.size, sizeUnit: form.sizeUnit, effort: form.effort, effUnit: form.effUnit, units });
  const sizeFP = v.sizeFP;
  const effMM = v.effMM;
  const sizeOk = v.storedSizeFP !== null;
  const effOk = v.storedEffMM !== null;
  const nameOk = !v.errors.name;
  const allOk = nameOk && sizeOk && effOk;
  const sco = expectedCO(spec, form.levels).sco;
  const prod = sizeOk && effOk ? effMM! / sizeFP! : null;

  // 比較対象: 同じグループの他の実績
  const existing = all.filter((p) => p.groupId === groupId && p.id !== initial?.id);
  const alpha = bundle.activeVersion?.alpha ?? alphaOf(projectStats(spec, existing));
  const expected = alpha !== null ? alpha * (1 + sco) : null;
  // gap = α_j / α − 1（cobra-core の判定と同じ式。構築時の不整合カードと一致させる）。未入力なら null（判定前）
  const gap = sizeOk && effOk ? formGap(spec, alpha, sizeFP, effMM, form.levels, initial?.id ?? 'new') : null;
  const status = gapStatus(gap);
  const gapView = gap === null ? null : bandPct(gap);
  const busy = save.isPending || del.isPending;
  const fmtInt = (x: number) => Math.round(x).toLocaleString('en-US');

  const shownError = (k: FieldKey): string | undefined => serverErrors[k] ?? ((touched[k] || submitted) ? (v.errors as FieldErrors)[k] : undefined);

  type Tone = 'ok' | 'warn' | 'pending';
  const checks: [Tone, string][] = [
    [nameOk ? 'ok' : 'warn', 'プロジェクト名が入っている'],
    [sizeOk ? 'ok' : 'warn', `規模が 0 より大きい (${sizeFP !== null ? `${fmtInt(sizeFP)} FP 換算` : '未入力'})`],
    [effOk ? 'ok' : 'warn', `工数が 0 より大きい (${effMM !== null ? `${effMM.toFixed(1)} 人月換算` : '未入力'})`],
    status === 'pending'
      ? ['pending', 'ΣCO と生産性の整合 — 規模と工数の入力後に判定します']
      : status === 'ok'
        ? ['ok', 'ΣCO と生産性が ±25% 以内']
        : ['warn', 'ΣCO と生産性が 25% 以上ずれている — 保存はできますが、構築時に不整合として出ます'],
  ];

  const verdict =
    status === 'pending' || prod === null || expected === null || !gapView
      ? '規模と工数を入れると判定します。'
      : status === 'ok'
        ? `実績の生産性 ${prod.toFixed(4)} は、レベル値から予想される ${expected.toFixed(4)} と整合しています。この実績はモデルの精度を上げる方向に働きます。`
        : gap! > 0
          ? `実績の生産性がレベル値から予想されるより ${gapView.text.slice(1)} 悪い。工数に見積り外の作業 (移管・保守) が含まれていないか、レベル値を低く付けすぎていないかを確認してください。`
          : `実績の生産性がレベル値から予想されるより ${gapView.text.slice(1)} 良い。規模の計測漏れや、レベル値を高く付けすぎていないかを確認してください。`;

  const focusFirstInvalid = (errs: FieldErrors) => {
    if (errs.name) nameRef.current?.focus();
    else if (errs.size) sizeRef.current?.focus();
    else if (errs.effort) effortRef.current?.focus();
  };

  const submit = async (next: 'list' | 'again') => {
    if (busy) return;
    if (!allOk) {
      setSubmitted(true);
      focusFirstInvalid(v.errors);
      return;
    }
    const body: ProjectInput = {
      groupId,
      name: form.name.trim(),
      sizeFP: v.storedSizeFP!,
      effortMM: v.storedEffMM!,
      levels: form.levels,
      note: form.note,
      adopted: form.adopted,
      excludedReason: form.adopted ? null : (initial?.excludedReason ?? '手動で除外'),
    };
    setServerErrors({});
    try {
      const res = await save.mutateAsync(body);
      if (next === 'list') {
        leaving.current = true;
        navigate('/model/projects');
      } else {
        const fresh = blank(form.group === NEW_GROUP ? groupId : form.group);
        setForm(fresh);
        setBaseline(snapshot(fresh));
        setTouched({});
        setSubmitted(false);
        setSavedMsg(`${res.id} を保存しました。続けて次の実績を入力できます。`);
        nameRef.current?.focus();
      }
    } catch (e) {
      if (e instanceof ProjectSaveError) {
        const fe = mapServerIssues(e.issues);
        setServerErrors(fe);
        focusFirstInvalid(fe);
      }
    }
  };

  const remove = async () => {
    if (!initial) return;
    try {
      await del.mutateAsync(initial.id);
      leaving.current = true;
      setConfirmDelete(false);
      navigate('/model/projects');
    } catch {
      // エラーはダイアログ内に表示
    }
  };

  // 入力し直したら、その項目のサーバー側エラーは消す
  const clearServer = (k: FieldKey) => setServerErrors((s) => (s[k] ? { ...s, [k]: undefined } : s));

  useEffect(() => {
    if (!savedMsg) return;
    const t = setTimeout(() => setSavedMsg(''), 8000);
    return () => clearTimeout(t);
  }, [savedMsg]);

  const groupOpts = [
    ...bundle.groups.map((g) => ({ value: g.id, label: `グループ ${g.id}` })),
    { value: NEW_GROUP, label: '新しいグループ' },
  ];
  const usedInGroup = existing.filter((p) => p.adopted).length;
  const saveErrorText = save.isError
    ? Object.keys(serverErrors).length > 0
      ? '保存できませんでした。赤枠の項目を確認してください。入力内容はそのままです。'
      : `保存できませんでした。${describeApiError(save.error)} 入力内容はそのままです。`
    : null;

  const nameErr = shownError('name');
  const sizeErr = shownError('size');
  const effErr = shownError('effort');
  const groupErr = shownError('group');
  const levelsErr = shownError('levels');

  return (
    <div className="flex min-w-0 flex-col gap-5 px-4 pt-7 pb-9 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[12px] text-sub">
            <Link to="/model/projects" className="text-sub no-underline hover:text-text">実績データ</Link>{' '}
            <span aria-hidden="true">/</span> {initial ? initial.id : 'プロジェクトを追加'}
          </span>
          <h1 className="n m-0 flex flex-wrap items-center gap-2 text-[28px]">
            {initial ? 'プロジェクト実績を編集' : 'プロジェクト実績を追加'}
            <HelpLink section="build" />
          </h1>
          <span className="text-[13px] text-sub">入力しながら右側で、既存の実績の中でどこに落ちるか・ΣCO と生産性が整合しているかを確認できます。</span>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link
            to="/model/projects"
            className="btn inline-flex min-h-10 items-center rounded-[10px] border border-muted bg-transparent px-3.5 text-[13px] text-sub no-underline"
          >
            キャンセル
          </Link>
          {initial ? (
            <button
              type="button"
              onClick={() => {
                del.reset();
                setConfirmDelete(true);
              }}
              disabled={busy}
              className="btn min-h-10 cursor-pointer rounded-[10px] border border-coral-btn-line bg-transparent px-3.5 text-[13px] font-medium text-coral-ink disabled:cursor-not-allowed"
            >
              削除
            </button>
          ) : (
            <button
              type="button"
              onClick={() => submit('again')}
              disabled={busy}
              className={`btn min-h-10 rounded-[10px] border px-3.5 text-[13px] font-medium ${
                allOk ? 'cursor-pointer border-line-mid bg-card text-text' : 'cursor-pointer border-line bg-transparent text-sub'
              }`}
            >
              保存して次を追加
            </button>
          )}
          <button
            type="button"
            onClick={() => submit('list')}
            disabled={busy}
            className={`btn min-h-10 cursor-pointer rounded-[10px] border-0 px-4 text-[13px] font-bold ${allOk ? 'bg-accent text-bg' : 'bg-raised text-sub'}`}
          >
            {save.isPending ? '保存中…' : allOk ? '保存して一覧へ' : '必須項目を入力'}
          </button>
        </div>
      </div>

      {submitted && !allOk && (
        <p role="alert" className="m-0 rounded-[12px] bg-warn-bg px-4 py-2.5 text-[12px] text-warn-ink">
          未入力または誤りのある項目があります: {[v.errors.name && 'プロジェクト名', v.errors.size && '規模', v.errors.effort && '工数'].filter(Boolean).join('、')}
        </p>
      )}
      {(saveErrorText || savedMsg) && (
        <p
          role={saveErrorText ? 'alert' : 'status'}
          className={`m-0 rounded-[12px] px-4 py-2.5 text-[12px] ${saveErrorText ? 'bg-coral-bg text-coral-ink' : 'bg-ok-bg text-ok'}`}
        >
          {saveErrorText ?? savedMsg}
        </p>
      )}

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.25fr)_400px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="tile flex min-w-0 flex-col gap-4 px-4 py-[22px] sm:px-6" aria-labelledby="pj-basic">
            <h2 id="pj-basic" className="m-0 text-[14px] font-bold">基本情報</h2>
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="pj-name" className="text-[11px] text-sub">プロジェクト名</label>
                <input
                  id="pj-name"
                  ref={nameRef}
                  type="text"
                  value={form.name}
                  maxLength={NAME_MAX}
                  onChange={(e) => {
                    set('name', e.target.value);
                    clearServer('name');
                  }}
                  onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                  placeholder="例: 受発注システム更改"
                  aria-invalid={!!nameErr}
                  aria-describedby={nameErr ? 'pj-name-err' : undefined}
                  className={`${FIELD} ${nameErr ? ERR : ''}`}
                />
                {nameErr && <FieldError id="pj-name-err">{nameErr}</FieldError>}
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <span id="pj-group-label" className="text-[11px] text-sub">グループ</span>
                <Segmented
                  label="グループ"
                  className="max-w-full flex-wrap self-start"
                  value={form.group}
                  onChange={(g) => {
                    set('group', g);
                    clearServer('group');
                  }}
                  options={groupOpts}
                />
                {form.group === NEW_GROUP && <span className="text-[11px] text-sub">保存すると「グループ {newGroupId}」を作成します</span>}
                {groupErr && <FieldError id="pj-group-err">{groupErr}</FieldError>}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="pj-size" className="text-[11px] text-sub">規模</label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    id="pj-size"
                    ref={sizeRef}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={form.size}
                    onChange={(e) => {
                      set('size', e.target.value);
                      clearServer('size');
                    }}
                    onBlur={() => setTouched((t) => ({ ...t, size: true }))}
                    aria-invalid={!!sizeErr}
                    aria-describedby={`pj-size-hint${sizeErr ? ' pj-size-err' : ''}`}
                    className={`${FIELD} ${NUM} min-w-[96px] flex-1 basis-[120px] ${sizeErr ? ERR : ''}`}
                  />
                  <Segmented<SizeUnit>
                    label="規模の単位"
                    value={form.sizeUnit}
                    onChange={(u) => set('sizeUnit', u)}
                    options={[{ value: 'FP', label: 'FP' }, { value: 'KLOC', label: 'KLOC' }, { value: 'screen', label: '画面数' }]}
                  />
                </div>
                {sizeErr && <FieldError id="pj-size-err">{sizeErr}</FieldError>}
                <span id="pj-size-hint" className="text-[11px] text-sub">
                  {form.sizeUnit === 'FP'
                    ? 'モデルは FP で構築。そのまま使います'
                    : form.sizeUnit === 'KLOC'
                      ? `1 KLOC ≒ ${units.fpPerKloc} FP で換算 → ${sizeFP !== null ? fmtInt(sizeFP) : '—'} FP`
                      : `1 画面 ≒ ${units.fpPerScreen} FP で換算 → ${sizeFP !== null ? fmtInt(sizeFP) : '—'} FP`}
                </span>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="pj-effort" className="text-[11px] text-sub">工数</label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    id="pj-effort"
                    ref={effortRef}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={form.effort}
                    onChange={(e) => {
                      set('effort', e.target.value);
                      clearServer('effort');
                    }}
                    onBlur={() => setTouched((t) => ({ ...t, effort: true }))}
                    aria-invalid={!!effErr}
                    aria-describedby={`pj-effort-hint${effErr ? ' pj-effort-err' : ''}`}
                    className={`${FIELD} ${NUM} min-w-[96px] flex-1 basis-[120px] ${effErr ? ERR : ''}`}
                  />
                  <Segmented<EffUnit>
                    label="工数の単位"
                    value={form.effUnit}
                    onChange={(u) => set('effUnit', u)}
                    options={[{ value: 'MM', label: '人月' }, { value: 'hours', label: '人時' }]}
                  />
                </div>
                {effErr && <FieldError id="pj-effort-err">{effErr}</FieldError>}
                <span id="pj-effort-hint" className="text-[11px] text-sub">
                  {form.effUnit === 'MM' ? 'モデルは人月で構築。そのまま使います' : `${units.hoursPerMM} 時間 = 1 人月で換算 → ${effMM !== null ? effMM.toFixed(1) : '—'} 人月`}
                </span>
              </div>
            </div>
          </section>

          <section className="tile flex min-w-0 flex-col gap-3 px-4 py-[22px] sm:px-6" style={{ animationDelay: '80ms' }} aria-labelledby="pj-levels">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="pj-levels" className="m-0 text-[14px] font-bold">変動要因のレベル値</h2>
              <span className="text-[11px] text-sub">
                ΣCO <span className="n text-text">+{Math.round(sco * 100)}%</span> ・ 不明な要因は L1 (標準) のままにします
              </span>
            </div>
            {levelsErr && <FieldError id="pj-levels-err">{levelsErr}</FieldError>}
            <div className="flex flex-col gap-1">
              {factors.map((f) => {
                const lv = form.levels[f.id] ?? 0;
                return (
                  <div
                    key={f.id}
                    className="grid grid-cols-[30px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 rounded-[12px] bg-bg px-2.5 py-2 sm:grid-cols-[30px_minmax(0,1fr)_auto]"
                  >
                    <span className="n text-[11px] text-sub">{String(f.no).padStart(2, '0')}</span>
                    <div className="flex min-w-0 flex-col gap-px">
                      <span className="text-[13px] font-medium">{f.name}{f.kind === 'indirect' ? ' (間接)' : ''}</span>
                      <span className="truncate text-[11px] text-sub" title={f.levels[lv]}>L{lv}: {f.levels[lv]}</span>
                    </div>
                    <Segmented<number>
                      label={`${f.name} のレベル`}
                      frame="pill-card"
                      height={28}
                      numeric
                      className="col-start-2 justify-self-start sm:col-start-3"
                      value={lv}
                      onChange={(x) => {
                        setForm((s) => ({ ...s, levels: { ...s.levels, [f.id]: x } }));
                        setSavedMsg('');
                        clearServer('levels');
                      }}
                      options={[0, 1, 2, 3].map((k) => ({ value: k, label: `L${k}`, tone: k === 3 ? 'coral' : 'accent' }))}
                    />
                  </div>
                );
              })}
            </div>
          </section>

          <section className="tile flex min-w-0 flex-col gap-3.5 px-4 py-[22px] sm:px-6" style={{ animationDelay: '160ms' }}>
            <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[minmax(0,1fr)_200px]">
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="pj-note" className="text-[11px] text-sub">備考 — 単位・留意点・特殊事情</label>
                <textarea
                  id="pj-note"
                  value={form.note}
                  onChange={(e) => {
                    set('note', e.target.value);
                    clearServer('note');
                  }}
                  placeholder="例: 保守チームへの移管作業 2 人月を含む。規模は要件定義書ベースの FP 計測値。"
                  className={`${FIELD} min-h-[72px] resize-y px-3 py-2.5 text-[12.5px] leading-[1.6]`}
                />
              </div>
              <div className="flex flex-col gap-2.5">
                <span id="pj-adopt-label" className="text-[11px] text-sub">モデル構築に使う</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.adopted}
                  aria-labelledby="pj-adopt-label"
                  onClick={() => set('adopted', !form.adopted)}
                  className={`btn inline-flex min-h-10 cursor-pointer items-center gap-2.5 self-start rounded-full border py-0 pr-3 pl-1.5 text-text ${
                    form.adopted ? 'border-accent bg-card-2' : 'border-muted bg-bg'
                  }`}
                >
                  <span aria-hidden="true" className={`size-7 rounded-full transition-[background] duration-200 ${form.adopted ? 'bg-accent' : 'bg-line-strong'}`} />
                  <span aria-hidden="true" className="text-[13px] font-bold">{form.adopted ? '採用する' : '除外する'}</span>
                </button>
                <span className="text-[11px] leading-normal text-sub">除外しても一覧には残り、あとから採用に戻せます。</span>
              </div>
            </div>
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-6">
          <div className="tile flex min-w-0 flex-col gap-3 px-[22px] py-5" style={{ animationDelay: '60ms' }}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="m-0 text-[14px] font-bold">既存の実績の中での位置</h2>
              <span className="text-[11px] text-sub">グループ {groupId} ・ {usedInGroup} 件採用</span>
            </div>
            <PositionScatter existing={existing} alpha={alpha} sizeFP={sizeFP ?? 0} effortMM={effMM ?? 0} label={nameOk ? 'このプロジェクト' : '入力中'} />
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-0.5 rounded-[12px] border border-line bg-bg px-3 py-2.5">
                <span className="text-[11px] text-sub">このプロジェクトの生産性</span>
                <span className="n text-[16px]">{prod !== null ? prod.toFixed(4) : '—'}</span>
                <span className="text-[11px] text-sub">人月 / FP</span>
              </div>
              <div className="flex flex-col gap-0.5 rounded-[12px] border border-line bg-bg px-3 py-2.5">
                <span className="text-[11px] text-sub">名目 α × (1 + ΣCO)</span>
                <span className="n text-[16px]">{expected !== null ? expected.toFixed(4) : '—'}</span>
                <span className="text-[11px] text-sub">レベル値から予想</span>
              </div>
            </div>
          </div>

          <div className="tile flex min-w-0 flex-col gap-3 px-[22px] py-5" style={{ animationDelay: '140ms' }}>
            <h2 className="m-0 text-[14px] font-bold">ΣCO と生産性の整合</h2>
            <div className="flex items-center gap-3">
              <div
                className="relative h-2.5 flex-1 rounded-[5px]"
                style={{ background: 'linear-gradient(90deg, var(--color-coral) 0%, var(--color-raised) 35%, var(--color-raised) 65%, var(--color-coral) 100%)' }}
                role="img"
                aria-label={gapView ? `生産性のずれ ${gapView.text}（±25% 以内なら整合）` : '生産性のずれ: 規模と工数の入力後に判定'}
              >
                <div className="absolute inset-y-0 right-[35%] left-[35%] rounded-[5px] bg-ok-bg" />
                {gap !== null && (
                  <div
                    className={`ln absolute -top-1 h-[18px] w-1 rounded-[2px] ${status === 'out' ? 'bg-coral' : 'bg-accent'}`}
                    style={{ left: `calc(${50 + Math.max(-50, Math.min(50, gap * 100))}% - 2px)` }}
                  />
                )}
              </div>
              <span className={`n min-w-[52px] text-right text-[16px] ${status === 'out' ? 'text-coral-soft' : status === 'ok' ? 'text-text' : 'text-sub'}`}>
                {gapView ? gapView.text : '—'}
              </span>
            </div>
            <span className="text-[12px] leading-[1.6] text-body" aria-live="polite">{verdict}</span>
            <span className="text-[11px] leading-normal text-sub">±25% を超える食い違いは、モデル構築時に「不整合」として指摘されます。</span>
          </div>

          <div className="tile flex flex-col gap-2 px-[22px] py-[18px]" style={{ animationDelay: '200ms' }}>
            <h2 className="m-0 text-[13px] font-bold">保存前のチェック</h2>
            {checks.map(([tone, label]) => (
              <div key={label.slice(0, 12)} className="flex items-center gap-2.5 text-[12px]">
                <span
                  aria-hidden="true"
                  className={`inline-flex size-[18px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    tone === 'ok' ? 'bg-ok-bg text-ok' : tone === 'warn' ? 'bg-warn-bg text-warn' : 'bg-raised text-sub'
                  }`}
                >
                  {tone === 'ok' ? '✓' : tone === 'warn' ? '!' : '–'}
                </span>
                <span className={`leading-normal ${tone === 'ok' ? 'text-body' : tone === 'warn' ? 'text-warn-ink' : 'text-sub'}`}>
                  <span className="sr-only">{tone === 'ok' ? 'OK: ' : tone === 'warn' ? '要確認: ' : '判定前: '}</span>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`${initial?.id ?? ''} を削除しますか？`}
        confirmLabel="削除する"
        danger
        busy={del.isPending}
        error={del.isError ? `削除できませんでした。${describeApiError(del.error)}` : null}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      >
        「{initial?.name}」を実績データから削除します。元に戻せません。次のモデル構築から α の計算に使われなくなります。
        構築に使わないだけなら、削除せずに「除外する」に切り替えてください。
      </ConfirmDialog>
    </div>
  );
}

function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <span id={id} className="text-[11.5px] leading-normal text-coral-ink">
      {children}
    </span>
  );
}

const FIELD =
  'min-h-10 w-full rounded-[10px] border border-muted bg-bg px-3 text-[13px] text-text transition-[border-color] placeholder:text-weak focus:border-accent focus:outline-none';
const ERR = '!border-coral';
const NUM = 'font-num text-[15px] font-bold';
