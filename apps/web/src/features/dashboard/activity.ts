// 監査ログ 1 行 → 「最近の操作」の表示文。
// action は worker の audit(c, '…') と auditLog への直接 insert の全種類を日本語にする。
// 英語の内部 key（user.remove など）は画面に出さない。知らない action は「その他の操作」。
import type { FactorRow, ModelVersionRow, Role } from '../../../shared/types';
import { factorNo } from '../../ui/format';
import { fmtSco } from './format';
import type { AuditEntry } from './useAudit';
import type { GenView } from './useDashboard';

export type FeedTone = 'accent' | 'info' | 'teal' | 'coral';
export interface FeedItem {
  id: number;
  title: string;
  /** 対象の補足（世代名・α など）。無ければ空 */
  sub: string;
  /** 操作した人の表示名 */
  actor: string;
  tone: FeedTone;
  at: string;
}

export interface FeedCtx {
  gens: GenView[];
  sco: (g: GenView) => number | null;
  versions: Pick<ModelVersionRow, 'id' | 'version' | 'mmre'>[];
  factors: Pick<FactorRow, 'id' | 'no' | 'name'>[];
}

/** ダッシュボードの流れに関係しない記録（ログインは数が多く、ほかの操作を押し流す） */
export const FEED_HIDDEN_ACTIONS: ReadonlySet<string> = new Set(['auth.login']);

const ROLE_LABEL: Record<Role, string> = { admin: 'モデル管理者', estimator: '見積り担当', pmo: 'PMO' };

const obj = (d: unknown): Record<string, unknown> => (d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const roleLabel = (v: unknown) => (typeof v === 'string' && v in ROLE_LABEL ? ROLE_LABEL[v as Role] : '');
const quoted = (s: string) => (s ? `「${s}」` : '');
const join = (...xs: (string | null | undefined | false)[]) => xs.filter(Boolean).join('、');

/** 取り込み・書き出しの補足: 件数があれば「要因 2 件追加、実績 3 件」 */
function transferSub(d: Record<string, unknown>): string {
  const fa = num(d.factorsAdded);
  const fu = num(d.factorsUpdated);
  const pa = num(d.projectsAdded);
  return join(fa ? `要因 ${fa} 件追加` : '', fu ? `要因 ${fu} 件更新` : '', pa ? `実績 ${pa} 件追加` : '');
}

export function describeAudit(e: AuditEntry, ctx: FeedCtx, firstRun: boolean): FeedItem {
  const d = obj(e.detail);
  const base = { id: e.id, at: e.at, actor: str(e.actor) || '不明な利用者' };
  switch (e.action) {
    case 'estimate.run': {
      const g = ctx.gens.find((x) => x.id === d.generation);
      const sco = g ? ctx.sco(g) : null;
      const sub = g ? join(g.name, `規模 ${g.sizeFP.toLocaleString('en-US')} FP`, sco != null ? `ΣCO ${fmtSco(sco)}` : '') : '';
      return { ...base, title: g ? `${g.label} を実行` : '見積りを実行', sub, tone: firstRun ? 'accent' : 'info' };
    }
    case 'estimate.create':
      return { ...base, title: '見積りを作成', sub: '', tone: 'info' };
    case 'model.build': {
      const alpha = num(d.alpha);
      const v = ctx.versions.find((x) => x.version === d.version);
      const version = num(d.version);
      return {
        ...base,
        title: version != null ? `モデル v${version} を構築` : 'モデルを構築',
        sub: join(alpha != null ? `α ${alpha.toFixed(4)}` : '', v?.mmre != null ? `MMRE ${(v.mmre * 100).toFixed(1)}%` : ''),
        tone: 'teal',
      };
    }
    case 'model.activate': {
      const v = ctx.versions.find((x) => x.id === d.id);
      return { ...base, title: v ? `見積りに使うモデルを v${v.version} に切替` : '見積りに使うモデルを切替', sub: '', tone: 'teal' };
    }
    case 'factor.create':
      return { ...base, title: `要因${quoted(str(d.name))}を追加`, sub: '', tone: 'info' };
    case 'factor.update':
    case 'factor.delete': {
      const f = ctx.factors.find((x) => x.id === d.id);
      const name = f?.name ?? str(d.name);
      const label = f ? `要因 ${factorNo(f.no)}` : '要因';
      return e.action === 'factor.update'
        ? { ...base, title: `${label} を更新`, sub: name, tone: 'info' }
        : { ...base, title: `${label} を削除`, sub: name, tone: 'coral' };
    }
    case 'project.create':
      return { ...base, title: str(d.id) ? `実績 ${str(d.id)} を登録` : '実績を登録', sub: '', tone: 'info' };
    case 'project.update':
      return { ...base, title: str(d.id) ? `実績 ${str(d.id)} を更新` : '実績を更新', sub: '', tone: 'info' };
    case 'project.delete':
      return { ...base, title: str(d.id) ? `実績 ${str(d.id)} を削除` : '実績を削除', sub: '', tone: 'coral' };
    case 'transfer.import':
      return { ...base, title: 'モデルパラメータを取り込み', sub: transferSub(d), tone: 'info' };
    case 'transfer.export':
      return { ...base, title: 'モデルパラメータを書き出し', sub: '', tone: 'info' };
    case 'transfer.submit':
      return { ...base, title: '管理者へアップロード', sub: '', tone: 'info' };
    case 'transfer.review': {
      const st = str(d.status);
      const title = st === 'approved' ? 'アップロードを承認' : st === 'rejected' ? 'アップロードを却下' : 'アップロードを確認';
      return { ...base, title, sub: str(d.note), tone: st === 'rejected' ? 'coral' : 'teal' };
    }
    case 'user.add':
      return { ...base, title: `利用者${quoted(str(d.name))}を追加`, sub: roleLabel(d.role), tone: 'info' };
    case 'user.update': {
      const who = str(d.name) || str(d.target);
      return { ...base, title: `利用者${quoted(who)}を更新`, sub: roleLabel(d.role) ? `権限を${roleLabel(d.role)}に変更` : '', tone: 'info' };
    }
    case 'user.remove':
      return { ...base, title: `利用者${quoted(str(d.target))}を削除`, sub: '', tone: 'coral' };
    case 'auth.login':
      return { ...base, title: 'ログイン', sub: str(d.via) === 'github' ? 'GitHub' : '', tone: 'info' };
    default:
      return { ...base, title: 'その他の操作', sub: '', tone: 'info' };
  }
}

/** 表示する行（ログインなどを除いて先頭 limit 件） */
export function describeFeed(entries: AuditEntry[], ctx: FeedCtx, limit = Infinity): FeedItem[] {
  const shown = entries.filter((e) => !FEED_HIDDEN_ACTIONS.has(e.action)).slice(0, limit);
  const firstRunId = shown.find((e) => e.action === 'estimate.run')?.id;
  return shown.map((e) => describeAudit(e, ctx, e.id === firstRunId));
}
