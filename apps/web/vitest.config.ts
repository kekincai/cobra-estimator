// テスト用設定（Cloudflare プラグインは使わない）。UI テストで DOM が要るときは jsdom を追加する。
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'worker/**/*.test.ts', 'shared/**/*.test.ts'],
    passWithNoTests: true,
  },
});
