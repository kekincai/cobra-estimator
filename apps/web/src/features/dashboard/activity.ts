// 監査ログ 1 行 → 「最近の操作」の表示文
import type { FactorRow, ModelVersionRow } from '../../../shared/types';
import { factorNo } from '../../ui/format';
import { fmtSco } from './format';
import type { AuditEntry } from './useAudit';
import type { GenView } from './useDashboard';

export type FeedTone = 'accent' | 'info' | 'teal' | 'coral';
export interface FeedItem {
  id: number;
  title: string;
  sub: string;
  tone: FeedTone;
  at: string;
}

interface Ctx {
  gens: GenView[];
  sco: (g: GenView) => number | null;
  versions: ModelVersionRow[];
  factors: FactorRow[];
}

const obj = (d: unknown): Record<string, unknown> => (d && typeof d === 'object' ? (d as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function describeAudit(e: AuditEntry, ctx: Ctx, firstRun: boolean): FeedItem {
  const d = obj(e.detail);
  const base = { id: e.id, at: e.at };
  const by = `${e.actor}`;
  switch (e.action) {
    case 'estimate.run': {
      const g = ctx.gens.find((x) => x.id === d.generation);
      const sco = g ? ctx.sco(g) : null;
      const parts = g ? [g.name, `規模 ${g.sizeFP.toLocaleString('en-US')} FP`, sco != null ? `ΣCO ${fmtSco(sco)}` : ''].filter(Boolean) : [by];
      return { ...base, title: `${g?.label ?? '見積り'} を実行`, sub: parts.join('、'), tone: firstRun ? 'accent' : 'info' };
    }
    case 'estimate.create':
      return { ...base, title: '見積りを作成', sub: by, tone: 'info' };
    case 'model.build': {
      const alpha = typeof d.alpha === 'number' ? `α ${d.alpha.toFixed(4)}` : '';
      const v = ctx.versions.find((x) => x.version === d.version);
      const mmre = v?.mmre != null ? `MMRE ${(v.mmre * 100).toFixed(1)}%` : '';
      return { ...base, title: `モデル v${String(d.version ?? '?')} を構築`, sub: [alpha, mmre].filter(Boolean).join('、') || by, tone: 'teal' };
    }
    case 'model.activate': {
      const v = ctx.versions.find((x) => x.id === d.id);
      return { ...base, title: `モデル ${v ? `v${v.version}` : ''} を採用`.replace('  ', ' '), sub: by, tone: 'teal' };
    }
    case 'factor.create':
      return { ...base, title: `要因「${str(d.name)}」を追加`, sub: by, tone: 'info' };
    case 'factor.update':
    case 'factor.delete': {
      const f = ctx.factors.find((x) => x.id === d.id);
      const label = f ? `要因 ${factorNo(f.no)}` : '要因';
      return e.action === 'factor.update'
        ? { ...base, title: `${label} を更新`, sub: f?.name ?? by, tone: 'info' }
        : { ...base, title: `${label} を削除`, sub: by, tone: 'coral' };
    }
    case 'project.create':
      return { ...base, title: `${str(d.id) || '実績'} を登録`, sub: by, tone: 'info' };
    case 'project.update':
      return { ...base, title: `${str(d.id) || '実績'} を更新`, sub: by, tone: 'info' };
    case 'project.delete':
      return { ...base, title: `${str(d.id) || '実績'} を削除`, sub: by, tone: 'coral' };
    case 'transfer.import':
      return { ...base, title: 'モデルパラメータを取り込み', sub: by, tone: 'info' };
    case 'transfer.export':
      return { ...base, title: 'モデルパラメータを書き出し', sub: by, tone: 'info' };
    case 'transfer.submit':
      return { ...base, title: '管理者へアップロード', sub: by, tone: 'info' };
    default:
      return { ...base, title: e.action, sub: by, tone: 'info' };
  }
}

export function describeFeed(entries: AuditEntry[], ctx: Ctx): FeedItem[] {
  const firstRunId = entries.find((e) => e.action === 'estimate.run')?.id;
  return entries.map((e) => describeAudit(e, ctx, e.id === firstRunId));
}
