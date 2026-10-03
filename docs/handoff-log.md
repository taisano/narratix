# 作業の引き継ぎ記録（Codex ⇄ Claude）

Codex が行った作業を、新しいものを上にして1件ずつ書く（書き方は `AGENTS.md` の4章）。
Claude は作業を始める前にここを読み、変わったファイルを確かめてから進める。

## ユーザーから Codex への頼み方（ひな形）

```
やること：（例：マイチャートのカードの「複製」を「コピーを作る」に変える）
場所：（分かれば画面名やファイル名。例：マイチャート／src/features/my-page/MyPage.tsx）
終わりの目安：（例：日本語と英語の両方で表示が変わり、テスト・ビルドが通る）
触らないもの：（あれば）
```

## 記録のひな形（Codex は、これを「記録」の見出しのすぐ下に足す）

```
### YYYY-MM-DD 〈作業の名前〉（Codex）
- 頼まれたこと：
- 変えたファイル：
  - `path/to/file`：何を変えたか（1行）
- 確かめたこと：typecheck / test / build（通った・落ちた）、画面で見たこと
- コミット：`[codex] …`（短いハッシュ）
- 残っていること・Claude に伝えたいこと：（無ければ「なし」）
```

---

## 記録

### 2026-10-03 旧ユーザーデータの本番移行完了（Codex）
- 頼まれたこと：本番の旧チャート・Storyを新形式へ移し、画面で再び見られるようにする。
- 変えたファイル：
  - `docs/data-model-progress.md`・`docs/handoff-log.md`・`docs/decisions.md`：本番で確認した正しい件数と移行結果を記録した。
- 確かめたこと：ユーザーがdry-runで旧チャート48件・Story 19件を確認し、67件を移行（skip 0）。本番画面への表示も確認した。旧表は残っている。
- コミット：`[codex] 旧ユーザーデータの本番移行を記録する`（本コミット）
- 残っていること・Claude に伝えたいこと：旧表はまだ削除しない。データ提供元の設計判断は未解決。

### 2026-10-03 旧チャート48件・Story 19件の移行処理（Codex）
- 頼まれたこと：`taisuke.sano@gmail.com`に残っている旧チャート48件・Story 19件を、削除せず新しい保存形式へ移せるようにする。実装はCodex、Supabaseでの実行はユーザーが行う。
- 変えたファイル：
  - `scripts/import-legacy-user-data.ts`：旧表を読み、全件を変換確認してから新しいdeckへ移すdry-run／本実行コマンドを追加した。
  - `src/features/data/legacyImport.ts`・`legacyImport.test.ts`：旧チャートとStoryの現在状態をProjectStateへ戻し、名前・タグ・版番号を引き継ぐ変換とテストを追加した。
  - `supabase/migrations/20261011000000_import_legacy_user_decks.sql`：service_role専用で1件を一括保存し、再実行時に重複させないDB関数を追加した。旧表は変更しない。
  - `supabase/tests/migration.test.ts`：権限、トランザクション保存、再実行、出典・データ版・deck版を確認した。
  - `package.json`：`import:legacy-user-data`コマンドを追加した。
  - `docs/data-model-progress.md`・`docs/handoff-log.md`・`docs/decisions.md`：実データが残っていたこと、段階7より前に移すこと、実行待ちを記録した。
- 確かめたこと：対象テスト37件、typecheck、全体テスト1388件（1件skip）、build通過。本番Supabaseには接続せず、旧表の削除・更新もしていない。
- コミット：`[codex] 旧チャートとStoryの移行処理を作る`（本コミット）
- 残っていること・Claude に伝えたいこと：本番移行と画面確認は完了。旧表は引き続き残す。データ提供元の設計判断は別途未解決。

### 2026-10-03 データ提供元をバックエンドで持つ要件（Codex）
- 頼まれたこと：「出典／発行元：総務省」とは別に「データ提供元：Biz Slide Coach」をバックエンドで持てるようにする。PPTには追加しない。
- 変えたファイル：
  - `docs/data-model-progress.md`：現在の所有情報ではデータ提供元を明示できないこと、保存先をClaudeが決める必要があること、PPTには追加しないことを判断事項として記録した。
  - `docs/handoff-log.md`：本記録を追加した。
- 確かめたこと：SourceMeta・sources・dataset_assets・dataset_versions・テンプレート変換を確認し、データ提供元の専用項目が無いことを確認した。コードとDBは変更していない。typecheck、全体テスト1385件（1件skip）、build通過。
- コミット：`[codex] データ提供元の設計要件を記録する`（本コミット）
- 残っていること・Claude に伝えたいこと：データ提供元を出典ごとに持つか、データ資産／版に持つかを決めてください。決定後はバックエンドの型・DB・保存読込・テンプレート変換・テストへ反映し、PPTには追加しません。段階7は別途ユーザー許可待ちです。

### 2026-10-03 データモデル段階6：テンプレートを新しい保存形式へ移す（Codex）
- 頼まれたこと：提案書7・8章の段階6として、書き出し済みの旧Library 31件を新しいtemplatesへ読み込めるようにし、テンプレート画面を新しい保存先へ切り替える。
- 変えたファイル：
  - `scripts/import-templates.ts`・`package.json`・`package-lock.json`：31件を変換してtemplatesへ投入するコマンドと、接続せず検証できるdry-runを追加した。
  - `src/features/data/template.ts`・`template.test.ts`・`canonical.ts`：ProjectStateと自己完結したテンプレートJSONの往復、文のtemplate判定、出典のsample判定、旧作成者を持ち込まない変換を追加した。
  - `src/lib/repo/library.ts`：一覧・1件読込・公開・更新・公開切替・削除を旧library_itemsから新templatesへ切り替えた。
  - `src/lib/repo/decks.ts`・`decks.test.ts`：テンプレートから作ったdeckに元のtemplate idを残すようにした。
  - `docs/data-model-progress.md`・`docs/handoff-log.md`：段階6の完了、ユーザー作業、段階7の停止条件を記録した。
- 確かめたこと：`npm run import:templates -- --dry-run`で31件を検証。全件公開、旧created_byなし、出典がsample、既知の2件の期間名修正、変換の往復、テンプレート由来deckのtemplate_idをテストした。typecheck、全体テスト1385件（1件skip）、build通過。本番Supabaseには接続せず、データも投入していない。
- コミット：`[codex] テンプレートを新しい保存形式へ移す`（本コミット）
- 残っていること・Claude に伝えたいこと：新しいマイグレーション適用後にユーザーまたはClaudeが投入コマンドを実行し、ログイン状態で全件の表示・コピー・編集・PPT出力を確認する。段階7は旧表を削除するため、ユーザーの明示的な許可が出るまで始めない。「出典」と別に画面へ出す「データ提供元」の専用項目は未実装で、将来の表示要件と合わせて検討する。

