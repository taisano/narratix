# AGENTS.md — Codex への作業指示

このリポジトリ（Biz Slide Coach / Chart Advisor）は、Claude と Codex の両方が実装を担当する。
役割で分けるのではなく、**同じ main を交代で触る**：同時には作業しない（ユーザーが調整する）代わりに、
`docs/handoff-log.md` にタイムスタンプ付きで記録を残し、次に始める側（Codex でも Claude でも）が
前の作業内容と終了時点のコミットを必ず確認できるようにする。
やり取り・記録は日本語で書く。

## 1. 最初に読むもの

- `CLAUDE.md`：守る原則。特に「レジストリが唯一の設計図」「プレビューと PPT は同じ配置計算」「画面の文言は翻訳ファイルから」の3つ。
- `docs/handoff-log.md`：作業の記録。**一番上の記録のタイムスタンプと、`git log -1` の内容が一致しているか確かめてから始める**（ずれていれば、記録されていない変更がある＝作業を始めずユーザーに確認する）。
- 触る画面・機能に関係する `docs/decisions.md` の節（ファイル内を検索すればよい）。

## 2. 作業できる範囲（2026-10-07 より：画面・機能・設計の実装全般）

これまでは「文言修正・見た目の微調整・小さな不具合修正」など範囲を区切っていたが、
**2026-10-07 以降、Codex は画面・機能・設計の実装を全般に担当してよい**（ユーザー許可）。
`src/registry/` の定義変更、AI のプロンプトや応答の形（`src/lib/ai/`）、Supabase のマイグレーション
（`supabase/migrations/`）、課金・プラン判定、複数の画面にまたがる作り替え、画面の流れの変更も含む。

ただし、以下は引き続き必ず守る（範囲の制限ではなく、安全上・運用上の決まり）。

- **本番の Supabase には直接操作しない**：マイグレーションのファイルやスクリプトは書いてよいが、それを本番へ当てる・本番データを書き換える・消すのはユーザー（または Claude がユーザーの許可を得て）が行う。
- **秘密情報は扱わない**：`.env*`、Supabase の service_role、OpenAI・Resend などのキーを読まない・書かない・出力しない。
- **設計の正本（`docs/registry-spec.md`・`CLAUDE.md`・`docs/data-model-proposal.md` など）と矛盾する判断をする時は、変更前に `docs/decisions.md` に理由を書いてから進める**。迷ったら、進めつつ `docs/handoff-log.md` の「残っていること」に「〇〇は設計判断が要ります」と書いて、ユーザーまたは Claude の確認を仰ぐ（止めて確認を待ってもよいし、分かる範囲で進めて記録に書いてもよい）。
- **push はしない**（ユーザーが行う）。コミットは作る。
- 1つの作業につき、コミットを1つ以上、意味のある単位で作る（3章参照）。

### 2.1 これまで個別に許可してきた作業の実装メモ（参考。2026-10-02〜03）

今は全般に許可されているため「特別な許可」としての意味は無いが、実装時の技術的な注意点として有効なので残す。

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
  - `CHART_EMPHASES` にもチャートを足す：得意な伝えたいことの順（`order`。先頭が最初から選ばれる）と、向いていないので ① に出さないもの（`hidden`）とその案内（`hiddenNote`）。
  - 別案は2種類ある：選んだチャートが向いているマス（DIRECT_FIT など）はただの「別案」（Coach の印・助言は出ない）、向いていないマス（SWITCH_RECOMMENDED・条件を満たさない時）は Coach の「おすすめの別案」（`advice` が出る）。`advice` は「おすすめの別案」の時だけ使われる前提で書く。
  - 最新の main から始め、`npm test` で全体を流す。既存のテストが「別のチャートに替える」前提で落ちたら、新しい決まりに合わせて書き換え、理由を handoff-log に書く。
  - 今のマスに `when`（データの条件）があれば、`chosen` にも `when`・`fallback`・`note` を書く（選んだチャートのまま、できる形にして理由を1文）。
  - 同じチャートの別の形は `plates` の2つ目以降へ。`switchTo`・`alts` には別のチャートだけ。
  - `name`・`advice`・`diff` は短く、やさしい言葉で（「〜へ焦点を移します」「〜へ広げます」のような言い回しは使わない）。`diff` は「別案が何を見せるか」を書く。

**D. 「目的から選ぶ」の ② の候補を、おすすめ／一緒に見せる案／別案／その他のバリエーションに分ける（推移以外の目的へ広げる）**

