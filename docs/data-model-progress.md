# データの持ち方の作り直し：進み具合

設計：`docs/data-model-proposal.md`（正本）。作業の決まり：`AGENTS.md` 2.1 E。
Codex・Claude のどちらが続きをしても、**このファイルだけ読めば始められる**ように書く。新しい記録を上に書く。

## 今の状態（ここを毎回書き換える）

- 今の段階：**段階6完了。旧ユーザーデータ移行の実装完了・本番ドライラン待ち**
- 作業コピー：`~/Project/Narratix web app-data-model-codex`
- 元にした main のコミット：`9a70733`
- 最後のコミット：`[codex] 旧チャートとStoryの移行処理を作る`（本コミット）
- typecheck / test / build：通過（DB対象テストを含む全体テスト1388件、1件skip）。本番データには接続していない。
- 次に始める場所：ユーザーが`20261011000000_import_legacy_user_decks.sql`を本番へ適用し、旧チャート47件・Story 19件のdry-run→移行→画面確認を行う。旧表はその後も残す。データ提供元はClaudeの設計判断待ち。

## チェックリスト（提案書 7章の順）

- [x] 0a. テンプレートの書き出し：済（2026-10-03。31件、すべて公開。`supabase/seed/library_items.v3.json`。全件 `normalizeProject` で読めることを確認）
- [x] 0b. 準備：作業コピーを作る（2026-10-03。main `9a70733` から作成）
- [x] 1. 型と変換：`CanonicalTable`・`DeckContent`・`SlideRecord`・`TextField`・`SourceRecord` の型。今の Dataset／ProjectState ⇄ 新しい形の変換（`src/features/data/canonical.ts`）。往復のテスト（推移・Mekko・2指標スロープ・順位スロープ・縦長の表・バブルのグループ・表／言葉の型）（2026-10-03）
- [x] 2. DB：workspaces・workspace_members・sources・**dataset_assets**・dataset_versions・decks・deck_versions・templates のマイグレーションと RLS。テスト（workspace の境界、版は書き換え不可、他人のものは見えない）（2026-10-03）
- [x] 3. 保存と読み込み：`src/lib/repo/` を decks に置き換え（チャート・ストーリー・下書き・複製・削除・見る・タグ）。PPT 出力で版を固定（2026-10-03）
- [x] 4. 文の書き手：タイトル・チャートタイトル・問いに `author` と `basis`。`titleData` を `basis` に置き換え（2026-10-03）
- [x] 5. 出典とサンプルの区別：「出典」の欄を `sources` につなぐ（URL・公開日は任意）。見本は `kind: 'sample'`（2026-10-03）
- [x] 6. テンプレートの読み込み：`scripts/import-templates.ts`。旧Library 31件を自己完結したdeck／データへ変換し、画面の読込・公開・更新先をtemplatesへ切り替え（2026-10-03）
- [ ] 6a. 旧ユーザーデータを移す：移行処理とDB関数は完成。本番の旧チャート47件・Story 19件をdry-run／移行／確認する（2026-10-03、実行待ち）
- [ ] 7. 古い表を消す（旧ユーザーデータの移行確認後、改めてユーザーの許可を得てから）

## ユーザーがすること（Codex はしない）

- [x] テンプレートの書き出し（済。main に入れた）
- [x] 段階2〜5のマイグレーションを本番Supabaseに適用（2026-10-03、ユーザー実施）
- [x] `npm run import:templates`で31件を本番templatesへ投入（2026-10-03、ユーザー実施）
- [ ] 旧データ移行用マイグレーションを適用し、`npm run import:legacy-user-data -- --dry-run`で47件・19件を確認後、実行する
- [ ] 段階7で古い表を消すことの許可

## 決めたこと

（理由つきで書く。提案書と違う判断は `docs/decisions.md` にも）

