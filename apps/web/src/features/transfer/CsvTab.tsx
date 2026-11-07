// タブ 3: CSV で実績を取り込む（列の対応付け → 検証 → 問題のない行を登録）
import { DEFAULT_UNITS } from 'cobra-core';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { ModelBundle, ProjectRow, Role, TransferProjectInsert } from '../../../shared/types';
import { fmt1, fmtInt } from '../../ui/format';
import { useImportCommit } from './api';
import { checkMapping, guessMapping, parseCsv, summarize, targetOptions, validateRows, type CsvRow, type EffortUnit, type SizeUnit, type TargetKey } from './csv';
import { decodeAuto } from './decode';
import { cx, DropZone, FileHead, ghostBtn, KV, primaryBtn, Seg, tdCls, thCls, Tile, TileHead } from './ui';

const MAX_BYTES = 2 * 1024 * 1024;
const SIZE_UNITS: { key: SizeUnit; label: string }[] = [
  { key: 'FP', label: 'FP' },
  { key: 'KLOC', label: 'KLOC' },
  { key: 'screen', label: '画面数' },
];
const EFFORT_UNITS: { key: EffortUnit; label: string }[] = [
  { key: 'MM', label: '人月' },
  { key: 'hours', label: '人時' },
];

interface Loaded {
  fileName: string;
  encoding: string;
  headers: string[];
  rows: string[][];
}

export function CsvTab({ bundle, projects, role }: { bundle: ModelBundle; projects: ProjectRow[]; role: Role | null }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const factors = useMemo(() => [...bundle.factors].sort((a, b) => a.no - b.no).map((f) => ({ id: f.id, no: f.no, name: f.name })), [bundle.factors]);
  const [map, setMap] = useState<TargetKey[]>([]);
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>('FP');
  const [effortUnit, setEffortUnit] = useState<EffortUnit>('MM');

  const onFile = async (f: File) => {
    setError(null);
    if (f.size > MAX_BYTES) return setError('ファイルが大きすぎます (2 MB まで)');
    const d = decodeAuto(await f.arrayBuffer());
    const all = parseCsv(d.text);
    if (all.length < 2) return setError(`${f.name}: 見出し行とデータ行が必要です`);
    const headers = all[0]!.map((h) => h.trim());
    const g = guessMapping(headers, factors);
    setMap(g.map);
    if (g.sizeUnit) setSizeUnit(g.sizeUnit);
    if (g.effortUnit) setEffortUnit(g.effortUnit);
    setLoaded({ fileName: f.name, encoding: d.encoding, headers, rows: all.slice(1) });
  };

  if (!loaded)
    return (
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4">
        <div className="flex flex-col gap-4">
          {error && <div role="alert" className="tile border-coral/40 px-[22px] py-4 text-[12px] text-coral-soft">{error}</div>}
          <DropZone
            accept=".csv,.tsv,.txt,text/csv"
            onFile={onFile}
            title="実績データ CSV をここにドロップ"
            sub={<>または <span className="text-accent underline">ファイルを選ぶ</span> ・ .csv (UTF-8 / Shift-JIS は自動判定)</>}
            note="1 行目は見出し。列の対応と内容を確認してから登録します。"
          />
        </div>
        <Tile delay={80} className="flex flex-col gap-2.5 self-start">
          <span className="text-[14px] font-bold">CSV の形</span>
          <span className="text-[12px] leading-[1.7] text-sub">
            必須はプロジェクト名・規模・工数の 3 列。要因ごとにレベル (0〜3) の列を置けます。列が無い要因は L0 になります。見出し名から列の対応を自動で推定します。
          </span>
          <pre className="m-0 overflow-auto rounded-xl border border-line bg-bg px-4 py-3 font-num text-[11.5px] leading-[1.65] text-text/80">
            {`name,fp,mm,${factors.map((f) => `f${f.no}`).join(',')},note\nPJ-2024-01,860,19.5,${factors.map(() => '1').join(',')},保守移管あり`}
          </pre>
        </Tile>
      </div>
    );

  return (
    <CsvMapped
      key={loaded.fileName}
      loaded={loaded}
      bundle={bundle}
      projects={projects}
      role={role}
      factors={factors}
      map={map}
      setMap={setMap}
      sizeUnit={sizeUnit}
      setSizeUnit={setSizeUnit}
      effortUnit={effortUnit}
      setEffortUnit={setEffortUnit}
      onReset={() => setLoaded(null)}
    />
  );
}