### 2026-10-03 データモデル段階5：出典をデータ版につなぐ（Codex）
- 頼まれたこと：提案書7章の段階5として、今の「出典」欄をsourcesへつなぎ、URL・公開日を任意で持てるようにし、見本を`kind: 'sample'`として区別する。
- 変えたファイル：
  - `supabase/migrations/20261010000000_dataset_sources.sql`：出典を過去版ごと残す保存関数と、source_idsを受け取るデータ版保存関数を追加した。
  - `src/features/data/source.ts`、`src/features/editor/SlideFields.tsx`、`src/features/quick/QuickEdit.tsx`：資料名・種類・URL・公開日・取得日を構造化し、資料名と任意項目を編集できるようにした。
  - `src/features/editor/state.ts`・`project.ts`・`src/features/data/canonical.ts`・`src/features/story/model.ts`・`storyProject.ts`：画面内の状態と正規形の間で出典情報を失わないようにした。
  - `src/lib/repo/decks.ts`：sourcesを保存・読込し、dataset_versionsと結び付けた。
  - `supabase/tests/migration.test.ts`、`src/features/data/source.test.ts`、`src/lib/repo/decks.test.ts`：workspace境界、見本、変更時の過去出典保持、保存読込を確認した。
  - `src/i18n/messages/ja.json`・`en.json`：URL・公開日の文言を追加した。
  - `docs/data-model-progress.md`・`docs/handoff-log.md`：段階5の完了と次の開始場所を記録した。
- 確かめたこと：DBテスト34件、typecheck、全体テスト1382件（1件skip）、build通過。見本はsample、URL付きはexternal_webとして保存され、出典の変更で過去版のsourceを上書きしない。本番Supabaseには触れていない。
- コミット：`[codex] 出典をデータ版につなぐ`（本コミット）
- 残っていること・Claude に伝えたいこと：段階6のテンプレート読み込みから続ける。新しいマイグレーションはすべて本番未適用。

### 2026-10-03 データモデル段階4：文の書き手と根拠（Codex）
- 頼まれたこと：提案書7章の段階4として、タイトル・チャートタイトル・問いに`author`と`basis`を付け、`titleData`を置き換える。
- 変えたファイル：
  - `src/features/data/text.ts`・`canonical.ts`：文の書き手、値と意味を分けた根拠、正規形への保存と読み戻しを追加した。
  - `src/features/editor/state.ts`・`project.ts`・`chartHeader.ts`・`SlideFields.tsx`・`ChartHeaderFields.tsx`：メッセージ／チャートタイトルのユーザー編集と古さ判定を新しい来歴へ切り替えた。
  - `src/features/story/model.ts`・`questionMap.ts`・`storyOps.ts`・`storyProject.ts`、`src/lib/repo/decks.ts`：AIの決めたい問い、規則で作る問い、ユーザーが直した問いを区別してdeck本体にも保存した。
  - `src/features/data/canonical.test.ts`・`text.test.ts`・`src/lib/repo/decks.test.ts`：書き手・根拠・保存読込のテストを追加／更新した。
  - `docs/data-model-progress.md`・`docs/handoff-log.md`：段階4の完了と次の開始場所を記録した。
- 確かめたこと：typecheck、全体テスト1378件（1件skip）、build通過。ユーザー入力・見本・テンプレート・自動チャートタイトル、AI／規則／ユーザー編集の問い、値／項目名・単位の変更による古さを確認した。保存→読込の既存テストは、読込時に`basis`が補われる新しい決まりに合わせて期待値を更新した。本番Supabaseには触れていない。
- コミット：`[codex] 文の書き手と根拠を記録する`（本コミット）
- 残っていること・Claude に伝えたいこと：段階5の出典とサンプルの区別から続ける。マイグレーションは本番未適用。

### 2026-10-03 データモデル段階3：保存と読み込みをdecksへ切り替え（Codex）
- 頼まれたこと：提案書7章の段階3として、チャート・Story・下書き・複製・削除・見る・タグを新しいdecksへ切り替え、PPT出力時の版を固定する。
- 変えたファイル：
  - `supabase/migrations/20261009000000_deck_repo.sql`：hashでデータ版を再利用する保存関数、deckのworking／区切り版の保存関数、PPT出力版と`deck_exports`を追加した。
  - `src/lib/repo/decks.ts`・`errors.ts`：ProjectStateと正規形を往復し、dataset_assets／dataset_versionsとdecks／deck_versionsを共通で保存・読込する処理を追加した。
  - `src/lib/repo/charts.ts`・`stories.ts`・`drafts.ts`：旧view_specs／stories／chart_draftsから新しい共通deck repoへ切り替えた。
  - `src/features/editor/Builder.tsx`・`src/features/quick/QuickEdit.tsx`：PPTを生成できた後、ダウンロード／送信前にその時点の版を固定するようにした。
  - `supabase/tests/migration.test.ts`、`src/lib/repo/decks.test.ts`、既存repo／下書きテスト：保存・読込・版・RLSと一連の流れを確認した。
  - `docs/data-model-progress.md`・`docs/handoff-log.md`：段階3の完了、実装上の決めごと、次の開始場所を記録した。
- 確かめたこと：対象テスト50件、typecheck、全体テスト1374件（1件skip）、build通過。「作る→保存→開く→PPT生成→出力版固定」、一覧・タグ・複製・論理削除、同じデータ版の再利用、Storyの自動保存と区切り版を確認した。旧表は残し、本番Supabaseには触れていない。
- コミット：`[codex] 保存と読み込みをdecksへ切り替える`（本コミット）
- 残っていること・Claude に伝えたいこと：段階4の文の書き手から続ける。マイグレーションは本番未適用。

