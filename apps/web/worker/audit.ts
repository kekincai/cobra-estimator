import type { Context } from 'hono';
import { auditLog } from './db/schema';
import type { AppEnv } from './env';

export async function audit(c: Context<AppEnv>, action: string, detail?: unknown) {
  await c.var.db.insert(auditLog).values({ actor: c.var.user?.email ?? 'anonymous', action, detail: detail ?? null });
}
