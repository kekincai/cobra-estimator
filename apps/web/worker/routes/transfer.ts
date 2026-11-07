import { desc } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { audit } from '../audit';
import { requireRole } from '../auth';
import { submissions } from '../db/schema';
import type { AppEnv } from '../env';

// JSON / CSV の解析はブラウザ側。ここでは監査ログと「管理者へアップロード」（Submission）のみ。
// TODO(transfer): 取り込み確定 API（要因・実績の一括登録、同名要因の衝突処理）
export const transferRoute = new Hono<AppEnv>()
  .post('/audit', requireRole(), async (c) => {
    const body = z.object({ action: z.enum(['import', 'export']), detail: z.unknown() }).parse(await c.req.json());
    await audit(c, `transfer.${body.action}`, body.detail);
    return c.json({ ok: true });
  })
  .get('/submissions', requireRole(), async (c) => c.json(await c.var.db.select().from(submissions).orderBy(desc(submissions.createdAt))))
  .post('/submissions', requireRole(), async (c) => {
    const body = z.object({ modelVersionId: z.string(), payload: z.unknown(), note: z.string().default('') }).parse(await c.req.json());
    const id = crypto.randomUUID();
    await c.var.db.insert(submissions).values({ id, ...body, payload: body.payload ?? null, submittedBy: c.var.user!.email });
    await audit(c, 'transfer.submit', { id });
    return c.json({ id }, 201);
  });