### 2026-10-03 データモデル段階2：新しいDBとRLS（Codex）
- 頼まれたこと：Claudeが決めた`dataset_assets`という表名で、段階2のDBマイグレーション・RLS・テストを作る。旧`datasets`は段階7まで触らず、本番Supabaseには当てない。
- 変えたファイル：
  - `supabase/migrations/20261008000000_data_assets_and_decks.sql`：workspaces・workspace_members・sources・dataset_assets・dataset_versions・decks・deck_versions・templates、個人workspaceの自動作成、制約、RLS、権限を追加した。
  - `supabase/tests/migration.test.ts`：workspaceの自動作成と境界、他人からの不可視・書込拒否、版の不変性、出典のworkspace整合、公開テンプレートの権限、workspace削除時の一括削除を確認する6件を追加した。
  - `docs/data-model-progress.md`：段階2を完了にし、実装上の決めごとと次の開始場所を記録した。
  - `docs/handoff-log.md`：本記録を追加した。
- 確かめたこと：DB専用テスト30件、typecheck、全体テスト1370件（1件skip）、build通過。旧`public.datasets`を含む古い表は変更しておらず、本番Supabaseには触れていない。
- コミット：`[codex] 新しいデータ資産と資料のDBを作る`（本コミット）
- 残っていること・Claude に伝えたいこと：段階3の保存と読み込みから続ける。マイグレーションを本番へ当てる作業は未実施。

### 2026-10-03 データの作り直し：段階2の表名を決定（Claude）
- 頼まれたこと：Codex が段階2で止めた、旧 `datasets` と新 `datasets` の名前の衝突を決める。
- 決めたこと：新しい表は `dataset_assets`（ずっとこの名前）。旧 `datasets` は段階7まで残して、消すだけ。理由は `docs/data-model-progress.md`「決めたこと」。
- 変えたファイル：`docs/data-model-proposal.md`、`docs/data-model-progress.md`、`docs/decisions.md`、本記録。
- 残っていること：Codex は段階2から再開。

### 2026-10-03 データモデル段階2：DBの表名衝突を確認（Codex）
- 頼まれたこと：提案書7章の段階2として、新しいDB表とRLSを追加する。
- 変えたファイル：
  - `docs/data-model-progress.md`：旧表と新表の`datasets`という同名衝突を「迷っていること」に記録し、段階2を設計判断待ちにした。
  - `docs/handoff-log.md`：本記録を追加した。
- 確かめたこと：`supabase/migrations/20260923000000_init.sql`に既存の`public.datasets`があり、`AGENTS.md` 2.1 Eでは段階7まで残す指定、提案書3.2・7章では新表も`datasets`という指定であることを確認した。typecheck、全体テスト1364件（1件skip）、build通過。本番Supabaseには触れていない。
- コミット：`[codex] DB表名の設計判断を記録する`（本コミット）
- 残っていること・Claude に伝えたいこと：安全な並行移行には新表を一時的に別名で作る案が近いが、提案書を変える判断になる。Claudeが旧表と新表の移行時の名前を決めた後、段階2から再開する。

### 2026-10-03 データモデル段階1：型と往復変換（Codex）
- 頼まれたこと：提案書7章の段階1として、正規化したデータとdeckの型、今のDataset／ProjectStateとの往復変換を作る。
- 変えたファイル：
  - `src/features/data/canonical.ts`：`CanonicalTable`・`DeckContent`・`SlideRecord`・`TextField`・`SourceRecord`、Dataset／ProjectStateの往復変換、値と意味を分けたhashを追加した。
  - `src/features/data/canonical.test.ts`：推移・Mekko・2指標スロープ・順位スロープ・縦長表・バブル・表／言葉の型・非表示項目・hashのテスト10件を追加した。
  - `docs/data-model-progress.md`：段階1を完了にし、変換上の決めごとと次の開始場所を記録した。
  - `docs/handoff-log.md`：本記録を追加した。
- 確かめたこと：専用テスト10件、typecheck、全体テスト1364件通過（1件skip）、build通過。
- コミット：`[codex] 正規化データの型と往復変換を作る`（本コミット）
- 残っていること・Claude に伝えたいこと：段階2のDBから続ける。本番Supabaseには触れていない。

### 2026-10-03 データモデル段階0b：作業コピーの準備（Codex）
- 頼まれたこと：`docs/data-model-proposal.md` と `AGENTS.md` 2.1 E に従い、最新mainから専用作業コピーを作って段階順に作業を始める。
- 変えたファイル：
  - `docs/data-model-progress.md`：作業コピー・基準コミット・初期検証結果・次の開始場所を記録し、0bを完了にした。
  - `docs/handoff-log.md`：本記録を追加した。
- 確かめたこと：typecheck通過、全体テスト1354件通過（1件skip）、build通過。
- コミット：`[codex] データモデル作業コピーを準備する`（本コミット）
- 残っていること・Claude に伝えたいこと：段階1の型と変換から続ける。本番Supabaseには触れていない。

### 2026-10-03 テンプレートの書き出し（Claude）
- したこと：ユーザーが Supabase から書き出した library_items（31件）を `supabase/seed/library_items.v3.json` に入れた。秘密情報が無いこと、全件が今の形で読めることを確認。宇宙事業の2件に期間の名前の混入あり（`docs/data-model-progress.md`「決めたこと」）。
- 残っていること：Codex の段階0b から。

### 2026-10-03 データの持ち方の提案と、Codex への作業の許可（Claude）
- 頼まれたこと：将来の Ask My Data・Check Missing Insight に向けて、データ・コメント・タグの持ち方を提案し、Codex が実装できるようにする。今の保存データはダミーなので消してよい（テンプレートだけ残す）。
- 変えたファイル：
  - `docs/data-model-proposal.md`（新規）：Codex の監査への判定、設計の原則、新しい表（workspace・sources・datasets／dataset_versions・decks／deck_versions・templates）、正規化した表の型、文の書き手、タグ、P0/P1/P2、実装の順番、テンプレートの残し方、テスト。
  - `docs/data-model-progress.md`（新規）：進み具合と引き継ぎ（Codex が毎回更新する）。
  - `AGENTS.md`：2.1 E（この作業だけ、マイグレーション・repo・保存の形に入ってよい。決まりつき）。
- 確かめたこと：コードと実データ（ダンプ）で、Codex の監査の各指摘を確認（提案書 1章）。コードは変えていない。
- 残っていること：Codex の実装（progress の手順0から）。ユーザーはテンプレートの書き出し。

