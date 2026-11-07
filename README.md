# Estima — CoBRA 法 工数見積り

CoBRA 法（Cost estimation, Benchmarking, and Risk Assessment）で、ソフトウェア開発の工数を見積もる Web アプリです。

**工数 = α × 規模 × (1 + ΣCO)**
- α は過去の実績データから推定します。
- ΣCO は、専門家が三角分布で与えた変動要因から求めます。
- モンテカルロ法で工数の分布を出し、リスク評価と A4 レポートまで作れます。

IPA「CoBRA法に基づく見積り支援ツール」（Excel 版）の考え方を引き継いでいます。

- 本番: https://cobra.kejincai.dev
- 仕様: [IMPLEMENTATION_BRIEF.md](IMPLEMENTATION_BRIEF.md)
- 設計稿: [design/](design/)（`*.dc.html`。ブラウザで開くと操作できます）

## 構成

| パス | 内容 |
|---|---|
| `packages/cobra-core` | 計算（三角分布・モンテカルロ・α 推定・交差検証・超過確率・打ち手）。DOM 非依存 |
| `apps/web/src` | React SPA（Vite + React Router + TanStack Query + Tailwind v4） |
| `apps/web/worker` | API（Hono on Cloudflare Workers）+ D1（Drizzle） |
| `apps/web/migrations` | D1 マイグレーション（`0001_seed.sql` は seed。手で編集しない） |

計算はすべてブラウザ側の Web Worker で実行します。Workers 無料枠には 1 リクエスト 10 ms の CPU 制限があるため、API は保存と読み出しだけを担当します。

## 開発

```bash
pnpm install
cp apps/web/.dev.vars.example apps/web/.dev.vars   # AUTH_MODE=dev（ローカルでは admin 扱い）
pnpm --filter web db:migrate:local
pnpm dev                                           # http://localhost:5173
```

```bash
pnpm check     # typecheck + test + build
```

## デプロイ

```bash
pnpm run deploy    # build → D1 migrations (remote) → wrangler deploy
```

本番では、書き込み API に Cloudflare Access の認証が必要です（未設定のあいだは読み取り専用）。

## ライセンス

MIT