- テンプレートの書き出しは、元のまま保存した（直さない）。読み込む時（段階6）に次を直す：
  - 「宇宙事業の資料作成本数推移」と「Space Business Presentation」の2件は、期間の名前が訪日データの指標名（Visitor arrivals… / Travel spending…）のまま（P0-6 の混入）。読み込む時に期間の名前を空にする（中身は四半期×テーマの本数で、指標が2つあるデータではない）。
  - `created_by`（作った人の id）は読み込まない。新しい形ではシステムのテンプレートとして持つ。
- **表名（Claude が決定、2026-10-03）**：新しいデータの資産の表は **`dataset_assets`** とし、**ずっとこの名前にする（段階7で `datasets` に改名しない）**。旧 `public.datasets` は段階7まで今のまま残し、段階7で消すだけにする。
  - 理由：改名すると、マイグレーション・外部キー・RLS・repo のコードを2回書き換えることになり、間違いと手戻りが増える。今動いているアプリ（main）は旧 `datasets` を使っているので、旧表の改名（`legacy_datasets` など）は、切り替える前の本番を壊す。旧表をその場で作り替えるのも、並べて移行する決まりに反する。
  - ほかの新しい表（workspaces・workspace_members・sources・dataset_versions・decks・deck_versions・templates）は旧表と重ならないので、提案書のとおりの名前でよい。
  - コードの型の名前（Dataset・DatasetVersion）は変えない。repo の中で表名だけ `dataset_assets` を使う。提案書の3章・5章・6章の表名もこの名前に直した。
- 新規利用者には個人workspaceとownerメンバーをDB triggerで自動作成し、既存利用者にはマイグレーション内で同じものを補う。今は個人workspaceだけだが、RLSはworkspace_membersを境界にする。
- `dataset_versions`と`deck_versions`は利用者にSELECT・INSERTだけを許可し、UPDATE・DELETEを許可しない。資産とdeckは`deleted_at`で非表示にできる形にして直接DELETEを許可せず、workspace全体を削除した時だけ版を含めて消す。
- テンプレートは、公開時点の`deck_content`と`dataset_contents`を自己完結したJSONとして保存する。公開中は未ログインでも読め、追加・変更・削除は管理者だけにする。
- `decks.working`と`deck_versions.content`には、正規化したdeck本体に、画面へ戻すためのeditor情報と「ローカルのデータ参照→dataset_version id」の対応を加えて保存する。Story固有の状態はデータ本体を除いて持ち、開く時にdataset_versionsから組み直す。
- アカウントの下書きは、まだ版が無い`kind: 'chart'`のdeckとして`working`に置く。チャート・Storyの削除は`deleted_at`による論理削除にし、版は残す。
- 同じ値・意味のデータはhashで既存のdataset_versionを再利用する。Storyは最初・名前変更・30分ごと・PPT出力で版を作り、通常の自動保存は`working`だけを更新する。PPT出力は`deck_exports`に使った版を記録する。
- 段階1の変換では、正規化した`fields`・`records`を値と意味の正本にし、今のDatasetも`input`として同じ版に残す。元の貼り付け・縦長表・読み方を失わず、画面内の形を変えないため。
- 2指標スロープと順位スロープでは、今の`periods.current/base`を時間ではなく2つのmeasureへ変換する。指標名の末尾の括弧は単位へ分ける。
- 同一版の判定用に、値と欠損の`contentHash`、項目名・単位などの`semanticsHash`を分けた。現段階ではブラウザとNodeで同じ結果になる決定的なFNV-1a文字列を使う。
- 文の`basis`は`dataset_versions`と同じ`contentHash`・`semanticsHash`を使う。編集画面では版id以外を持ち、保存時にそのスライドが参照するdataset versionのidを補う。これにより、値だけでなく項目名・単位・期間の意味が変わった時も古さを知らせられる。
- メッセージタイトルはユーザー／AI修正／見本／テンプレート／規則を、チャートタイトルは手入力／自動規則を、Storyの決めたい問いと各問いはAI／規則／ユーザー編集を区別する。旧`titleData`は新しい保存には持ち越さず、現在のデータ版を根拠に置き換える。
- 今の出典表示文は`citationText`として残し、編集画面では資料名を中心に入力し、URL・公開日は任意にする。取得日はDB保存日を既定にする。見本の出典は`kind: 'sample'`、URLを入れた出典は`external_web`、それ以外の新規入力は`internal`にする。
- 出典を変更した時は既存の`sources`行を上書きせず新しい行を作り、`dataset_versions.source_ids`が違えば値が同じでも新しいデータ版を作る。過去のPPT版が参照した出典を後から変えないため。
- テンプレートは旧Libraryの31件を、自己完結した`deck_content`と`dataset_contents`へ変換する。文の書き手は`template`、データの出典は`sample`にし、旧`created_by`は持ち込まない。テンプレートから保存したdeckには`template_id`を残す。
- 公的統計などをBiz Slide Coachがテンプレートとして提供する場合、原資料の組織・資料名・URLは`sources`に、サービス上の所有・提供主体は`dataset_assets.workspace_id`／`created_by`に持てる。ただし、画面に「データ提供元：Biz Slide Coach」と明示する専用項目はまだ無い。必要になった時に表示要件と合わせて設計する（今回の段階6では追加しない）。
- 本番には`taisuke.sano@gmail.com`所有の旧チャート47件・Story 19件があり、ダミーとして消してよいという当初の前提とは違った。段階7の前に現在状態を新しいdeckへ移し、画面で確認する。旧IDとチャートの版番号を引き継ぎ、旧表は変更せず、再実行は移行済みとしてスキップする。