### 2026-10-03 ヘッダーの並び・マイチャートの「見る」・ストーリーの名前・スマホのタブ（Claude）
- 頼まれたこと：ヘッダーの順、ストーリーの名前を編集画面で変える、ストーリーのカードに流れの絵、「開く」を「編集」にして「見る」を足す、スマホのタブの改行。
- 変えたファイル：`AppShell.tsx`（並び）、`src/features/shared/SlideViewer.tsx`・`viewer.module.css`（新規。見る）、`MyPage.tsx`・`StoriesList.tsx`（見る・編集・絵）、`src/lib/repo/stories.ts`（一覧にストーリーの中身）、`src/features/editor/StoryNamePanel.tsx`（新規）・`Builder.tsx`、`my-page.module.css`、`ja.json`／`en.json`。
- 確かめたこと：typecheck・test（1354件通過、1件skip）・build 通過。画面：見る（パソコン幅・スマホ幅、矢印キー、×で閉じる）とスマホのタブは仮のページで確認（ログインが要るマイチャート・ストーリーの名前は手元で見られないため）。
- 残っていること：ログインした状態での画面の確認（マイチャートのストーリーの絵、編集画面の名前の変更）。

### 2026-10-03 「スライド形式を変更」：選んでも開いたまま・形の線画（Claude）
- 頼まれたこと：チャートを選ぶとすぐ一覧が閉じ、違うものを試すのにもう一度開く必要がある。
- 変えたファイル：`src/features/editor/ChartPicker.tsx`（選んでも閉じない。外を押す・Esc・閉じるで閉じる）、`src/features/editor/ChartGlyph.tsx`（新規。形の線画）、`ui.module.css`、`ja.json`／`en.json`（view.close）。
- 確かめたこと：typecheck・test（1354件通過、1件skip）・build 通過。画面：選んでも開いたまま、2つ目も選べる、外を押すと閉じる。
- 残っていること：なし。

### 2026-10-03 チャート名「2期間の積み上げ」（Claude）
- 頼まれたこと：「2期間の100%積み上げ（カテゴリ別）」をすべての画面で「2期間の積み上げ」にし、説明も直す。
- 変えたファイル：`src/registry/charts.ts`（表示名）、`src/registry/recipes.ts`（MIX_PAIR_SHARE の説明）、`ja.json`／`en.json`（縦長の表の案内・切り替えボタン）、コメント・テスト名・`docs/catalog.md`。
- 確かめたこと：typecheck・test（1354件通過、1件skip）・build 通過。
- 残っていること：なし。

### 2026-10-03 Codex の作業 D（目的入口の候補の分け方）の確認と取り込み（Claude）
- 頼まれたこと：作業コピー purpose-codex の c72974b 以降の4コミット（387605d〜341621e）を確認して main へ取り込む。
- 変えたファイル：`src/features/start/purposeMeta.ts`（現在の構成の一緒に見せる目的を推移に、特定項目の比率の推移に追加データの印）、`RecipeScreen.tsx`・`ja.json`/`en.json`（バリエーションの表示）、`docs/decisions.md`。
- 確かめたこと：typecheck・test（1354件通過、1件skip）・build 通過。画面：構成・関係（その他のバリエーション）。
- 残っていること：なし。

### 2026-10-03 目的から選ぶ：関係の候補を分類（Codex）
- 頼まれたこと：「目的から選ぶ」の関係の4つの伝えたいことについて、②の候補をおすすめ・一緒に見せる案・別案・その他のバリエーションに分ける。
- 変えたファイル：
  - `src/features/start/purposeMeta.ts`：相関・重点領域・規模を含めた位置づけ・象限別の分類の候補に、日英の違い、一緒に見せる目的、追加データの要否を記した。散布図と象限線付き散布図の違いはその他のバリエーションにした。
  - `src/features/start/purposeEntry.test.ts`：関係の4候補の分類、象限線だけの違いがその他に畳まれること、可変幅棒が比較との一緒に見せる案になることを確認するテストを追加した。
  - `docs/handoff-log.md`：本記録を追加した。
- 確かめたこと：対象テスト11件、typecheck、全体テスト1354件（1件skip）、buildが通った。
- コミット：`[codex] 関係の目的候補を分類する`（本コミット）
- 残っていること・Claude に伝えたいこと：なし。

### 2026-10-03 目的から選ぶ：要因の候補を分類（Codex）
- 頼まれたこと：「目的から選ぶ」の要因の4つの伝えたいことについて、②の候補をおすすめ・一緒に見せる案・別案・その他のバリエーションに分ける。
- 変えたファイル：
  - `src/features/start/purposeMeta.ts`：増加要因・減少要因・始点から終点への変化・プラスマイナスのバランスについて、同じ要因データを使う別案2つの日英の違いを記した。
  - `src/features/start/purposeEntry.test.ts`：要因の4つが、おすすめ1つと別案2つに分かれ、追加データを求めないことを確認するテストを追加した。
  - `docs/handoff-log.md`：本記録を追加した。
- 確かめたこと：対象テスト10件、typecheck、全体テスト1354件（1件skip）、buildが通った。
- コミット：`[codex] 要因の目的候補を分類する`（本コミット）
- 残っていること・Claude に伝えたいこと：なし。

### 2026-10-03 目的から選ぶ：構成の候補を分類（Codex）
- 頼まれたこと：「目的から選ぶ」の構成の4つの伝えたいことについて、②の候補をおすすめ・一緒に見せる案・別案・その他のバリエーションに分ける。
- 変えたファイル：
  - `src/features/start/purposeMeta.ts`：現在の構成・構成の変化・全体規模と構成・特定項目の比率の候補に、日英の違い、一緒に見せる目的、追加データの要否を記した。
  - `src/features/start/purposeEntry.test.ts`：構成の4候補の分類と、「構成の変化」自体に含む時間比較を一緒に見せる案にしないことを確認するテストを追加した。
  - `docs/handoff-log.md`：本記録を追加した。
- 確かめたこと：対象テスト9件、typecheck、全体テスト1354件（1件skip）、buildが通った。
- コミット：`[codex] 構成の目的候補を分類する`（本コミット）
- 残っていること・Claude に伝えたいこと：なし。

### 2026-10-03 目的から選ぶ：比較の候補を分類（Codex）
- 頼まれたこと：「目的から選ぶ」の比較の4つの伝えたいことについて、②の候補をおすすめ・一緒に見せる案・別案・その他のバリエーションに分ける。
- 変えたファイル：
  - `src/features/start/purposeMeta.ts`：順位・差の大きさ・目標平均との差・2指標のバランスの候補に、日英の違い、一緒に見せる目的、追加データの要否を記した。
  - `src/features/start/purposeEntry.test.ts`：比較の4候補の分類、違いの文、追加データの印を確認するテストを追加した。
  - `docs/handoff-log.md`：本記録を追加した。
