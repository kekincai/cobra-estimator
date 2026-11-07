// 実績を追加・編集（design/ProjectEdit.dc.html）
import { DEFAULT_UNITS, expectedCO, isInconsistent, projectGap, toFP, toMM, type ModelSpec, type UnitFactors } from 'cobra-core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toModelSpec, type ModelBundle, type ProjectRow } from '../../shared/types';
import { useModel, useProject, useProjects } from '../data/api';
import { alphaOf, projectStats } from '../features/projects/calc';
import { useDeleteProject, useSaveProject, type ProjectInput } from '../features/projects/mutations';
import { PositionScatter } from '../features/projects/PositionScatter';
import { Segmented } from '../ui/Segmented';

type SizeUnit = 'FP' | 'KLOC' | 'screen';
type EffUnit = 'MM' | 'hours';
const NEW_GROUP = '__new__';

export default function ProjectEditPage() {
  const { id } = useParams();
  const model = useModel();
  const projects = useProjects();
  const project = useProject(id);

  if (model.isError || projects.isError || project.isError) {
    const err = model.error ?? projects.error ?? project.error;
    return (
      <div className="p-8">
        <div className="tile flex flex-col gap-3 p-8">
          <span className="text-coral-ink">{id && project.isError ? `プロジェクト ${id} が見つかりません。` : `データを読み込めませんでした: ${err?.message}`}</span>
          <Link to="/model/projects" className="text-[13px]">実績データへ戻る</Link>
        </div>
      </div>
    );
  }
  if (!model.data || !projects.data || (id && !project.data)) {
    return <div className="p-8 text-[13px] text-sub">読み込み中…</div>;
  }
  return <ProjectForm key={id ?? 'new'} bundle={model.data} all={projects.data} initial={project.data ?? null} />;
}

const blankLevels = (spec: ModelSpec) => Object.fromEntries(spec.factors.map((f) => [f.id, 1]));

function nextGroupId(groups: { id: string }[]): string {
  const letters = groups.map((g) => g.id).filter((g) => /^[A-Z]$/.test(g));
  const max = letters.length ? Math.max(...letters.map((g) => g.charCodeAt(0))) : 64;
  return String.fromCharCode(Math.min(90, max + 1));
}

