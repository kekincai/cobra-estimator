import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { authenticate } from './auth';
import * as schema from './db/schema';
import type { AppEnv } from './env';
import { auditRoute } from './routes/audit';
import { estimatesRoute } from './routes/estimates';
import { factorsRoute } from './routes/factors';
import { modelRoute } from './routes/model';
import { projectsRoute } from './routes/projects';
import { transferRoute } from './routes/transfer';

const app = new Hono<AppEnv>().basePath('/api');

app.use('*', async (c, next) => {
  c.set('db', drizzle(c.env.DB, { schema }));
  return next();
});
app.use('*', authenticate);

app.get('/health', (c) => c.json({ ok: true }));
app.get('/me', (c) => c.json({ user: c.var.user }));

const routes = app
  .route('/model', modelRoute)
  .route('/factors', factorsRoute)
  .route('/projects', projectsRoute)
  .route('/estimates', estimatesRoute)
  .route('/transfer', transferRoute)
  .route('/audit', auditRoute);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

export type AppType = typeof routes;

export default { fetch: app.fetch } satisfies ExportedHandler<Env>;