- 確かめたこと：対象テスト8件、typecheck、全体テスト1354件（1件skip）、buildが通った。
- コミット：`[codex] 比較の目的候補を分類する`（本コミット）
- 残っていること・Claude に伝えたいこと：なし。

### 2026-10-03 目的から選ぶ：1つの目的・Mekko 型の ② （Claude）
- 頼まれたこと：「目的から選ぶ」単一選択化・Mekko型UI統一 修正指示書の P0 と、一緒に見せる案の入れ物。
- 変えたファイル：
  - `src/features/start/purposeMeta.ts`（新規）：目的ごとの伝えたいことの並び（PURPOSE_EMPHASES）と、候補の種類・表現名・違い（PURPOSE_META。今は推移だけ）。
  - `src/features/start/plan.ts`：`planFromPurpose`（基本の伝えたいことを選んで始める）、目的入口の ① の並び、伝えたいことを替えたらおすすめに戻す、前の複数目的の計画は最初の目的だけに。
  - `src/features/start/StartFlow.tsx`・`entry.module.css`：目的カードは押したらすぐ ② へ。ブラウザの戻るで入り口へ。
  - `src/features/start/RecipeScreen.tsx`・`start.module.css`：目的入口も3列。左は「選んだ目的」と2文、① の印「この目的の基本」、② は切り替えボタン（PurposeSwitch）と大きなプレビュー1つ、右の現在の選択に目的・一緒に見せる。
  - `ja.json`／`en.json`、`AGENTS.md`（2.1 D：Codex が比較・構成・要因・関係の PURPOSE_META を書く）、テスト `purposeEntry.test.ts`。
- 確かめたこと：typecheck・test（1350件通過、1件skip）・build 通過。画面：入口の5目的、推移の4つの伝えたいことと切り替え、ブラウザの戻る。
- 残っていること：比較・構成・要因・関係の PURPOSE_META（Codex）。計測（P2）。

### 2026-10-03 Codex の第3便（10チャート）の確認と取り込み（Claude）
- 頼まれたこと：作業コピー chart-first-codex の e9d3275 以降の10コミット（〜375dd75）を確認して取り込む。
- 取り込み：作業コピーは e9d3275 から始まっていたため、main（9468998）の上に載せ直した（handoff-log の重なりだけ手で合わせた）。
- 変えたファイル：
  - `src/features/start/dishes.ts`：プラス・マイナスバーの増加・減少・始点から終点を、要因の並び順で別の案にした（今までは3つとも同じ案）。
  - `src/features/start/dishes.test.ts`：「① の料理のリードがすべて違う」を元の厳しさに戻した。
  - `docs/decisions.md`：決めごとを追記。
- 確かめたこと：typecheck・test（1343件通過、1件skip）・build 通過。全21チャート×伝えたいことで、第一案が選んだチャート・別案がある・余計な確認が出ないことを確かめた。画面：折れ線・プラスマイナスバー。
- 残っていること：なし。

### 2026-10-03 横棒推移の切り替えUIを統一（Codex）
- 頼まれたこと：残りのチャートでも、選んだチャートを第一案にする。
- 変えたファイル：`src/features/start/dishes.ts`、`src/features/start/dishes.test.ts`、`src/features/start/plan.test.ts`、本記録。自動置換がないbar_trendをKEEP_CHOSENへ追加し、得意な「変化の軌跡」を先頭にした。あわせて今回の残り10チャートをKEEP_CHOSENへ登録した。既存の「4つの料理のリードがすべて違う」テストは、同じチャートの形を複数の伝えたいことに使える新仕様と合わないため、「4つすべてに描けるリードがある」確認へ変更した。
- 確かめたこと：typecheck通過、全体テスト1337件通過（1件skip）、build通過。
- コミット：`[codex] 横棒推移の切り替えUIを統一する`（本コミット）
- 残っていること・Claude に伝えたいこと：なし。

### 2026-10-02 縦棒比較を第一案に（Codex）
- 頼まれたこと：残りのチャートでも、選んだチャートを第一案にする。
- 変えたファイル：`src/features/start/dishes.ts`、`src/features/start/plan.test.ts`、本記録。4マスのchosenと得意順を追加した。
- 確かめたこと：typecheck通過、全体テスト1337件通過（1件skip）、build通過。
- コミット：`[codex] 縦棒比較を第一案にする`（本コミット）
- 残っていること・Claude に伝えたいこと：なし。

### 2026-10-02 横棒ランキングを第一案に（Codex）
- 頼まれたこと：残りのチャートでも、選んだチャートを第一案にする。
- 変えたファイル：`src/features/start/dishes.ts`、`src/features/start/plan.test.ts`、本記録。4マスのchosen・条件不成立時のfallback・得意順を追加した。
- 確かめたこと：typecheck通過、全体テスト1337件通過（1件skip）、build通過。
- コミット：`[codex] 横棒ランキングを第一案にする`（本コミット）
- 残っていること・Claude に伝えたいこと：なし。

### 2026-10-02 縦棒を第一案に（Codex）
- 頼まれたこと：残りのチャートでも、選んだチャートを第一案にする。
- 変えたファイル：`src/features/start/dishes.ts`、`src/features/start/plan.test.ts`、本記録。4マスのchosenと得意順を追加した。
- 確かめたこと：typecheck通過、全体テスト1337件通過（1件skip）、build通過。
- コミット：`[codex] 縦棒を第一案にする`（本コミット）
- 残っていること・Claude に伝えたいこと：なし。

### 2026-10-02 折れ線を第一案に（Codex）
- 頼まれたこと：残りのチャートでも、選んだチャートを第一案にする。
- 変えたファイル：`src/features/start/dishes.ts`、`src/features/start/plan.test.ts`、本記録。4マスのchosen・条件不成立時のfallback・得意順を追加した。
- 確かめたこと：typecheck通過、全体テスト1337件通過（1件skip）、build通過。
- コミット：`[codex] 折れ線を第一案にする`（本コミット）
- 残っていること・Claude に伝えたいこと：なし。