- 見本は推移（`src/features/start/purposeMeta.ts` の `PURPOSE_META` の trajectory・growth_rate・growth_driver・mix_change、`docs/decisions.md`「目的から選ぶ：1つの目的で選ぶ」）。同じ書き方で、比較・構成・要因・関係の伝えたいことに `PURPOSE_META` を書く。
- 触ってよいファイル：`src/features/start/purposeMeta.ts` の `PURPOSE_META` だけ、`src/features/start/purposeEntry.test.ts`（またはテストの追加）、`docs/handoff-log.md`。
- 守ること：
  - 候補の並びとおすすめ（`coach.ts` の MAP と採点）は変えない。書けるのは、今その伝えたいことに出ている候補（おすすめ＋別案2つ）だけ。新しいレシピ・候補が要る時は、作らずに handoff-log の「残っていること」に書く。
  - 種類の分け方：主の目的のまま、もう1つの目的にも1枚で答える＝`kind: 'combined'` と `withPurpose`（1つだけ。主の目的と違うもの）。同じ目的・伝えたいことに別のチャート・別の構成で答える＝書かない（別案）。おすすめと同じチャートで補完・注記だけが少し違う＝`kind: 'variation'`。迷ったら別案にする（無理に一緒に見せる案にしない）。
  - 伝えたいこと自体がほかの目的を含む時（例：推移の「構成の変化」）は、一緒に見せる案にしない。
  - `diff` は1文で、別案は「おすすめとの違い（別案が何を見せるか）」、一緒に見せる案は「一緒に見せられる内容」を書く。日本語と英語の両方。`name` はチャート名だけにせず、同じチャートの候補どうしが区別できる表現名にする（レシピの名前で区別できるなら書かない）。
  - 今のデータのほかにデータが要る案は `needsData: true`。
  - 画面（`RecipeScreen.tsx`）・`plan.ts`・`coach.ts`・`PURPOSE_EMPHASES` は変えない。
  - 1つの目的につき、コミットを1つ作る。

**E. データの持ち方の作り直し（`docs/data-model-proposal.md`。2026-10-03 許可）**

これは大きな作業なので、ほかの許可（A〜D）と違い、2章で「引き受けない」とした範囲（`supabase/migrations/`・`src/lib/repo/`・保存の形・複数の画面）に入ってよい。ただし、下の決まりを必ず守る。

- **正本は `docs/data-model-proposal.md`**。設計を変えたくなったら、勝手に変えずに `docs/data-model-progress.md` の「決めたこと・迷っていること」に書いて、その段階で止める（ユーザーに「Claude に回してください」と伝える）。
- 提案書 10章の「決めてほしいこと」は、**おすすめのとおりに進める**（チャートとストーリーは decks にまとめる／出典は資料名だけ促す／ストーリーの版は PPT 出力・名前の変更・30分ごと／データのタブはまだ出さない／ダミーのデータは手順7で消す）。ユーザーが別の答えを出したら、ここを書き換える。
- **進め方は提案書 7章の順番どおり。1つの段階＝1つ以上のコミット**。段階の途中で止める時も、テストが通る状態でコミットする。
- **作業コピーで行う**：`~/Project/Narratix web app-data-model-codex`（最新の main から作る）。元のリポジトリは触らない。push しない。
- **本番の Supabase には何もしない**：マイグレーションを当てる・データを消す・テンプレートを書き出すのは、ユーザー（または Claude）が行う。Codex はマイグレーションのファイルとテスト（`supabase/tests/`）を書くだけ。秘密情報（`.env*`・service_role）は読まない。
- **古い表（projects・datasets・view_specs・view_spec_versions・chart_drafts・stories）は手順7まで消さない**。新しい表と並べて作り、保存・読み込みを切り替えた後に、ユーザーの許可を得てから消すマイグレーションを書く。
- **編集画面の中の形（ProjectState・SlideState・BuilderState）と描画・PPT 出力は、なるべく変えない**。変換は `src/features/data/canonical.ts` などの新しいファイルに集める。画面の文言は `ja.json`・`en.json` の両方に。
- **毎回、`docs/data-model-progress.md` を更新する**（下の「記録」）。Claude はこのファイルだけ読めば続きを始められるようにする。
- 終わりの確認は3章と同じ（typecheck・test・build）。保存の形を変えた段階では、加えて「作る→保存→開く→PPT 出力」が通ることをテストで確かめる。

**E の記録（必ず書く）**

- `docs/data-model-progress.md`：段階ごとのチェックリスト（済・途中・未）、今の段階で何をしたか、変えたファイル、決めたこと（理由つき）、迷っていること・Claude に判断してほしいこと、ユーザーがすること（マイグレーションを当てる等）、次に始める場所。**新しい記録を上に書く**。
- `docs/handoff-log.md`：段階ごとに1件（4章のひな形どおり）。
- 提案書と違う判断をした時は `docs/decisions.md` にも1〜3行。

## 3. 作業のきまり

1. 始める前に `git status` が空であることを確かめる。空でなければ作業を始めず、ユーザーに伝える。
   あわせて `docs/handoff-log.md` の一番上の記録と `git log -1` を見比べ、記録に無い変更が無いことを確かめる
   （Claude と同時に作業していないはずだが、ずれがあれば念のためユーザーに確認する）。
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

7. 1つの作業につき、コミットを1つ以上、意味のある単位で作る。メッセージは `[codex] ` で始め、何をしたかを日本語で書く。push はしない（push はユーザーが行う）。
8. 複数のコミットにまたがる大きな作業（設計のやり直し、複数画面の作り替えなど）は、作業コピー
   （例：`~/Project/Narratix web app-<名前>-codex`）で進め、最後にまとめて取り込んでもらう今までのやり方でもよい。
   1〜2コミットで終わる小さい〜中くらいの作業は、直接 `~/Project/Narratix web app` で進めてよい（このリポジトリを
   Claude と交代で触る運用のため）。迷ったらユーザーに聞く。

## 4. 記録する場所（必ず書く）

- **`docs/handoff-log.md` の一番上に、1件追記する**（書き方はそのファイルのひな形どおり。開始・終了のタイムスタンプ（JST）、
  開始時の `main` のコミット、終わった時のコミットを必ず書く）。
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
