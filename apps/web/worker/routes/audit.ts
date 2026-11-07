import { desc } from 'drizzle-orm';
import { Hono } from 'hono';
import { auditLog, users } from '../db/schema';
import type { AppEnv } from '../env';

export const AUDIT_LIMIT_DEFAULT = 10;
export const AUDIT_LIMIT_MAX = 50;

/** ?limit= を 1〜50 に丸める（不正値は既定 10） */
export function parseLimit(raw: string | undefined): number {
  const n = Number(raw);
  if (!raw || !Number.isFinite(n)) return AUDIT_LIMIT_DEFAULT;
  return Math.max(1, Math.min(AUDIT_LIMIT_MAX, Math.floor(n)));
}

/** メールアドレスは返さない: users にあれば表示名、なければ @ より前 */
export function actorName(actor: string, names: Map<string, string>): string {
  return names.get(actor) ?? actor.split('@')[0] ?? actor;
}

export const auditRoute = new Hono<AppEnv>()
  /** 最近の操作（新しい順）。ダッシュボードの「最近の操作」用 */
  .get('/', async (c) => {
    const limit = parseLimit(c.req.query('limit'));
    const db = c.var.db;
    const [rows, us] = await Promise.all([
      db.select().from(auditLog).orderBy(desc(auditLog.id)).limit(limit),
      db.select({ email: users.email, name: users.name }).from(users),
    ]);
    const names = new Map(us.map((u) => [u.email, u.name]));
    return c.json(rows.map((r) => ({ id: r.id, at: r.at, actor: actorName(r.actor, names), action: r.action, detail: r.detail })));
  });