### 2026-10-02 積み上げ縦棒を第一案に（Codex）
- 頼まれたこと：残りのチャートでも、選んだチャートを第一案にする。
- 変えたファイル：`src/features/start/dishes.ts`、`src/features/start/plan.test.ts`、本記録。4マスのchosen・条件不成立時のfallback・得意順を追加した。
- 確かめたこと：typecheck通過、全体テスト1337件通過（1件skip）、build通過。
- コミット：`[codex] 積み上げ縦棒を第一案にする`（本コミット）
- 残っていること・Claude に伝えたいこと：なし。

### 2026-10-02 散布図を第一案に（Codex）
- 頼まれたこと：残りのチャートでも、選んだチャートを第一案にする。
- 変えたファイル：`src/features/start/dishes.ts`、`src/features/start/plan.test.ts`、本記録。4マスのchosenと得意順を追加した。
- 確かめたこと：typecheck通過、全体テスト1337件通過（1件skip）、build通過。
- コミット：`[codex] 散布図を第一案にする`（本コミット）
- 残っていること・Claude に伝えたいこと：なし。

### 2026-10-02 プラス・マイナスバーを第一案に（Codex）
- 頼まれたこと：残りのチャートでも、選んだチャートを第一案にする。
- 変えたファイル：`src/features/start/dishes.ts`、`src/features/start/plan.test.ts`、本記録。4マスのchosenと得意順を追加した。
- 確かめたこと：typecheck通過、全体テスト1337件通過（1件skip）、build通過。
- コミット：`[codex] プラス・マイナスバーを第一案にする`（本コミット）
- 残っていること・Claude に伝えたいこと：なし。

### 2026-10-02 要因バーを第一案に（Codex）
- 頼まれたこと：残りのチャートでも、選んだチャートを第一案にする。
- 変えたファイル：`src/features/start/dishes.ts`、`src/features/start/plan.test.ts`、本記録。4マスのchosenと得意順を追加した。
- 確かめたこと：typecheck通過、全体テスト1337件通過（1件skip）、build通過。
- コミット：`[codex] 要因バーを第一案にする`（本コミット）
- 残っていること・Claude に伝えたいこと：なし。

### 2026-10-02 100%積み上げ縦棒を第一案に（Codex）
- 頼まれたこと：残りのチャートでも、選んだチャートを第一案にする。
- 変えたファイル：`src/features/start/dishes.ts`、`src/features/start/plan.test.ts`、本記録。4マスのchosen・条件不成立時の同一チャートfallback・得意順を追加した。
- 確かめたこと：typecheck通過、全体テスト1337件通過（1件skip）、build通過。
- コミット：`[codex] 100%積み上げ縦棒を第一案にする`（本コミット）
- 残っていること・Claude に伝えたいこと：なし。
### 2026-10-03 英語の AI 相談・編集画面の見本・注意の帯（Claude）
- 頼まれたこと：英語の画面で AI 相談の Decision が日本語になる／編集画面でチャートを替えると誰かが作ったような見本が出る／ほかのスライドの注意の帯が消せない。
- 変えたファイル：
  - `src/lib/ai/consult*.ts`・`src/features/start/StartFlow.tsx`：画面の言語を送り、その言語で文を書かせる。
  - `src/features/editor/sample.ts`・`state.ts`・`fromRecipe.ts`・`localeSwitch.ts`・`leftovers.ts`：中立の見本（AAA・BBB…と仮のタイトル）。紹介用は `toShowcase`。
  - `src/features/landing/slides.ts`・`src/features/start/chart-catalog.ts`：絵は本物らしい見本のまま。
  - `src/features/editor/Builder.tsx`・`DataGrid.tsx`・CSS・`ja.json`/`en.json`：帯の［直す］［このまま使う］、表の印。
  - テスト：`sampleNeutral.test.ts` を追加。見本の名前に頼っていたテストを中立の名前に合わせた。
- 確かめたこと：typecheck・test（1325件通過、1件skip）・build 通過。画面：編集画面の見本、帯のボタン、表の印、紹介・一覧の絵が本物らしいままであること。
- 残っていること：表・言葉の型（KPI など）の見本の文は今回は変えていない。

### 2026-10-02 Codex の第2便（5チャート）の確認と取り込み（Claude）
- 頼まれたこと：作業コピー chart-first-codex の b2f1b88 以降の5コミット（〜7c77c3d）を確認し、元のリポジトリへ取り込んで push する。
- 変えたファイル：
  - `src/features/start/coach.ts`：マスを持たないチャート（2指標スロープ）でも、KEEP_CHOSEN なら別案を「おすすめの別案」にしない。
  - `src/features/start/dishes.ts`：順位スロープ・差分バー・集合縦棒の向いていない伝えたいことを CHART_EMPHASES の hidden に。開始と終了の2時点の案の名前を直した。
  - `src/features/start/dishes.test.ts`：「4つのリードがすべて違う」から、① に出さない伝えたいことを除いた。
  - `docs/decisions.md`：決めごとを追記。
- 確かめたこと：typecheck・test（1319件通過、1件skip）・build 通過。画面：2指標スロープ・順位スロープ（集合縦棒・差分バー・100%横棒は /start の一覧に無いためテストで確認）。
- 残っていること：残りのチャート（折れ線・縦棒・横棒ランキング・積み上げ・散布図など）は次の便。

### 2026-10-02 集合縦棒を第一案に（Codex）
- 頼まれたこと：「チャートから選ぶ」で集合縦棒を選んだ時、比較の4切り口すべてで選択チャートを第一案にする。
- 変えたファイル：
  - `src/features/start/dishes.ts`：clustered_columnの4マスへchosenを追加し、比較元がない場合も同じチャートを維持するfallbackと日英noteを追加した。得意な「差」を先頭にするCHART_EMPHASESを追加し、別案の文を短くした。
  - `src/features/start/plan.test.ts`：全マスのchosen、条件不成立時もclustered_columnを維持して比較元を案内すること、得意な伝えたいことが先頭になることを追加確認した。
- 確かめたこと：typecheck通過、全体テスト1319件通過（1件skip）、build通過。
- コミット：`[codex] 集合縦棒を第一案にする`（本コミット）
- 残っていること・Claude に伝えたいこと：比較元がない時は、集合縦棒で2つの値を描くために前回値・比較対象などの追加入力が必要。

