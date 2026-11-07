import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type * as schema from './db/schema';

export type Role = 'admin' | 'estimator' | 'pmo';
export interface User {
  email: string;
  name: string;
  role: Role;
}

export interface AppEnv {
  Bindings: Env;
  Variables: {
    db: DrizzleD1Database<typeof schema>;
    /** 未認証（本番で Access 未設定）なら null → 書き込み不可 */
    user: User | null;
  };
}

/** シングルテナント MVP: モデルは 1 つ */
export const MODEL_ID = 'default';
