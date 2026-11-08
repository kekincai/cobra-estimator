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

### 自動デプロイ（GitHub Actions）

`main` に push（PR のマージを含む）すると、`.github/workflows/ci.yml` が次の順に実行します。

1. `check` ジョブ: `pnpm check`（typecheck + test + build）
2. `deploy` ジョブ: `check` が通ったときだけ `pnpm run deploy`（build → D1 マイグレーション（remote）→ `wrangler deploy`）

- デプロイは `deploy-production` という concurrency グループで 1 本ずつ実行します。実行中のデプロイは途中で止めず、後から来たものは待ちます。
- `deploy` ジョブは GitHub の Environment `production` で動きます。承認者や対象ブランチを絞りたいときは Settings → Environments → `production` で保護ルールを追加してください。
- PR では `check` と `impeccable`（`npx impeccable@4.8.0 detect --github apps/web/src`）だけが動き、デプロイはしません。impeccable の指摘は PR 上に注釈で出て、1 件でもあるとジョブが失敗します。誤検知は該当行に `/* impeccable-disable-line <rule> -- 理由 */` を付けて抑止します。

### 必要なシークレット

Settings → Secrets and variables → Actions の **Repository secrets**（または Settings → Environments → `production` の **Environment secrets**）に追加します。

| 名前 | 値 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 下記の手順で作った API トークン |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare ダッシュボードの Workers & Pages 概要の右側にある Account ID |

どちらかが未設定だと、`deploy` ジョブは最初のステップで「シークレットが未設定です」と表示して**失敗**します（黙ってスキップすると、本番が古いまま main が緑に見えてしまうため）。シークレットを追加したら、失敗した `deploy` ジョブを Re-run してください。

### Cloudflare API トークンの作り方

1. Cloudflare ダッシュボード → My Profile → API Tokens → Create Token
2. テンプレート **Edit Cloudflare Workers** を選ぶ（Workers Scripts: Edit、Account Settings: Read、Zone の Workers Routes: Edit などが入っています）
3. Permissions に **Account → D1 → Edit** を追加する（`wrangler d1 migrations apply --remote` に必要）
4. Account Resources を自分のアカウントだけに、Zone Resources を `kejincai.dev`（カスタムドメイン `cobra.kejincai.dev` のゾーン）だけに絞る
5. 作成したトークンを `CLOUDFLARE_API_TOKEN` に登録する

カスタムドメインの付け替えで権限エラーが出たときは、同じゾーンに Zone → DNS → Edit と Zone → Zone → Read を追加してください。

### 手動デプロイ（予備）

```bash
pnpm run deploy    # build → D1 migrations (remote) → wrangler deploy
```

ローカルでは `wrangler login` 済みのアカウントでデプロイされます。

### 本番のログイン

本番は GitHub でログインした、`users` 表に登録済みの利用者だけが使えます。`GITHUB_CLIENT_SECRET` と `SESSION_SECRET` は Worker のシークレットとして `wrangler secret put` で設定します（GitHub Actions には登録不要です）。

## ライセンス

MIT