### 2026-10-02 差分バーを第一案に（Codex）
- 頼まれたこと：「チャートから選ぶ」で差分バーを選んだ時、比較の4切り口すべてで選択チャートを第一案にする。
- 変えたファイル：
  - `src/features/start/dishes.ts`：variance_barの4マスへchosenを追加し、比較元がない場合も同じチャートを維持するfallbackと日英noteを追加した。得意な「差」を先頭にするCHART_EMPHASESを追加し、別案の文を短くした。
  - `src/features/start/plan.test.ts`：全マスのchosen、条件不成立時もvariance_barを維持して比較元を案内すること、得意な伝えたいことが先頭になることを追加確認した。
  - `src/features/start/dishes.test.ts`：順位で横棒ランキングへ自動置換する旧期待値を、差分バーを第一案にして横棒を別案にする新仕様へ更新した。
- 確かめたこと：typecheck通過、全体テスト1319件通過（1件skip）、build通過。
- コミット：`[codex] 差分バーを第一案にする`（本コミット）
- 残っていること・Claude に伝えたいこと：比較元がない時は、差分を描くために目標・平均・前回値などの追加入力が必要。

### 2026-10-02 100%横棒を第一案に（Codex）
- 頼まれたこと：「チャートから選ぶ」で100%横棒を選んだ時、構成の4切り口すべてで選択チャートを第一案にする。
- 変えたファイル：
  - `src/features/start/dishes.ts`：bar_100の4マスへchosenを追加し、同一チャートの別形をplatesへ移動、データ条件不成立時のfallbackと日英noteを追加した。得意な「今の構成」を先頭にするCHART_EMPHASESを追加し、別案の文を短くした。
  - `src/features/start/plan.test.ts`：全マスのchosen、同一チャートの別形、条件不成立時もbar_100を維持すること、得意な伝えたいことが先頭になることを追加確認した。
  - `src/features/start/dishes.test.ts`：全体規模と構成でMekkoへ自動置換する旧期待値を、100%横棒を第一案にしてMekkoを別案にする新仕様へ更新した。
- 確かめたこと：typecheck通過、全体テスト1319件通過（1件skip）、build通過。
- コミット：`[codex] 100%横棒を第一案にする`（本コミット）
- 残っていること・Claude に伝えたいこと：なし。

### 2026-10-02 指標間の順位スロープを第一案に（Codex）
- 頼まれたこと：「チャートから選ぶ」で指標間の順位スロープを選んだ時、比較の4切り口すべてで選択チャートを第一案にする。
- 変えたファイル：
  - `src/features/start/dishes.ts`：rank_slopeの4マスへchosenの日英案内を追加し、同一チャート案をswitchToから外してKEEP_CHOSENへ追加した。得意な「別の指標でも同じ結果か」を先頭にするCHART_EMPHASESを追加し、別案の文を短くした。
  - `src/features/start/plan.test.ts`：全マスのchosen有無、第一案・別案・切り口変更後の復帰、得意な伝えたいことが先頭になることを確認する対象にrank_slopeを追加した。
  - `src/features/start/dishes.test.ts`：3切り口で横棒へ自動置換する旧期待値を、4切り口すべてで選んだ順位スロープを第一案にする新仕様へ更新した。
- 確かめたこと：typecheck通過、全体テスト1319件通過（1件skip）、build通過。
- コミット：`[codex] 指標間の順位スロープを第一案にする`（本コミット）
- 残っていること・Claude に伝えたいこと：なし。

### 2026-10-02 2指標スロープの切り替えUIを統一（Codex）
- 頼まれたこと：「チャートから選ぶ」で2指標スロープを選んだ時、選択チャートを第一案にする共通UIを適用する。
- 変えたファイル：
  - `src/features/start/dishes.ts`：自動置換がないslope_pairをKEEP_CHOSENへ追加し、得意な「変化の軌跡」を先頭にするCHART_EMPHASESを追加した。比較目的のマスは対象外なので追加していない。
  - `src/features/start/plan.test.ts`：得意な伝えたいことが先頭になり、②にすぐ案が出ることをslope_pairでも確認した。
- 確かめたこと：typecheck通過、全体テスト1319件通過（1件skip）、build通過。
- コミット：`[codex] 2指標スロープを第一案にする`（本コミット）
- 残っていること・Claude に伝えたいこと：なし。

### 2026-10-02 チャートから選ぶ：得意な順・別案とおすすめの別案（Claude）
- 変えたファイル：`dishes.ts`（CHART_EMPHASES、recommendAlt、6チャートの違い・助言の文の書き直し）、`plan.ts`（並び・最初の選択）、`coach.ts`、`RecipeScreen.tsx`、文言、テスト、`AGENTS.md`（作業 C の注意点を追記）。
- 確かめたこと：typecheck / test / build 通過。Mekko・幅が変わる縦棒を画面で確認。
- Codex へ：作業 C でチャートを足す時は、CHART_EMPHASES も書くこと（AGENTS.md 参照）。

### 2026-10-02 チャートから選ぶ：Codex の5チャートの確認と仕上げ（Claude）
- Codex の5つのコミット（share_pair・waterfall・variable_width・bubble・slope）を確認し、元のリポジトリへ取り込んだ。範囲（dishes.ts・テスト・記録）を守っていた。
- 仕上げ：スロープの3時点以上の時・成長の牽引役で項目が1つの時に、スロープのまま理由を出す（`when`・`fallback`・`note`）。テスト1件を新しい決まりに合わせた。
- 確かめたこと：typecheck / test / build 通過。スロープ・ウォーターフォールの画面を確認。
- 残っていること：残りのチャート（折れ線・縦棒・横棒・積み上げ・100%積み上げ・散布図・要因バー・プラスマイナス・差分バー・集合縦棒・順位スロープ・複合など）。

### 2026-10-02 スロープを第一案に（Codex）
- 頼まれたこと：「チャートから選ぶ」でスロープを選んだ時、4つの切り口すべてで選択チャートを第一案にする。
- 変えたファイル：
  - `src/features/start/dishes.ts`：slopeの4マスへchosenの日英案内を追加し、KEEP_CHOSENへ追加した。
  - `src/features/start/plan.test.ts`：第一案・別案・切り口変更後の復帰を確認する対象にslopeを追加した。
- 確かめたこと：対象テスト27件・typecheck・buildは通った。全体テストは1303件通過、1件skip、既存`dishes.test.ts`の「条件不一致ならスロープを折れ線へ自動置換する」旧仕様1件だけ失敗した。
- コミット：`[codex] スロープを第一案にする`（本コミット）
- 残っていること・Claude に伝えたいこと：作業Cでは選んだスロープを第一案にするため、旧仕様を固定した`dishes.test.ts`の期待値更新が必要。許可範囲外なので未変更。

