# 開発ルール（人間・エージェント共通）

仕様は `IMPLEMENTATION_BRIEF.md` を参照する。数値は §6 を優先する。画面の見た目・文言・操作は `design/*.dc.html` に合わせる。

## 必ず守ること
- PR を出す前に、ルートで `pnpm check`（typecheck + test + build）を通す。
- UI の文言は日本語で、設計稿からそのまま取る。
- 色は `apps/web/src/index.css` の `@theme` トークンを使う（`bg-card`、`text-sub`、`border-line`、`text-accent` など）。新しい色を直書きしない。
- 動きは CSS で付ける。`prefers-reduced-motion` は index.css で一括対応済みなので、JS のアニメーションは `ui/useCountUp` のように reduced-motion を確認する。
- 重い計算（モンテカルロ・構築・打ち手）は `src/lib/cobra-client.ts`（Web Worker）経由で呼ぶ。API 側では計算しない（Workers 無料枠は CPU 10 ms）。
- 秘密情報や個人のメールアドレスをコミットしない（公開リポジトリ）。

## 並行作業時のファイル担当
- 各画面は `apps/web/src/pages/<Screen>.tsx` を差し替えて作る。画面専用の部品は `apps/web/src/features/<area>/` に置く。
- 共有ファイルは追記だけにし、既存のシグネチャを壊さない。共有ファイル: `packages/cobra-core/src/{index,types}.ts`、`apps/web/src/{router.tsx,index.css,data/api.ts,lib/*,ui/*}`、`apps/web/shared/types.ts`、`apps/web/worker/{index,auth,env}.ts`、`apps/web/worker/db/schema.ts`
- 複数画面で使えそうな部品（ヒストグラム、P 帯、セグメントボタンなど）は `src/ui/` に**新規ファイル**として追加する。
- API が足りないときは `apps/web/worker/routes/<area>.ts` に追加する。
- スキーマ変更は最小限にとどめ、`pnpm --filter web db:generate` で新しいマイグレーションを作り、PR に明記する。番号が衝突したらマージ時に作り直す。
- seed を変えるときは `cobra-core/src/seed.ts` を直し、`pnpm --filter web db:seed-sql` で `0001_seed.sql` を作り直す。本番に適用済みの場合は、差分を新しいマイグレーションにする。

## ローカル
- `pnpm dev` → http://localhost:5173（Vite + Workers ランタイム + ローカル D1）
- `.dev.vars` の `AUTH_MODE=dev` で、ローカルでは admin として扱われる。
