// 変動要因（design/Factors.dc.html）: 一覧 + カテゴリ絞り込み + 担当者切替、右側で編集。
import { levelOf } from 'cobra-core';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { categoriesOf, expertsOf, triText, useFactorContext } from '../features/factors/data';
import { AVERAGE, FactorDetail, contribLabel, draftFromRow, triOf, type FactorDraft } from '../features/factors/FactorDetail';
import { FilterChip, Segmented } from '../features/factors/Pills';
import '../features/factors/factors.css';
import { TriSpark } from '../ui/TriSpark';
import { factorNo } from '../ui/format';

export default function FactorsPage() {
  const { data, isLoading, error, projects, canEdit } = useFactorContext();
  const [params, setParams] = useSearchParams();
  const [cat, setCat] = useState<string | null>(null);
  const [expertPick, setExpert] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, FactorDraft>>({});

  if (isLoading) return <div className="p-8 text-sub">読み込み中…</div>;
  if (error || !data) return <div className="p-8 text-coral-soft">モデルを読み込めませんでした。</div>;

  const { bundle, factors, gen, contrib, multiplier } = data;
  const experts = expertsOf(factors);
  const expert = expertPick ?? experts[0] ?? AVERAGE;
  const cats = categoriesOf(factors);
  const sel = factors.find((f) => f.id === params.get('f')) ?? factors[0];
  const draftOf = (id: string) => drafts[id] ?? draftFromRow(factors.find((f) => f.id === id)!);
  const shown = factors.filter((f) => cat === null || f.category === cat);
  const nDirect = factors.filter((f) => f.kind === 'direct').length;
  const pick = (id: string) => setParams({ f: id }, { replace: true, preventScrollReset: true });

  return (
    <div className="flex flex-col gap-5 px-8 pt-6 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="inline-flex items-center gap-2 text-[11px] text-sub">
            <span className="size-1.5 rounded-full bg-teal" />
            {bundle.model.name}
            {bundle.activeVersion ? ` v${bundle.activeVersion.version}` : ''}
          </span>
          <h1 className="n m-0 text-[30px] leading-[1.1]">
            変動要因{' '}
            <span className="text-[16px] font-medium tracking-normal text-weak">
              {factors.length} 要因 ・ 直接 {nDirect} ・ 間接 {factors.length - nDirect} ・ 三角分布 {experts.length} 名
            </span>
          </h1>
          <span className="text-[12px] text-sub">工数を押し上げる要因と、その程度 (三角分布) を定義します。間接要因は直接要因の影響を強めます。</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/model/factors/new?tab=standard" className="btn inline-flex min-h-10 items-center rounded-[10px] border border-muted bg-card px-3.5 text-[13px] font-medium text-text! no-underline">
            標準要因から選ぶ
          </Link>
          <Link to="/model/factors/new" className="btn inline-flex min-h-10 items-center rounded-[10px] bg-accent px-4 text-[13px] font-bold text-bg! no-underline">
            + 要因を追加
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-12 items-start gap-4">
        <div className="col-span-12 flex min-w-0 flex-col gap-2.5 xl:col-span-7">
          <div className="flex flex-wrap items-center gap-1.5 px-0.5 pb-1">
            <FilterChip on={cat === null} onClick={() => setCat(null)}>すべて {factors.length}</FilterChip>
            {cats.map((c) => (
              <FilterChip key={c} on={cat === c} onClick={() => setCat(c)}>
                {c} {factors.filter((f) => f.category === c).length}
              </FilterChip>
            ))}
            <div className="grow" />
            <span className="text-[11px] text-weak">分布の担当者:</span>
            <Segmented label="分布の担当者" size="xs" value={expert} onChange={setExpert} options={[...experts, AVERAGE].map((e) => ({ value: e, label: e }))} />
          </div>

          {shown.map((f, k) => {
            const on = f.id === sel?.id;
            const t = triOf(draftOf(f.id), expert);
            const helper = factors.find((x) => x.kind === 'indirect' && x.targetFactorId === f.id);
            const target = factors.find((x) => x.id === f.targetFactorId);
            const meta = f.kind === 'indirect' ? `間接 → ${target?.name ?? '(未設定)'}を増幅` : helper ? `間接要因「${helper.name}」が強める` : '直接';
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={on}
                onClick={() => pick(f.id)}
                className={`tile fx-card grid w-full grid-cols-[36px_minmax(0,1fr)_90px_150px] items-center gap-4 px-[18px] py-3.5 text-left font-[inherit] text-text ${on ? 'border-accent! bg-card-2!' : ''}`}
                style={{ animationDelay: `${k * 50}ms` }}
              >
                <span className={`n text-[14px] ${on ? 'text-accent' : 'text-weak'}`}>{factorNo(f.no)}</span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[15px] font-bold">{f.name}</span>
                    <span className={`rounded-full px-[7px] py-0.5 text-[10px] font-bold ${f.kind === 'direct' ? 'bg-raised text-sub' : 'bg-info-soft text-info-text'}`}>
                      {f.kind === 'direct' ? '直接' : '間接'}
                    </span>
                  </span>
                  <span className="truncate text-[11px] text-sub">
                    {f.category} ・ {meta}
                  </span>
                </span>
                <TriSpark likely={t[1]} on={on} width={90} />
                <span className="n w-[150px] text-right text-[13px] text-text">{triText(t[0], t[1], t[2])}</span>
              </button>
            );
          })}
          {shown.length === 0 && <p className="px-1 text-[12px] text-weak">このカテゴリの要因はありません。</p>}
        </div>

        {sel ? (
          <FactorDetail
            factor={sel}
            factors={factors}
            draft={draftOf(sel.id)}
            dirty={!!drafts[sel.id]}
            expert={expert}
            experts={experts}
            canEdit={canEdit}
            setDraft={(fn) => setDrafts((m) => ({ ...m, [sel.id]: fn(m[sel.id] ?? draftFromRow(sel)) }))}
            resetDraft={() =>
              setDrafts((m) => {
                const { [sel.id]: _, ...rest } = m;
                return rest;
              })
            }
            stats={{
              genLabel: gen.label,
              level: data.levelOf(sel.id),
              l3n: projects.filter((p) => levelOf(p.levels, sel.id) === 3).length,
              total: projects.length,
              contrib: contribLabel(sel, contrib[sel.id], multiplier(sel)),
            }}
            onDeleted={() => setParams({}, { replace: true })}
          />
        ) : (
          <aside className="tile fx-static col-span-12 p-6 text-[13px] text-sub xl:col-span-5">
            要因がありません。「+ 要因を追加」から定義してください。
          </aside>
        )}
      </section>
    </div>
  );
}