function ProjectForm({ bundle, all, initial }: { bundle: ModelBundle; all: ProjectRow[]; initial: ProjectRow | null }) {
  const navigate = useNavigate();
  const save = useSaveProject(initial?.id);
  const del = useDeleteProject();
  const nameRef = useRef<HTMLInputElement>(null);
  const spec = useMemo(() => toModelSpec(bundle, bundle.activeVersion?.expertMode), [bundle]);
  const units: UnitFactors = bundle.model.units ?? DEFAULT_UNITS;
  const factors = useMemo(() => [...spec.factors].sort((a, b) => a.no - b.no), [spec]);
  const newGroupId = nextGroupId(bundle.groups);

  const [name, setName] = useState(initial?.name ?? '');
  const [group, setGroup] = useState(initial?.groupId ?? bundle.groups[0]?.id ?? 'A');
  const [size, setSize] = useState(initial ? String(initial.sizeFP) : '');
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>('FP');
  const [effort, setEffort] = useState(initial ? String(initial.effortMM) : '');
  const [effUnit, setEffUnit] = useState<EffUnit>('MM');
  const [levels, setLevels] = useState<Record<string, number>>(() => ({ ...blankLevels(spec), ...(initial?.levels ?? {}) }));
  const [note, setNote] = useState(initial?.note ?? '');
  const [adopted, setAdopted] = useState(initial?.adopted ?? true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 4000);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  const groupId = group === NEW_GROUP ? newGroupId : group;
  const sizeFP = toFP(Number(size) || 0, sizeUnit, units);
  const effMM = toMM(Number(effort) || 0, effUnit, units);
  const sco = expectedCO(spec, levels).sco;
  const prod = sizeFP > 0 ? effMM / sizeFP : 0;

  // 比較対象: 同じグループの他の実績
  const existing = all.filter((p) => p.groupId === groupId && p.id !== initial?.id);
  const alpha = bundle.activeVersion?.alpha ?? alphaOf(projectStats(spec, existing));
  const expected = alpha !== null ? alpha * (1 + sco) : 0;
  // gap = α_j / α − 1（cobra-core の判定と同じ式。構築時の不整合カードと一致させる）
  const gap = alpha !== null && alpha > 0 && sizeFP > 0 && effMM > 0 ? projectGap(spec, alpha, { id: initial?.id ?? 'new', sizeFP, effortMM: effMM, levels }) : 0;

  const nameOk = name.trim().length > 0;
  const sizeOk = sizeFP > 0;
  const effOk = effMM > 0;
  const gapOk = !isInconsistent(gap);
  const allOk = nameOk && sizeOk && effOk;
  const busy = save.isPending || del.isPending;
  const fmtInt = (v: number) => Math.round(v).toLocaleString('en-US');

  const checks: [boolean, string][] = [
    [nameOk, 'プロジェクト名が入っている'],
    [sizeOk, `規模が 0 より大きい (${fmtInt(sizeFP)} FP 換算)`],
    [effOk, `工数が 0 より大きい (${effMM.toFixed(1)} 人月換算)`],
    [gapOk, gapOk ? 'ΣCO と生産性が ±25% 以内' : 'ΣCO と生産性が 25% 以上ずれている — 保存はできますが、構築時に不整合として出ます'],
  ];

  const verdict = !sizeOk || !effOk
    ? '規模と工数を入れると判定します。'
    : gapOk
      ? `実績の生産性 ${prod.toFixed(4)} は、レベル値から予想される ${expected.toFixed(4)} と整合しています。この実績はモデルの精度を上げる方向に働きます。`
      : gap > 0
        ? `実績の生産性がレベル値から予想されるより ${Math.round(gap * 100)}% 悪い。工数に見積り外の作業 (移管・保守) が含まれていないか、レベル値を低く付けすぎていないかを確認してください。`
        : `実績の生産性がレベル値から予想されるより ${Math.round(-gap * 100)}% 良い。規模の計測漏れや、レベル値を高く付けすぎていないかを確認してください。`;

  const submit = async (next: 'list' | 'again') => {
    if (!allOk || busy) return;
    const body: ProjectInput = {
      groupId,
      name: name.trim(),
      sizeFP: Math.round(sizeFP * 100) / 100,
      effortMM: Math.round(effMM * 100) / 100,
      levels,
      note,
      adopted,
      excludedReason: adopted ? null : (initial?.excludedReason ?? '手動で除外'),
    };
    try {
      const res = await save.mutateAsync(body);
      if (next === 'list') navigate('/model/projects');
      else {
        setSavedMsg(`${res.id} を保存しました`);
        setName('');
        setSize('');
        setEffort('');
        setLevels(blankLevels(spec));
        setNote('');
        setAdopted(true);
        if (group === NEW_GROUP) setGroup(groupId);
        nameRef.current?.focus();
      }
    } catch {
      // エラーは save.error で表示
    }
  };

  const remove = async () => {
    if (!initial) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await del.mutateAsync(initial.id);
      navigate('/model/projects');
    } catch {
      setConfirmDelete(false);
    }
  };

  const groupOpts = [
    ...bundle.groups.map((g) => ({ value: g.id, label: `グループ ${g.id}` })),
    { value: NEW_GROUP, label: '新しいグループ' },
  ];
  const usedInGroup = existing.filter((p) => p.adopted).length;

  return (
    <div className="flex min-w-0 flex-col gap-5 px-8 pt-7 pb-9">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] text-sub">
            <Link to="/model/projects" className="text-sub no-underline hover:text-text">実績データ</Link>{' '}
            <span className="text-line-strong">/</span> {initial ? initial.id : 'プロジェクトを追加'}
          </span>
          <h1 className="n m-0 text-[28px]">{initial ? 'プロジェクト実績を編集' : 'プロジェクト実績を追加'}</h1>
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
              onClick={remove}
              disabled={busy}
              className={`btn min-h-10 cursor-pointer rounded-[10px] border px-3.5 text-[13px] font-medium disabled:cursor-not-allowed ${
                confirmDelete ? 'border-coral bg-coral text-bg' : 'border-coral-btn-line bg-transparent text-coral-ink'
              }`}
            >
              {del.isPending ? '削除中…' : confirmDelete ? 'もう一度押すと削除' : '削除'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => submit('again')}
              disabled={!allOk || busy}
              className={`btn min-h-10 rounded-[10px] border px-3.5 text-[13px] font-medium ${
                allOk ? 'cursor-pointer border-line-mid bg-card text-text' : 'cursor-not-allowed border-line bg-transparent text-weak'
              }`}
            >
              保存して次を追加
            </button>
          )}
          <button
            type="button"
            onClick={() => submit('list')}
            disabled={!allOk || busy}
            className={`btn min-h-10 rounded-[10px] border-0 px-4 text-[13px] font-bold ${
              allOk ? 'cursor-pointer bg-accent text-bg' : 'cursor-not-allowed bg-raised text-weak'
            }`}
          >
            {save.isPending ? '保存中…' : allOk ? '保存して一覧へ' : '必須項目を入力'}
          </button>
        </div>
      </div>

      {(save.isError || del.isError || savedMsg) && (
        <p
          role={save.isError || del.isError ? 'alert' : 'status'}
          className={`m-0 rounded-[12px] px-4 py-2.5 text-[12px] ${save.isError || del.isError ? 'bg-coral-bg text-coral-ink' : 'bg-ok-bg text-ok'}`}
        >
          {save.isError ? `保存できませんでした: ${save.error.message}` : del.isError ? `削除できませんでした: ${del.error.message}` : savedMsg}
        </p>
      )}

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.25fr)_400px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="tile flex flex-col gap-4 px-6 py-[22px]">
            <span className="text-[14px] font-bold">基本情報</span>
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3.5">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="pj-name" className="text-[11px] text-sub">プロジェクト名</label>
                <input
                  id="pj-name"
                  ref={nameRef}
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setSavedMsg('');
                  }}
                  placeholder="例: 受発注システム更改"
                  className={FIELD}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] text-sub">グループ</span>
                <Segmented label="グループ" className="min-h-10 self-start" value={group} onChange={setGroup} options={groupOpts} />
                {group === NEW_GROUP && <span className="text-[11px] text-weak">保存すると「グループ {newGroupId}」を作成します</span>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3.5">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="pj-size" className="text-[11px] text-sub">規模</label>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <input id="pj-size" type="number" min={0} value={size} onChange={(e) => setSize(e.target.value)} className={`${FIELD} ${NUM}`} />
                  <Segmented<SizeUnit>
                    label="規模の単位"
                    value={sizeUnit}
                    onChange={setSizeUnit}
                    options={[{ value: 'FP', label: 'FP' }, { value: 'KLOC', label: 'KLOC' }, { value: 'screen', label: '画面数' }]}
                  />
                </div>
                <span className="text-[11px] text-weak">
                  {sizeUnit === 'FP'
                    ? 'モデルは FP で構築。そのまま使います'
                    : sizeUnit === 'KLOC'
                      ? `1 KLOC ≒ ${units.fpPerKloc} FP で換算 → ${fmtInt(sizeFP)} FP`
                      : `1 画面 ≒ ${units.fpPerScreen} FP で換算 → ${fmtInt(sizeFP)} FP`}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="pj-effort" className="text-[11px] text-sub">工数</label>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <input id="pj-effort" type="number" min={0} step={0.1} value={effort} onChange={(e) => setEffort(e.target.value)} className={`${FIELD} ${NUM}`} />
                  <Segmented<EffUnit>
                    label="工数の単位"
                    value={effUnit}
                    onChange={setEffUnit}
                    options={[{ value: 'MM', label: '人月' }, { value: 'hours', label: '人時' }]}
                  />
                </div>
                <span className="text-[11px] text-weak">
                  {effUnit === 'MM' ? 'モデルは人月で構築。そのまま使います' : `${units.hoursPerMM} 時間 = 1 人月で換算 → ${effMM.toFixed(1)} 人月`}
                </span>
              </div>
            </div>
          </div>

          <div className="tile flex flex-col gap-3 px-6 py-[22px]" style={{ animationDelay: '80ms' }}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[14px] font-bold">変動要因のレベル値</span>
              <span className="text-[11px] text-weak">
                ΣCO <span className="n text-text">+{Math.round(sco * 100)}%</span> ・ 不明な要因は L1 (標準) のままにします
              </span>
            </div>
            <div className="flex flex-col gap-1">
              {factors.map((f) => {
                const lv = levels[f.id] ?? 0;
                return (
                  <div key={f.id} className="grid grid-cols-[30px_minmax(0,1fr)_176px] items-center gap-3 rounded-[12px] bg-bg px-2.5 py-2">
                    <span className="n text-[11px] text-weak">{String(f.no).padStart(2, '0')}</span>
                    <div className="flex min-w-0 flex-col gap-px">
                      <span className="text-[13px] font-medium">{f.name}{f.kind === 'indirect' ? ' (間接)' : ''}</span>
                      <span className="truncate text-[11px] text-sub">L{lv}: {f.levels[lv]}</span>
                    </div>
                    <Segmented<number>
                      label={`${f.name} のレベル`}
                      frame="pill-card"
                      height={26}
                      numeric
                      value={lv}
                      onChange={(v) => setLevels((s) => ({ ...s, [f.id]: v }))}
                      options={[0, 1, 2, 3].map((k) => ({ value: k, label: `L${k}`, tone: k === 3 ? 'coral' : 'accent' }))}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="tile flex flex-col gap-3.5 px-6 py-[22px]" style={{ animationDelay: '160ms' }}>
            <div className="grid grid-cols-[minmax(0,1fr)_200px] items-start gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="pj-note" className="text-[11px] text-sub">備考 — 単位・留意点・特殊事情</label>
                <textarea
                  id="pj-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="例: 保守チームへの移管作業 2 人月を含む。規模は要件定義書ベースの FP 計測値。"
                  className={`${FIELD} min-h-[72px] resize-none px-3 py-2.5 text-[12.5px] leading-[1.6]`}
                />
              </div>
              <div className="flex flex-col gap-2.5">
                <span className="text-[11px] text-sub">モデル構築に使う</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={adopted}
                  onClick={() => setAdopted((v) => !v)}
                  className={`btn inline-flex min-h-10 cursor-pointer items-center gap-2.5 self-start rounded-full border py-0 pr-3 pl-1.5 text-text ${
                    adopted ? 'border-accent bg-card-2' : 'border-muted bg-bg'
                  }`}
                >
                  <span className={`size-7 rounded-full transition-[background] duration-200 ${adopted ? 'bg-accent' : 'bg-line-strong'}`} />
                  <span className="text-[13px] font-bold">{adopted ? '採用する' : '除外する'}</span>
                </button>
                <span className="text-[11px] leading-normal text-weak">除外しても一覧には残り、あとから採用に戻せます。</span>
              </div>
            </div>
          </div>
        </div>

        <aside className="sticky top-6 flex flex-col gap-4">
          <div className="tile flex flex-col gap-3 px-[22px] py-5" style={{ animationDelay: '60ms' }}>
            <div className="flex items-baseline justify-between">
              <span className="text-[14px] font-bold">既存の実績の中での位置</span>
              <span className="text-[11px] text-weak">グループ {groupId} ・ {usedInGroup} 件採用</span>
            </div>
            <PositionScatter existing={existing} alpha={alpha} sizeFP={sizeFP} effortMM={effMM} label={nameOk ? 'このプロジェクト' : '入力中'} />
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-0.5 rounded-[12px] border border-line bg-bg px-3 py-2.5">
                <span className="text-[10px] text-weak">このプロジェクトの生産性</span>
                <span className="n text-[16px]">{prod > 0 ? prod.toFixed(4) : '—'}</span>
                <span className="text-[10px] text-weak">人月 / FP</span>
              </div>
              <div className="flex flex-col gap-0.5 rounded-[12px] border border-line bg-bg px-3 py-2.5">
                <span className="text-[10px] text-weak">名目 α × (1 + ΣCO)</span>
                <span className="n text-[16px]">{alpha !== null ? expected.toFixed(4) : '—'}</span>
                <span className="text-[10px] text-weak">レベル値から予想</span>
              </div>
            </div>
          </div>

          <div className="tile flex flex-col gap-3 px-[22px] py-5" style={{ animationDelay: '140ms' }}>
            <span className="text-[14px] font-bold">ΣCO と生産性の整合</span>
            <div className="flex items-center gap-3">
              <div
                className="relative h-2.5 flex-1 rounded-[5px]"
                style={{ background: 'linear-gradient(90deg, var(--color-coral) 0%, var(--color-raised) 35%, var(--color-raised) 65%, var(--color-coral) 100%)' }}
                role="img"
                aria-label={`生産性のずれ ${Math.round(gap * 100)}%（±25% 以内なら整合）`}
              >
                <div className="absolute inset-y-0 right-[35%] left-[35%] rounded-[5px] bg-ok-bg" />
                <div
                  className={`ln absolute -top-1 h-[18px] w-1 rounded-[2px] ${gapOk ? 'bg-accent' : 'bg-coral'}`}
                  style={{ left: `calc(${50 + Math.max(-50, Math.min(50, gap * 100))}% - 2px)` }}
                />
              </div>
              <span className={`n w-[52px] text-right text-[16px] ${gapOk ? 'text-text' : 'text-coral-soft'}`}>
                {gap >= 0 ? '+' : ''}{Math.round(gap * 100)}%
              </span>
            </div>
            <span className="text-[12px] leading-[1.6] text-body" aria-live="polite">{verdict}</span>
            <span className="text-[11px] leading-normal text-weak">±25% を超える食い違いは、モデル構築時に「不整合」として指摘されます (PJ-007 と同じ扱い)。</span>
          </div>

          <div className="tile flex flex-col gap-2 px-[22px] py-[18px]" style={{ animationDelay: '200ms' }}>
            <span className="text-[13px] font-bold">保存前のチェック</span>
            {checks.map(([ok, label]) => (
              <div key={label.slice(0, 12)} className="flex items-center gap-2.5 text-[12px]">
                <span
                  aria-hidden="true"
                  className={`inline-flex size-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${ok ? 'bg-ok-bg text-ok' : 'bg-warn-bg text-warn'}`}
                >
                  {ok ? '✓' : '!'}
                </span>
                <span className={`leading-normal ${ok ? 'text-body' : 'text-warn-ink'}`}>
                  <span className="sr-only">{ok ? 'OK: ' : '要確認: '}</span>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

const FIELD =
  'min-h-10 w-full rounded-[10px] border border-line bg-bg px-3 text-[13px] text-text transition-[border-color] placeholder:text-weak focus:border-accent focus:outline-none';
const NUM = 'no-spin font-num text-[15px] font-bold';