function CsvMapped(p: {
  loaded: Loaded;
  bundle: ModelBundle;
  projects: ProjectRow[];
  role: Role | null;
  factors: { id: string; no: number; name: string }[];
  map: TargetKey[];
  setMap: (m: TargetKey[]) => void;
  sizeUnit: SizeUnit;
  setSizeUnit: (u: SizeUnit) => void;
  effortUnit: EffortUnit;
  setEffortUnit: (u: EffortUnit) => void;
  onReset: () => void;
}) {
  const { loaded, map, factors } = p;
  const units = p.bundle.model.units ?? DEFAULT_UNITS;
  const targets = useMemo(() => targetOptions(factors), [factors]);
  const label = (k: TargetKey) => targets.find((t) => t.key === k)?.label ?? k;
  const mapping = checkMapping(map);
  // 登録後は登録時点の検証結果を固定する（再取得した一覧と照合すると全行が「既存と同名」になるため）
  const [frozen, setFrozen] = useState<CsvRow[] | null>(null);
  const live = useMemo(
    () => validateRows(loaded.rows, map, { factors, sizeUnit: p.sizeUnit, effortUnit: p.effortUnit, units, existing: p.projects }),
    [loaded.rows, map, factors, p.sizeUnit, p.effortUnit, units, p.projects],
  );
  const rows = frozen ?? live;
  const sum = summarize(rows);
  const commit = useImportCommit();
  const [registered, setRegistered] = useState<string[] | null>(null);
  const group = p.bundle.groups.find((g) => g.id === 'A') ?? p.bundle.groups[0];
  const groupId = group?.id ?? 'A';
  const allowed = p.role === 'admin' || p.role === 'pmo';
  const okCount = mapping.ok ? sum.ok.length : 0;
  const problems = rows.filter((r) => !r.ok);

  const cycle = (i: number, back: boolean) => {
    if (frozen) return;
    const keys = targets.map((t) => t.key);
    const cur = keys.indexOf(map[i] ?? 'skip');
    const next = keys[(cur + (back ? keys.length - 1 : 1)) % keys.length]!;
    p.setMap(map.map((k, j) => (j === i ? next : k)));
  };

  const register = () => {
    const stamp = Date.now().toString(36).toUpperCase();
    const list: TransferProjectInsert[] = sum.ok.map((r, i) => ({
      id: `PJ-${stamp}-${String(i + 1).padStart(2, '0')}`,
      groupId,
      name: r.name,
      sizeFP: Math.round(r.sizeFP! * 100) / 100,
      effortMM: Math.round(r.effortMM! * 1000) / 1000,
      levels: r.levels,
      note: r.note,
      adopted: true,
      excludedReason: null,
    }));
    commit.mutate(
      {
        source: { kind: 'csv', fileName: loaded.fileName },
        groups: group ? [] : [{ id: 'A', name: 'A' }],
        factorsInsert: [],
        factorsUpdate: [],
        projects: list,
      },
      {
        onSuccess: () => {
          setFrozen(rows);
          setRegistered(list.map((x) => x.id));
        },
      },
    );
  };

  const effNote = p.effortUnit === 'hours' ? `人時は ÷${units.hoursPerMM} で人月に換算して登録` : '人月のまま登録';
  const sizeCell = (r: CsvRow) => {
    if (r.sizeFP == null) return r.sizeRaw || '—';
    if (p.sizeUnit === 'FP') return fmtInt(r.sizeFP);
    return `${r.sizeRaw} ${p.sizeUnit === 'KLOC' ? 'KLOC' : '画面'} → ${fmtInt(r.sizeFP)}`;
  };
  const effortCell = (r: CsvRow) => {
    if (r.effortMM == null) return r.effortRaw || '—';
    return p.effortUnit === 'hours' ? `${r.effortRaw} h → ${fmt1(r.effortMM)}` : fmt1(r.effortMM);
  };
  const reqText = mapping.missing.length
    ? `${mapping.missing.map(label).join(' / ')} の列が未指定`
    : mapping.duplicates.length
      ? `${mapping.duplicates.map(label).join(' / ')} に 2 列以上`
      : '名前・規模・工数 OK';
  const firstNames = (rs: CsvRow[]) => (rs.length ? ` (${rs.slice(0, 2).map((r) => r.name || `${r.line} 行目`).join(', ')}${rs.length > 2 ? ' ほか' : ''})` : '');
  const badLevel = sum.levelRange.flatMap((r) => r.issues.filter((i) => i.code === 'level-range').map((i) => i.value))[0];
  const done = registered != null;
  const ctaText = done
    ? `${registered.length} 件を登録しました`
    : !mapping.ok
      ? '必須の列を対応付けてください'
      : !allowed
        ? '登録には PMO 権限が必要です'
        : commit.isPending
          ? '登録しています…'
          : okCount
            ? `${okCount} 件を登録する`
            : '登録できる行がありません';

  return (
    <div className="grid grid-cols-[minmax(0,1.5fr)_360px] items-start gap-4">
      <div className="flex flex-col gap-4">
        <FileHead badge="CSV" badgeClass="text-info" name={loaded.fileName} meta={`${loaded.rows.length} 行 ・ ${loaded.headers.length} 列 ・ ${loaded.encoding} ・ 1 行目は見出し`}>
          <div className="ml-auto flex items-center gap-3.5">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-sub">規模の単位</span>
              <Seg label="規模の単位" options={SIZE_UNITS} value={p.sizeUnit} onChange={p.setSizeUnit} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-sub">工数の単位</span>
              <Seg label="工数の単位" options={EFFORT_UNITS} value={p.effortUnit} onChange={p.setEffortUnit} />
            </div>
          </div>
          <button type="button" onClick={p.onReset} className="btn min-h-8 cursor-pointer rounded-[10px] border border-muted bg-transparent px-3 text-[12px] text-sub hover:text-text">
            別のファイル
          </button>
        </FileHead>

        <Tile delay={80} className="flex flex-col gap-3">
          <TileHead title="列の対応付け" aside="右の項目をクリックすると切り替わります ・ 見出し名から自動で推定済み" />
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={cx(thCls, 'w-9')}>列</th>
                <th className={thCls}>CSV の見出し</th>
                <th className={thCls}>1 行目の値</th>
                <th className={cx(thCls, 'w-[220px]')}>登録する項目</th>
              </tr>
            </thead>
            <tbody>
              {loaded.headers.map((h, i) => {
                const k = map[i] ?? 'skip';
                const none = k === 'skip';
                const dup = mapping.duplicates.includes(k);
                return (
                  <tr key={i} className="transition-colors duration-200 hover:bg-card-2">
                    <td className={cx(tdCls, 'font-num text-weak tabular-nums')}>{i + 1}</td>
                    <td className={cx(tdCls, 'font-medium')}>{h || <span className="text-weak">(空)</span>}</td>
                    <td className={cx(tdCls, 'font-num text-sub tabular-nums')}>{loaded.rows[0]?.[i] ?? ''}</td>
                    <td className={tdCls}>
                      <button
                        type="button"
                        onClick={(e) => cycle(i, e.shiftKey)}
                        aria-label={`${i + 1} 列目「${h}」の登録先: ${label(k)}（クリックで切り替え、Shift で戻る）`}
                        className={cx(
                          'btn min-h-[30px] w-full cursor-pointer rounded-lg border px-3 text-left text-[12px]',
                          none ? 'border-line bg-transparent text-weak' : 'border-line-strong bg-raised text-text',
                          dup && 'border-coral/60',
                        )}
                      >
                        {label(k)}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Tile>

        <Tile delay={160} className="flex flex-col gap-3">
          <TileHead title={`登録前の確認 — 先頭 ${Math.min(5, rows.length)} 行`} aside={effNote} />
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={thCls}>プロジェクト名</th>
                <th className={cx(thCls, 'text-right')}>規模 (FP)</th>
                <th className={cx(thCls, 'text-right')}>工数 (人月)</th>
                <th className={thCls}>要因レベル {factors.length ? `${String(factors[0]!.no).padStart(2, '0')}–${String(factors.at(-1)!.no).padStart(2, '0')}` : ''}</th>
                <th className={thCls}>状態</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 5).map((r) => (
                <tr key={r.line} className="transition-colors duration-200 hover:bg-card-2">
                  <td className={cx(tdCls, 'font-medium')}>{r.name || <span className="text-weak">(空)</span>}</td>
                  <td className={cx(tdCls, 'text-right font-num tabular-nums')}>{sizeCell(r)}</td>
                  <td className={cx(tdCls, 'text-right font-num tabular-nums')}>{effortCell(r)}</td>
                  <td className={cx(tdCls, 'font-num tracking-[0.12em] text-sub tabular-nums')}>{r.levelsRaw.map((v) => v || '·').join(' ')}</td>
                  <td className={tdCls}>
                    <StatusChip row={r} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Tile>

        {problems.length > 0 && mapping.ok && (
          <Tile delay={200} className="flex flex-col gap-3">
            <TileHead title={`要修正の行 — ${problems.length} 行`} aside="登録されません。実績データの画面で直して登録してください" />
            <div className="flex flex-col gap-1 text-[12px]">
              {problems.map((r) => {
                const dup = r.issues.find((i) => i.code === 'dup-existing');
                return (
                  <div key={r.line} className="flex items-center gap-3 border-b border-line py-2">
                    <span className="w-14 shrink-0 font-num text-weak tabular-nums">{r.line} 行目</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{r.name || '(名前なし)'}</span>
                    <span className="shrink-0 text-coral-soft">{r.issues.map((i) => i.message).join(' ・ ')}</span>
                    {dup?.existingId ? (
                      <Link to={`/model/projects/${encodeURIComponent(dup.existingId)}`} className="shrink-0 text-[12px]">既存を開く</Link>
                    ) : (
                      <Link to="/model/projects/new" className="shrink-0 text-[12px]">新規で入力</Link>
                    )}
                  </div>
                );
              })}
            </div>
          </Tile>
        )}
      </div>

      <div className="sticky top-6 flex flex-col gap-4">
        <Tile delay={120} className="flex flex-col gap-3.5">
          <span className="text-[14px] font-bold">登録できるもの</span>
          <div className="flex items-baseline gap-2">
            <span className="n text-[36px] leading-none">{okCount}</span>
            <span className="text-[13px] text-sub">/ {rows.length} 行</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-[3px] bg-bg">
            <div className="h-full rounded-[3px] bg-accent transition-[width] duration-[600ms] ease-out-rise" style={{ width: `${rows.length ? (okCount / rows.length) * 100 : 0}%` }} />
          </div>
          <div className="flex flex-col gap-1.5 text-[12px]">
            <KV k="必須項目の対応">
              <span className={cx('font-bold', mapping.ok ? 'text-ok' : 'text-coral-soft')}>{reqText}</span>
            </KV>
            <KV k="工数が空">{sum.effortBlank.length} 行{firstNames(sum.effortBlank)}</KV>
            <KV k="レベル値が範囲外">{sum.levelRange.length} 行{badLevel ? ` (値 ${badLevel} → L0〜L3)` : ''}</KV>
            <KV k="既存と同名">{sum.duplicate.length} 行{firstNames(sum.duplicate)}</KV>
            {sum.other.length > 0 && <KV k="名前・規模の不備">{sum.other.length} 行{firstNames(sum.other)}</KV>}
          </div>
          <span className="text-[11px] leading-[1.6] text-weak">
            {problems.length ? `要修正の ${problems.length} 行は登録後に「実績データ」で直せます。` : ''}登録した件はすべて「採用」になります。グループは {groupId} に入ります。
          </span>
          {commit.isError && <span role="alert" className="text-[12px] text-coral-soft">{commit.error.message}</span>}
          <button type="button" disabled={done || !mapping.ok || !allowed || !okCount || commit.isPending} onClick={register} className={cx(primaryBtn, done && 'disabled:bg-ok/15 disabled:text-ok')}>
            {ctaText}
          </button>
          <Link to="/model/projects" className={ghostBtn}>実績データ一覧へ戻る</Link>
        </Tile>
      </div>
    </div>
  );
}

function StatusChip({ row }: { row: CsvRow }) {
  return (
    <span className={cx('rounded-full px-2 py-[3px] text-[10px] whitespace-nowrap', row.ok ? 'bg-ok/10 text-ok' : 'bg-coral/10 text-coral-soft')}>
      {row.ok ? '登録できます' : row.issues[0]!.message}
    </span>
  );
}