## 迷っていること・Claude に判断してほしいこと

（ここに書いたら、その段階で止める）

- **データ提供元の保存先**：ユーザーは、公的統計をBiz Slide Coachがテンプレートとして提供する場合に、「出典／発行元：総務省」と「データ提供元：Biz Slide Coach」を別々にバックエンドで持てることを希望している。PPTには追加しない。現在の`dataset_assets.workspace_id`／`created_by`は所有・作成主体であり、意味上のデータ提供元を明示する専用項目ではない。`sources.provider`のように出典ごとに持つか、dataset asset／version側に持つかをClaudeが決める。決定後は型、DB、保存読込、テンプレート変換とテストへ反映する。

## 記録（新しいものを上に）

### 2026-10-03 旧ユーザーデータの移行処理（Codex）
- したこと：本番に残っていた旧チャート47件・Story 19件を新しいdeck／データ資産／版／出典へ移すスクリプトと、1件を1トランザクションで保存するservice_role専用DB関数を追加した。旧IDとチャートの版番号を引き継ぎ、旧表は読取だけにし、再実行では移行済みをスキップする。
- 変えたファイル：`scripts/import-legacy-user-data.ts`、`src/features/data/legacyImport.ts`・`legacyImport.test.ts`、`supabase/migrations/20261011000000_import_legacy_user_decks.sql`、`supabase/tests/migration.test.ts`、`package.json`、`docs/data-model-progress.md`、`docs/handoff-log.md`、`docs/decisions.md`
- コミット：`[codex] 旧チャートとStoryの移行処理を作る`（本コミット）
- 確かめたこと：旧チャート／Storyの正規化、読めない行で全体停止、service_roleだけの実行、1件の一括保存、再実行時のスキップ、旧版番号・出典・データ版の保存をテストした。typecheck、全体テスト1388件（1件skip）、buildが通った。本番データには接続していない。
- 残っていること・次の人へ：ユーザーが新マイグレーションを本番へ適用し、既存のowner／workspace／service roleを使ってdry-runする。`Validated 47 charts and 19 stories.`を確認してから本実行し、画面と件数を照合する。旧表は削除しない。

