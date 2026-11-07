// 要因を追加 › 標準要因から選ぶ: カタログ一覧 + プレビュー + 複数選択して追加。
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { availableTargets } from '../../../shared/factor-rules';
import { ApiError } from '../../data/api';
import { LevelBadge } from '../../ui/LevelBadge';
import { TriangleShape } from '../../ui/TriangleShape';
import { TriSpark } from '../../ui/TriSpark';
import { factorNo } from '../../ui/format';
import { triText, useCreateFactors, type FactorInput, type FactorRow } from './data';
import { FilterChip } from './Pills';
import { STANDARD_CATEGORIES, STANDARD_EXPERT, STANDARD_FACTORS, STANDARD_VERSION, type StandardFactor } from './standard';

const statBox = 'flex flex-col gap-0.5 rounded-[10px] bg-bg px-3 py-2.5';

export function StandardPicker({ factors, canEdit }: { factors: FactorRow[]; canEdit: boolean }) {
  const navigate = useNavigate();
  const create = useCreateFactors();
  const inModel = (s: StandardFactor) => factors.some((f) => f.name === s.name);
  const [cat, setCat] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [focusKey, setFocus] = useState(() => (STANDARD_FACTORS.find((s) => !inModel(s)) ?? STANDARD_FACTORS[0]!).key);
  const [sel, setSel] = useState<string[]>([]);
  const [targets, setTargets] = useState<Record<string, string>>({});

  const query = q.trim().toLowerCase();
  const shown = STANDARD_FACTORS.filter(
    (s) => (cat === null || s.cat === cat) && (!query || s.name.toLowerCase().includes(query) || s.def.toLowerCase().includes(query)),
  );
  const fo = STANDARD_FACTORS.find((s) => s.key === focusKey)!;
  const toggle = (s: StandardFactor) => {
    setFocus(s.key);
    setSel((xs) => (xs.includes(s.key) ? xs.filter((k) => k !== s.key) : [...xs, s.key]));
  };
  // 途中まで登録できた場合に備え、登録済みになったものは除く
  const selected = sel.map((k) => STANDARD_FACTORS.find((s) => s.key === k)!).filter((s) => !inModel(s));
  const needsTarget = selected.filter((s) => s.kind === 'indirect' && !targets[s.key]);
  const n = selected.length;
  const ready = n > 0 && needsTarget.length === 0 && canEdit && !create.isPending;

  // 間接要因の対象: まだ間接要因が付いていない直接要因から、他の選択で使っていないもの
  const targetOptions = (key: string) => {
    const usedByOthers = new Set(Object.entries(targets).filter(([k]) => k !== key && sel.includes(k)).map(([, v]) => v));
    return availableTargets(factors).filter((f) => !usedByOthers.has(f.id));
  };

  const add = () => {
    const inputs: FactorInput[] = selected.map((s) => ({
      name: s.name,
      category: s.modelCategory,
      kind: s.kind,
      targetFactorId: s.kind === 'indirect' ? targets[s.key] : null,
      definition: s.def,
      levels: s.levels,
      origin: 'standard',
      triangles: [{ expert: STANDARD_EXPERT, best: s.tri[0] / 100, likely: s.tri[1] / 100, worst: s.tri[2] / 100 }],
    }));
    create.mutate(inputs, { onSuccess: (ids) => navigate(`/model/factors?f=${ids[0]}`) });
  };

  const err = create.error;
  return (
    <section className="fx-pane grid grid-cols-12 items-start gap-4">
      <div className="col-span-12 flex min-w-0 flex-col gap-2.5 xl:col-span-7">
        <div className="flex flex-wrap items-center gap-1.5 px-0.5">
          <input
            type="search"
            aria-label="標準要因を検索"
            placeholder="標準要因を検索"
            className="fx-field w-[220px]! rounded-full! px-3.5! py-2!"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <FilterChip small on={cat === null} onClick={() => setCat(null)}>すべて</FilterChip>
          {STANDARD_CATEGORIES.map((c) => (
            <FilterChip small key={c} on={cat === c} onClick={() => setCat(c)}>{c}</FilterChip>
          ))}
          <div className="grow" />
          <span className="text-[11px] text-weak">CoBRA 標準データ {STANDARD_VERSION} ・ {shown.length} 件</span>
        </div>

        {shown.map((s, k) => {
          const on = sel.includes(s.key);
          const focused = s.key === focusKey;
          const registered = inModel(s);
          return (
            <div
              key={s.key}
              className={`tile fx-card grid grid-cols-[minmax(0,1fr)_130px_92px] items-center gap-3 rounded-[14px]! px-4 py-3 ${focused ? 'border-accent! bg-card-2!' : ''}`}
              style={{ opacity: registered ? 0.55 : 1, animationDelay: `${k * 40}ms`, animationDuration: '0.5s' }}
            >
              <button
                type="button"
                onClick={() => setFocus(s.key)}
                aria-label={`プレビュー: ${s.name}`}
                className="grid min-w-0 cursor-pointer grid-cols-[minmax(0,1fr)_86px] items-center gap-3 border-0 bg-transparent p-0 text-left font-[inherit] text-text"
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-bold">{s.name}</span>
                    <span className="rounded-full bg-raised px-2 py-0.5 text-[10px] text-sub">{s.cat}</span>
                    {registered && <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[10px] text-ok">モデルに登録済</span>}
                  </span>
                  <span className="truncate text-[11px] text-sub">{s.def}</span>
                </span>
                <TriSpark likely={s.tri[1]} on={on} height={24} />
              </button>
              <span className="n whitespace-nowrap text-[12px] text-sub">{triText(...s.tri)}</span>
              <button
                type="button"
                className={`btn min-h-8 rounded-full px-3 text-[12px] font-bold ${
                  registered ? 'cursor-default border border-line bg-transparent text-weak' : on ? 'cursor-pointer border-0 bg-accent text-bg' : 'cursor-pointer border border-muted bg-transparent text-text'
                }`}
                disabled={registered}
                aria-pressed={registered ? undefined : on}
                aria-label={registered ? `登録済: ${s.name}` : (on ? '選択を外す: ' : '追加: ') + s.name}
                onClick={() => toggle(s)}
              >
                {registered ? '登録済' : on ? '✓ 追加' : '+ 追加'}
              </button>
            </div>
          );
        })}
        {shown.length === 0 && <p className="px-1 text-[12px] text-weak">該当する標準要因はありません。</p>}
      </div>

      <aside aria-label="プレビュー" className="tile fx-static col-span-12 flex min-w-0 flex-col gap-3.5 px-6 py-[22px] xl:col-span-5" style={{ animationDelay: '120ms' }}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-sub">プレビュー</span>
          <span className="rounded-full bg-raised px-[9px] py-[3px] text-[10px] text-sub">
            {fo.cat} ・ {fo.kind === 'direct' ? '直接要因' : '間接要因'}
          </span>
        </div>
        <h2 className="n m-0 text-[20px]">{fo.name}</h2>
        <p className="m-0 text-[12px] leading-[1.6] text-sub">{fo.def}</p>
        <div className="flex flex-col gap-1.5">
          {fo.levels.map((t, i) => (
            <div key={i} className="flex items-center gap-2.5 text-[12px]">
              <LevelBadge level={i} size={28} />
              <span>{t}</span>
            </div>
          ))}
        </div>
        <TriangleShape height={110} series={[{ tri: fo.tri, stroke: 'var(--accent)', fill: 'var(--accent)' }]} />
        <div className="grid grid-cols-3 gap-2">
          <div className={statBox}><span className="text-[10px] text-sub">最良</span><span className="n text-[18px]">+{fo.tri[0]}%</span></div>
          <div className={statBox}><span className="text-[10px] text-sub">最頻</span><span className="n text-[18px] text-accent">+{fo.tri[1]}%</span></div>
          <div className={statBox}><span className="text-[10px] text-sub">最悪</span><span className="n text-[18px] text-coral">+{fo.tri[2]}%</span></div>
        </div>
        {fo.kind === 'indirect' && !inModel(fo) && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="std-target" className="text-[11px] text-sub">影響を強める直接要因 (間接要因は直接要因 1 つにつき 1 つまで)</label>
            {targetOptions(fo.key).length ? (
              <select
                id="std-target"
                className="fx-field"
                value={targets[fo.key] ?? ''}
                onChange={(e) => {
                  setTargets((m) => ({ ...m, [fo.key]: e.target.value }));
                  if (e.target.value && !sel.includes(fo.key)) setSel((xs) => [...xs, fo.key]);
                }}
              >
                <option value="">選択してください</option>
                {targetOptions(fo.key).map((f) => (
                  <option key={f.id} value={f.id}>{factorNo(f.no)} {f.name}</option>
                ))}
              </select>
            ) : (
              <span className="text-[11px] text-coral-soft">間接要因を付けられる直接要因がありません。</span>
            )}
          </div>
        )}
        <span className="text-[11px] text-weak">標準の三角分布は「{STANDARD_EXPERT}」という担当者名で入ります。追加後に自社の担当者の分布を足せます。</span>

        <div className="mt-auto flex flex-col gap-2 border-t border-line pt-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-sub">モデルに追加する要因</span>
            <span className="n text-[16px] text-accent">{n}</span>
          </div>
          <div className="flex min-h-7 flex-wrap gap-1.5">
            {selected.map((s) => (
              <button
                key={s.key}
                type="button"
                className="fx-chip inline-flex min-h-7 cursor-pointer items-center gap-1.5 rounded-full border border-muted bg-raised px-2.5 font-[inherit] text-[11px] text-text"
                aria-label={`外す: ${s.name}`}
                onClick={() => toggle(s)}
              >
                {s.name} <span className="text-sub">×</span>
              </button>
            ))}
            {n === 0 && <span className="self-center text-[11px] text-weak">一覧の「+ 追加」で選んでください</span>}
          </div>
          {needsTarget.length > 0 && (
            <span className="text-[11px] text-coral-soft">間接要因「{needsTarget.map((s) => s.name).join('」「')}」が強める直接要因をプレビューで選んでください。</span>
          )}
          {err && <span role="alert" className="text-[11px] text-coral-soft">{err instanceof ApiError ? err.message : '追加できませんでした。'}</span>}
          <button
            type="button"
            className="btn inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border-0 font-[inherit] text-[13px] font-bold disabled:cursor-default enabled:bg-accent enabled:text-bg disabled:bg-raised disabled:text-weak"
            disabled={!ready}
            onClick={add}
          >
            {create.isPending ? '追加しています…' : n ? `${n} 件をモデルに追加` : 'モデルに追加'}
          </button>
        </div>
      </aside>
    </section>
  );
}
