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

### 2.1 ユーザーが特別に許可した作業（2026-10-02）

次の2つは、2章で「引き受けない」とした範囲に少し入るが、ユーザーの許可により Codex が行ってよい。
決められた範囲を超える変更が必要になったら、そこで止めて、ユーザーに「Claude に回してください」と伝える。

**A. チャートの配色テーマ（カラーバリエーション）を足す**

- 触ってよいファイル：
  - `src/engine/theme.ts`：`THEME_IDS` に ID を足し、`basePalette` に新しいテーマの分岐を足す。
  - `src/features/editor/ThemePicker.tsx`：選択肢と、Plus の印を付けるかどうか（`PLUS_THEMES`）。
  - `src/i18n/messages/{ja,en}.json`：`field.theme.<ID>` の名前。
  - `src/engine/theme.test.ts`：テストの追加。
- 守ること：
  - `default` の色の値と順番は変えない（保存済みの資料の見た目が変わるため）。
  - 保存するのはテーマの ID だけにする。色の値を保存データに入れない。
  - 色の値は `theme.ts` だけに置く。各チャートの描画コード（`src/engine/layout/`）に色を直接書かない。そうすれば、プレビューと PPT の両方に同じ色が出る。
  - `ChartPalette` の項目（series・face・line・primary・secondary・groups・groupEmpty・bubble）を、新しいテーマでもすべて決める。
  - 白い背景で薄すぎて見えない色を、線・文字に使わない。
  - 既存の `quiet_steel_blue` のテストにならい、項目の数ごとの色・隣どうしが同じ色にならないことをテストする。

**B. 「新しく作る」の「チャートから選ぶ」一覧に、表・言葉のスライドも並べる**

- 今の一覧（`/start` の 03、`src/features/start/chart-catalog.ts` と `StartFlow.tsx` の `Entry`）はグラフだけを並べている。その後ろに、表・言葉の型（`STORY_TEMPLATES`。KPI スコアカード・比較表・箇条書きなど）を、見本の絵付きのカードで足す。
- 触ってよいファイル：
  - `src/features/start/chart-catalog.ts`：表・言葉の見本の絵。`ensureTemplate(initialState(locale), id, true)` で見本の中身を作り、`previewSvg` で描く。
  - `src/features/start/StartFlow.tsx`：`Entry` の 03 の欄（見出しの下に「グラフ」「表・言葉」の小見出しを足してよい）。
  - `src/features/start/entry.module.css`、`ja.json` と `en.json`。
  - `src/features/editor/Builder.tsx` の開き方の判定（`Intent`）だけ：`/editor?template=<StoryTemplateId>` を足し、新しい資料をその型の見本で開く。型の ID は `isStoryTemplateId` で確かめ、知らない ID は今までどおり新規で開く。
- 守ること：
  - 型の名前・説明は `STORY_TEMPLATES`（`src/registry/storyTemplates.ts`）から読む。画面に直接書かない。registry には足さない・変えない。
  - 編集中の未保存の資料があれば、今の「新規」と同じ確認を出してから開く。
  - グラフの一覧の並び・「すべて見る」の動きは変えない。

**C. 「チャートから選ぶ」で、選んだチャートを第一案にする（Mekko 以外のチャートへ広げる）**

- 見本は Mekko（`src/features/start/dishes.ts` の Mekko のマスの `chosen`、`docs/decisions.md`「チャートから選ぶ：選んだチャートを第一案に」）。同じ書き方で、ほかのチャートのマスに `chosen`（選んだチャートの案・助言 `advice`・違い `diff`・向いている印 `fits`・条件 `when` と `fallback`・`note`）を書き、`KEEP_CHOSEN` にチャートを足す。
- 触ってよいファイル：`src/features/start/dishes.ts`、`src/features/start/plan.test.ts`（またはチャートごとの新しいテストファイル）、`docs/handoff-log.md`。
- 守ること：
  - 選べるのは、すでに registry にあるレシピ・補完パーツ・設定だけ。新しいレシピ・補完チャート・表が必要な時は、作らずに handoff-log の「残っていること」に「〇〇チャート×〇〇：こういう形が要る」と書く（Claude が作る）。
  - 画面（`RecipeScreen.tsx`）・推薦の分岐（`coach.ts` の `resolveChosen` まわり）・`plan.ts` は変えない。必要だと思ったら、理由を handoff-log に書いて止める。
  - 助言・違いの文は日本語と英語の両方を書く。選んだチャートを否定する言い方（「〇〇より△△が向く」）にせず、用途の違いを書く。
  - 1つのチャートにつき、コミットを1つ作る。テストは Mekko と同じく「選んだチャートの案が先頭・既定選択」「別案は別のチャートだけ」「伝えたいことを替えても選んだチャートに戻る」を確かめる。
  - 作業は元のリポジトリではなく、作業コピー（例：`~/Project/Narratix web app-chart-first-codex`）で行う。元のリポジトリへの取り込みは Claude が確認してから行う。

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