### 2026-10-03 データ提供元の要件を記録（Codex）
- したこと：原資料の発行元とは別に、Biz Slide Coachなどのデータ提供元をバックエンドで明示的に保持し、PPTには追加しないというユーザー要件を記録した。現在のworkspace／created_byは所有情報で代用できないため、保存先の設計判断が必要とした。
- 変えたファイル：`docs/data-model-progress.md`、`docs/handoff-log.md`
- コミット：`[codex] データ提供元の設計要件を記録する`（本コミット）
- 確かめたこと：現在のSourceMeta・sources・dataset_assets・dataset_versions・テンプレート変換を確認し、専用項目が無いことを確認した。コードとDBは変更していない。typecheck、全体テスト1385件（1件skip）、buildが通った。
- 残っていること・次の人へ：Claudeがデータ提供元をsourcesとdataset asset／versionのどこに持つかを決める。決定後、バックエンドだけに実装し、PPTには追加しない。段階7も引き続きユーザーの明示的な許可待ち。

### 2026-10-03 段階6 テンプレートの読み込み（Codex）
- したこと：旧Libraryの書き出し31件を新しいtemplatesの自己完結したdeck／データへ変換する処理と投入スクリプトを追加した。文をtemplate、出典をsampleとして記録し、旧作成者は持ち込まない。テンプレート画面の読込・公開・更新・公開切替・削除を新しいtemplatesへ切り替え、テンプレートから作ったdeckには元のtemplate idを残す。
- 変えたファイル：`scripts/import-templates.ts`、`src/features/data/template.ts`・`template.test.ts`・`canonical.ts`、`src/lib/repo/library.ts`・`decks.ts`・`decks.test.ts`、`package.json`・`package-lock.json`、`docs/data-model-progress.md`、`docs/handoff-log.md`
- コミット：`[codex] テンプレートを新しい保存形式へ移す`（本コミット）
- 確かめたこと：`npm run import:templates -- --dry-run`で31件を検証した。全件公開、旧created_byを含まない、出典がsample、既知の2件だけ混入した期間名を直すこと、変換の往復、テンプレート由来deckのtemplate_idを確認した。typecheck、全体テスト1385件（1件skip）、buildが通った。実データの投入と本番Supabaseへの接続はしていない。
- 残っていること・次の人へ：新しいマイグレーションを本番へ当てた後、ユーザーまたはClaudeが投入スクリプトを実行し、ログイン状態でテンプレート全件の表示・コピー・編集・PPT出力を確認する。段階7は旧表を消すため、ユーザーの明示的な許可が出るまで始めない。

### 2026-10-03 段階5 出典とサンプルの区別（Codex）
- したこと：既存の出典表示文を保ったまま、資料名・種類・URL・公開日・取得日などを構造化し、sourcesとdataset_versions.source_idsへ保存・読込するようにした。編集画面とかんたん修正に資料名、任意のURL・公開日を追加した。見本はsampleとして保存し、出典変更時は過去版を上書きしない。
- 変えたファイル：`supabase/migrations/20261010000000_dataset_sources.sql`、`supabase/tests/migration.test.ts`、`src/features/data/source.ts`・`source.test.ts`・`canonical.ts`、`src/features/editor/state.ts`・`project.ts`・`SlideFields.tsx`・`leftovers.ts`・`localeSwitch.ts`、`src/features/quick/QuickEdit.tsx`、`src/features/story/model.ts`・`storyProject.ts`、`src/lib/repo/decks.ts`・`decks.test.ts`、`src/i18n/messages/ja.json`・`en.json`、`docs/data-model-progress.md`、`docs/handoff-log.md`
- コミット：`[codex] 出典をデータ版につなぐ`（本コミット）
- 確かめたこと：DBテスト34件で出典のworkspace境界、データ版との関連、変更時に旧出典を残すことを確認した。専用テストで見本判定、資料名から表示文への変換、URL・公開日、保存→読込を確認した。typecheck、全体テスト1382件（1件skip）、buildが通った。本番Supabaseには触れていない。
- 残っていること・次の人へ：段階6のテンプレート読み込みへ進む。新しいマイグレーションはすべて本番未適用。

