# AGENTS.md — Codex への作業指示

このリポジトリ（Biz Slide Coach / Chart Advisor）の設計と大きな変更は Claude が担当している。
Codex は、ユーザーから頼まれた **小さく範囲のはっきりした作業** を受け持つ。
やり取り・記録は日本語で書く。

## 1. 最初に読むもの

- `CLAUDE.md`：守る原則。特に「レジストリが唯一の設計図」「プレビューと PPT は同じ配置計算」「画面の文言は翻訳ファイルから」の3つ。
- `docs/handoff-log.md`：作業の記録。新しい記録が上にある。前に誰が何をしたかを先に見る。
- 触る画面・機能に関係する `docs/decisions.md` の節（ファイル内を検索すればよい）。

## 2. 引き受けてよい作業／引き受けない作業

引き受けてよい作業：

- 文言の修正（`src/i18n/messages/ja.json` と `en.json`）
- 見た目の微調整（`*.module.css`）
- 範囲の決まった小さな不具合の修正
- テストの追加

引き受けない作業（頼まれても手を付けず、ユーザーに「Claude 側の作業です」と返す）：

- `src/registry/` の定義の変更、`docs/registry-spec.md`・`CLAUDE.md` の変更
- AI のプロンプトや応答の形（`src/lib/ai/`）
- Supabase のマイグレーション（`supabase/migrations/`）、課金、プランの判定
- 複数の画面にまたがる作り替え、画面の流れ（入り口・② の画面・Story）の変更

## 3. 作業のきまり

1. 始める前に `git status` が空であることを確かめる。空でなければ作業を始めず、ユーザーに伝える。
2. 頼まれた範囲だけを変える。関係のないコードの整形、名前の変更、ファイルの移動はしない。
3. 画面の文言はコンポーネントに直接書かない。`ja.json` と `en.json` の両方に同じキーを足す（片方だけだと、言語をそろえるテストが落ちる）。
4. 秘密情報（`.env*`、Supabase の service_role、OpenAI・Resend のキー）は読まない・書かない・出力しない。
5. ファイルを消す時は、頼まれた時だけにする。
6. 終わる前に、次の3つがすべて通ることを確かめる。

   ```
   npm run typecheck
   npm test
   npm run build
   ```

7. 1つの作業につき、コミットを1つ作る。メッセージは `[codex] ` で始め、何をしたかを日本語で書く。push はしない（push はユーザーが行う）。

## 4. 記録する場所（必ず書く）

- **`docs/handoff-log.md` の一番上に、1件追記する**（書き方はそのファイルのひな形どおり）。
  - 変えたファイル、何をしたか、確かめたこと、残っていることを書く。
  - Claude は作業を始める前にここを読むので、省略しない。
- 設計書や今までの決めごとと違う判断をした時だけ、`docs/decisions.md` の末尾に1〜3行で理由を書く。
  - 見出しは `## YYYY-MM-DD（Codex：〜）` とする。
- 記録の追記も、作業と同じコミットに入れる。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
