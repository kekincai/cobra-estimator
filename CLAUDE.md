# 開発ルール（人間・エージェント共通）

仕様は `IMPLEMENTATION_BRIEF.md` を参照する。数値は §6 を優先する。画面の見た目・文言・操作は `design/*.dc.html` に合わせる（読み方と、設計稿に描いていない UI の仕様は `design/README.md`）。

## 必ず守ること
- PR を出す前に、ルートで `pnpm check`（typecheck + test + build）を通す。
- UI の文言は日本語で、設計稿からそのまま取る。工数の分位は「超過確率」を主に、P 値を添える（「49.9 人月（超過確率 20%・P80）」）。モデルの版は「見積りに使う / 使用中」、実績は「採用 / 除外」。
- 文字は 11px 以上（レポートの pt 指定を除く）。`text-weak` より暗い色や `line-strong` を文字に使わない。
- 色は `apps/web/src/index.css` の `@theme` トークンを使う（`bg-card`、`text-sub`、`border-line`、`text-accent` など）。新しい色を直書きしない。
- 動きは CSS で付ける。`prefers-reduced-motion` は index.css で一括対応済みなので、JS のアニメーションは `ui/useCountUp` のように reduced-motion を確認する。
- 重い計算（モンテカルロ・構築・打ち手）は `src/lib/cobra-client.ts`（Web Worker）経由で呼ぶ。API 側では計算しない（Workers 無料枠は CPU 10 ms）。
- 秘密情報や個人のメールアドレスをコミットしない（公開リポジトリ）。

## 並行作業時のファイル担当
- 各画面は `apps/web/src/pages/<Screen>.tsx` を差し替えて作る。画面専用の部品は `apps/web/src/features/<area>/` に置く。
- 共有ファイルは追記だけにし、既存のシグネチャを壊さない。共有ファイル: `packages/cobra-core/src/{index,types}.ts`、`apps/web/src/{router.tsx,index.css,data/api.ts,lib/*,ui/*}`、`apps/web/shared/{types,factor-rules,user-rules}.ts`（worker と src の両方が使う入力ルール）、`apps/web/worker/{index,auth,env}.ts`、`apps/web/worker/db/schema.ts`
- 複数画面で使えそうな部品（ヒストグラム、P 帯、セグメントボタンなど）は `src/ui/` に**新規ファイル**として追加する。
- API が足りないときは `apps/web/worker/routes/<area>.ts` に追加する。
- スキーマ変更は最小限にとどめ、`pnpm --filter web db:generate` で新しいマイグレーションを作り、PR に明記する。番号が衝突したらマージ時に作り直す。
- seed を変えるときは `cobra-core/src/seed.ts` を直す。`0001_seed.sql` は本番に適用済みなので作り直さず、`pnpm --filter web --silent db:seed-sql:update > apps/web/migrations/000N_<name>.sql` で UPDATE の差分マイグレーションを足す（例: `0002_seed_calibration.sql`）。新しい DB でも 0001 → 000N の順に当たり、`db:seed-sql` の全件出力と同じ状態になる。

## 共有の UI ヘルパー（`apps/web/src/ui/`。同じものを画面ごとに作らない）
- `numberInput.ts`: 数値入力はすべて `parseNumberInput` で読む（全角数字・各種マイナスを解釈、読めなければ null。0 にしない）。
- `apiError.ts`: API エラーの表示は `describeApiError(e)`。`e.message` や英語の生メッセージを画面に出さない。
- `ConfirmDialog.tsx`: 取り消しにくい操作（削除・版の切り替え・権限変更・取り込み確定など）の前に出す確認。破壊的なら `danger`。
- `useUnsavedChangesPrompt.ts`: 未保存の編集があるフォームで、画面移動とタブを閉じる前に確認する。
- `percentile.ts`: 「超過確率 20%」「超過確率 20%・P80」の文言と一行説明 `EXCEED_NOTE`。P 値の表記は必ずここから作る。
- `commandPalette.ts`: `openCommandPalette(query?)` でどこからでも検索パレットを開く（本体は `CommandPaletteDialog.tsx`、Layout に常駐）。
- `contribution.ts`: 要因の寄与は `factorContributions(...)`（期待値・行ごとに丸め）。保存済みの `results.contributions`（モンテカルロ値）を画面に出さない。
- `format.ts`: 表示の丸め。並んだ 2 つの値の差は `fmtSigned(displayDelta(a, b))`（丸めた値どうしの差）。規則は `IMPLEMENTATION_BRIEF.md` §6「显示值的舍入规则」。

## ローカル
- `pnpm dev` → http://localhost:5173（Vite + Workers ランタイム + ローカル D1）
- `.dev.vars` の `AUTH_MODE=dev` で、ローカルでは admin として扱われる。