### 2026-10-02 バブルを第一案に（Codex）
- 頼まれたこと：「チャートから選ぶ」でバブルを選んだ時、4つの切り口すべてで選択チャートを第一案にする。
- 変えたファイル：
  - `src/features/start/dishes.ts`：bubbleの4マスへchosenの日英案内を追加し、KEEP_CHOSENへ追加した。
  - `src/features/start/plan.test.ts`：第一案・別案・切り口変更後の復帰を確認する対象にbubbleを追加した。
- 確かめたこと：第1便の5チャート実装後にtypecheck / test / buildをまとめて実行する。
- コミット：`[codex] バブルを第一案にする`（本コミット）
- 残っていること・Claude に伝えたいこと：なし。

### 2026-10-02 幅が変わる縦棒を第一案に（Codex）
- 頼まれたこと：「チャートから選ぶ」で幅が変わる縦棒を選んだ時、4つの切り口すべてで選択チャートを第一案にする。
- 変えたファイル：
  - `src/features/start/dishes.ts`：variable_widthの4マスへchosenの日英案内を追加し、KEEP_CHOSENへ追加した。
  - `src/features/start/plan.test.ts`：第一案・別案・切り口変更後の復帰を確認する対象にvariable_widthを追加した。
- 確かめたこと：第1便の5チャート実装後にtypecheck / test / buildをまとめて実行する。
- コミット：`[codex] 幅が変わる縦棒を第一案にする`（本コミット）
- 残っていること・Claude に伝えたいこと：なし。

### 2026-10-02 ウォーターフォールを第一案に（Codex）
- 頼まれたこと：「チャートから選ぶ」でウォーターフォールを選んだ時、4つの切り口すべてで選択チャートを第一案にする。
- 変えたファイル：
  - `src/features/start/dishes.ts`：waterfallの4マスへchosenの日英案内を追加し、KEEP_CHOSENへ追加した。
  - `src/features/start/plan.test.ts`：第一案・別案・切り口変更後の復帰を確認する対象にwaterfallを追加した。
- 確かめたこと：第1便の5チャート実装後にtypecheck / test / buildをまとめて実行する。
- コミット：`[codex] ウォーターフォールを第一案にする`（本コミット）
- 残っていること・Claude に伝えたいこと：なし。

### 2026-10-02 2期間の100%積み上げを第一案に（Codex）
- 頼まれたこと：「チャートから選ぶ」で2期間の100%積み上げ（カテゴリ別）を選んだ時、4つの切り口すべてで選択チャートを第一案にする。
- 変えたファイル：
  - `src/features/start/dishes.ts`：share_pairの4マスへchosenの日英案内を追加し、KEEP_CHOSENへ追加した。
  - `src/features/start/plan.test.ts`：第一案・別案・切り口変更後の復帰を共通確認するテストを追加した。
- 確かめたこと：第1便の5チャート実装後にtypecheck / test / buildをまとめて実行する。
- コミット：`[codex] 2期間の100%積み上げを第一案にする`（本コミット）
- 残っていること・Claude に伝えたいこと：なし。

### 2026-10-02 チャートから選ぶ：Mekko を第一案に（Claude）
- 変えたファイル：`src/features/start/dishes.ts`（Mekko のマスに chosen、KEEP_CHOSEN・resolveChosen）、`coach.ts`（推薦の分岐・Proposal.name）、`plan.ts`（伝えたいことを替えたら選んだチャートの案に戻す）、`RecipeScreen.tsx`（選んだチャートで作る／Coachからの別案のカード、現在の選択）、`src/registry/recipes.ts`・`ids.ts`（MIX_MEKKO_SHIFT）、文言、テスト。
- 確かめたこと：typecheck / test / build 通過。Mekko の4つの伝えたいことを画面で確認。
- 残っていること：ほかのチャートへの展開、時点別の構成比テーブル、カード内での強調項目の選択。

### 2026-10-02 配色テーマの仕上げ（Claude）
- Codex の「チャートのカラーテーマを4種類追加」を確認し、残りを対応した。
- 変えたファイル：
  - `src/registry/controls.ts`：配色の選択肢に4テーマを追加。
  - `src/engine/layout/charts/combo-config.ts`：複合グラフの棒・線の色を、単色の濃淡テーマ全部と Pastel Pop で使い分け。
  - `src/engine/theme.ts`：`singleHueScale` を追加。Pastel Pop の primary を線の色、secondary を面の色に。
  - `src/engine/theme.test.ts`：レジストリと THEME_IDS の一致、複合グラフの色のテストを追加。
  - `src/features/story/QuestionMap.tsx` → `QuestionMapView.tsx`（大文字・小文字の衝突の解消）。
- 確かめたこと：typecheck / test / build 通過。6テーマ×6チャートの見本と、編集画面の配色の選択を画面で確認。
- 残っていること：なし

### 2026-10-02 チャートのカラーテーマを4種類追加（Codex）
- 頼まれたこと：既存2テーマを維持したまま、Deep Ocean Teal・Executive Plum・Warm Market・Pastel Popを追加する。
- 変えたファイル：
  - `src/engine/theme.ts`：4テーマのIDと色を追加し、単色濃淡の共通選択処理とPastel Popの面色・線色を実装した。
  - `src/features/editor/ThemePicker.tsx`：6テーマの見本・表示順・Plus対象・7項目超過時の注意対象を更新した。
  - `src/i18n/messages/ja.json`：新テーマの名前・説明と、テーマ共通の項目数警告を追加した。
  - `src/i18n/messages/en.json`：新テーマの名前・説明と、テーマ共通の項目数警告を追加した。
  - `src/engine/theme.test.ts`：既存テーマの互換性、新テーマの色選択・保存・描画・PPT一致を検証するテストを追加した。
- 確かめたこと：テーマ関連テスト34件と全体テスト（1281件、1件skip）は通った。typecheckとbuildは、既存のStory機能にある`QuestionMap.ts` / `questionMap.ts`の大文字小文字競合で失敗（buildのコンパイル自体は成功）。ブラウザの管理ポリシー確認が通らず、実画面の目視確認は未実施。
- コミット：`[codex] チャートのカラーテーマを4種類追加`（本コミット）
- 残っていること・Claude に伝えたいこと：許可範囲外の`src/registry/controls.ts`と`src/engine/layout/charts/combo-config.ts`は未変更。combo固有の棒・線の色分け、レジストリ選択肢、目視確認、既存Story型エラーの解消はClaude側で対応が必要。