### 2026-10-03 段階4 文の書き手（Codex）
- したこと：メッセージタイトル・チャートタイトル・Storyの名前／決めたい問い／各スライドの問いに書き手を記録し、文を書いた時のデータ版・値hash・意味hashを`basis`として保存するようにした。ユーザー入力、AI案の修正、見本、テンプレート、自動規則を区別する。旧`titleData`による古さ判定は、値と意味を別々に比べる`basis`へ置き換えた。
- 変えたファイル：`src/features/data/text.ts`・`text.test.ts`・`canonical.ts`・`canonical.test.ts`、`src/features/editor/state.ts`・`project.ts`・`chartHeader.ts`・`SlideFields.tsx`・`ChartHeaderFields.tsx`、`src/features/story/model.ts`・`questionMap.ts`・`storyOps.ts`・`storyProject.ts`、`src/features/start/dishView.ts`、`src/lib/repo/decks.ts`・`decks.test.ts`、`docs/data-model-progress.md`、`docs/handoff-log.md`
- コミット：`[codex] 文の書き手と根拠を記録する`（本コミット）
- 確かめたこと：専用テストでユーザー入力・見本・テンプレート・自動チャートタイトル、AIの決めたい問い・規則の問い・ユーザー編集、値と意味の変更による古さを確認した。typecheck、全体テスト1378件（1件skip）、buildが通った。保存→読込テストは、読込時に`basis`が補われる新しい決まりに合わせて期待値を更新した。本番Supabaseには触れていない。
- 残っていること・次の人へ：段階5の出典とサンプルの区別へ進む。段階2・3のマイグレーションは本番未適用。

### 2026-10-03 段階3 保存と読み込み（Codex）
- したこと：チャート・Story・アカウント下書きの保存先を新しいdataset_assets／dataset_versions／decks／deck_versionsへ切り替えた。hashが同じデータ版の再利用、Storyの自動保存と区切り版、タグ、複製元、論理削除、一覧・閲覧を共通deck repoで扱う。PPT生成に成功した保存済みdeckは、その時点のデータ版とdeck版を固定してdeck_exportsへ記録する。
- 変えたファイル：`supabase/migrations/20261009000000_deck_repo.sql`、`supabase/tests/migration.test.ts`、`src/lib/repo/decks.ts`・`decks.test.ts`・`errors.ts`・`charts.ts`・`charts.test.ts`・`stories.ts`・`stories.test.ts`・`drafts.ts`、`src/features/editor/Builder.tsx`・`drafts.ts`・`drafts.test.ts`、`src/features/quick/QuickEdit.tsx`、`docs/data-model-progress.md`、`docs/handoff-log.md`
- コミット：`[codex] 保存と読み込みをdecksへ切り替える`（本コミット）
- 確かめたこと：対象テスト50件、typecheck、全体テスト1374件（1件skip）、buildが通った。「作る→保存→開く→同じ状態からPPT生成→出力版を固定」、一覧・タグ・複製・論理削除、同じhashの版を増やさないこと、Storyのworking自動保存と区切り版を確認した。旧表は残したままで、本番Supabaseには触れていない。
- 残っていること・次の人へ：段階4の文の書き手へ進む。段階2・3のマイグレーションを本番へ当てる作業は未実施。

### 2026-10-03 段階2 DB（Codex）
- したこと：workspace・出典・データ資産／版・deck／版・テンプレートの新しい表、個人workspaceの自動作成、外部キー・hashの重複防止・同じworkspaceの出典だけを使う制約、RLSと権限を追加した。旧`datasets`を含む古い表は変更していない。
- 変えたファイル：`supabase/migrations/20261008000000_data_assets_and_decks.sql`、`supabase/tests/migration.test.ts`、`docs/data-model-progress.md`、`docs/handoff-log.md`
- コミット：`[codex] 新しいデータ資産と資料のDBを作る`（本コミット）
- 確かめたこと：DB専用テスト30件、typecheck、全体テスト1370件（1件skip）、buildが通った。個人workspaceの自動作成、workspace境界、他人からの不可視・書込拒否、版の更新・削除拒否、別workspaceの出典参照拒否、公開テンプレートの権限、workspace全体を消す場合だけの一括削除を確認した。本番Supabaseには触れていない。
- 残っていること・次の人へ：段階3の保存と読み込みへ進む。マイグレーションを本番へ当てるのはユーザーとClaudeが行う。

### 2026-10-03 段階2の表名を決定（Claude）
- したこと：Codex が止めた表名の衝突を判断した。新しい表は `dataset_assets`（改名しない）、旧 `datasets` は段階7で消すだけ。理由は「決めたこと」。提案書の表名を直した。
- 変えたファイル：`docs/data-model-proposal.md`、`docs/data-model-progress.md`、`docs/handoff-log.md`、`docs/decisions.md`
- 確かめたこと：既存のマイグレーションに、新しい表の名前（workspaces・sources・dataset_assets・dataset_versions・decks・deck_versions・templates）と重なるものが無い。コードは変えていない。
- 残っていること・次の人へ：Codex は段階2のマイグレーションから再開する。


### 2026-10-03 段階2 DBの表名衝突を確認（Codex）
- したこと：既存マイグレーションと提案書を照合し、旧`public.datasets`を残したまま新しい`public.datasets`を作れないことを確認した。設計変更を伴うため、マイグレーションには着手せず判断事項として記録した。
- 変えたファイル：`docs/data-model-progress.md`、`docs/handoff-log.md`
- コミット：`[codex] DB表名の設計判断を記録する`（本コミット）
- 確かめたこと：typecheck、全体テスト1364件（1件skip）、buildが通った。段階1までのコードは正常で、本番Supabaseには触れていない。
- 残っていること・次の人へ：Claudeが旧表と新表の`datasets`の移行時の名前を決めた後、段階2から再開する。

### 2026-10-03 段階1 型と変換（Codex）
- したこと：新しい正規形の型と、Dataset／ProjectStateとの往復変換を`src/features/data/canonical.ts`に追加した。通常表・Mekkoは行／列／期間／値、2指標チャートは2つのmeasure、バブルのグループはdimension、縦長表は元のレコードとして保存する。
- 変えたファイル：`src/features/data/canonical.ts`、`src/features/data/canonical.test.ts`、`docs/data-model-progress.md`、`docs/handoff-log.md`
- コミット：`[codex] 正規化データの型と往復変換を作る`（本コミット）
- 確かめたこと：専用テスト10件、typecheck、全体テスト1364件（1件skip）、buildが通った。行×列・Mekko・2指標スロープ・順位スロープ・縦長表・バブルのグループ・表／言葉の型が往復し、非表示項目もデータ版に残ることを確認した。
- 残っていること・次の人へ：段階2のDBへ進む。本番Supabaseには触れていない。

### 2026-10-03 段階0b 作業コピーの準備（Codex）
- したこと：main `9a70733` から専用の作業コピーを作り、正本・作業規則・進捗表を確認した。
- 変えたファイル：`docs/data-model-progress.md`、`docs/handoff-log.md`
- コミット：`[codex] データモデル作業コピーを準備する`（本コミット）
- 確かめたこと：typecheck通過、全体テスト1354件通過（1件skip）、build通過。コード変更前の基準が正常であることを確認した。
- 残っていること・次の人へ：段階1の型と変換から始める。本番Supabaseには触れていない。

### YYYY-MM-DD 段階N 〈名前〉（Codex）
- したこと：
- 変えたファイル：
- コミット：
- 確かめたこと：typecheck / test / build、往復のテスト、作る→保存→開く→PPT 出力
- 残っていること・次の人へ：
