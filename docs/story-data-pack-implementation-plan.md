# Story Data Pack／Data Coach 実装計画（Claudeレビュー用）

- 作成日：2026-10-08
- 作成：Codex
- 開始時の `main`：`a5beb99`
- UX確認用モック：`/Users/sanotaisuke/Documents/Codex/2026-10-05/new-chat/outputs/story-data-template-builder-preview.html`
- 状態：**実装前。Claudeとユーザーの確認後に着手する**

## 1. 目的

Storyを作る人は、必要なデータの形や不足項目に自信がないことを前提とする。Coachが相談文と整理済みのStoryから、Storyを成立させるための複数の収集テンプレートを提案し、ひとつの「Storyデータパック」として出力できるようにする。

1つのStoryを1つの表へ無理にまとめない。行の粒度・入手先・担当者が異なる場合は別Datasetとして扱う。出力の先頭には `00_Overview` を置き、Storyの背景と各Datasetの役割をデータ入力担当者へ伝える。

## 2. 確定しているUX方針

### 2.1 導線

1. Storyの流れを確認する。
2. `Coachに相談`を押す。
3. Coachが提案した複数Datasetを確認する。
4. Datasetごとに項目を選択・追加・削除・並べ替え・改名する。
5. 必要ならDatasetを追加する。
6. `Storyデータパックを作成`を押す。
7. `00_Overview`と各入力シートをPreviewする。
8. Excel／Google Sheets／メールで依頼のいずれかへ進む。

「データはいま、どの状態ですか？」という事前質問は挟まない。`docs/story-spec.md` 10.5の「Data Planは質問ウィザードではなく参考情報」「事前回答ボタンは挟まない」と一致する。

### 2.2 データを分ける基準

- 行の粒度・入手先・入力担当者が同じ：同じDatasetの列として提案する。
- 行の粒度・入手先・入力担当者のいずれかが異なる：別Datasetとして提案する。
- Coachが初期提案するDatasetは2〜4個を目安とし、空の自由設計画面から始めない。
- ユーザーは提案の採否、項目編集、Dataset追加を行える。
- 意味が変わらない限り追加質問をしない。単位・通貨・実績／予測・対応キーが曖昧で、黙って進めると意味が変わる時だけ確認する。

### 2.3 入力操作

- 項目候補はクリックで採用／解除できる。
- 右側で上下移動、削除、鉛筆による列名変更ができる。
- 自由項目を追加できる。
- 日本語IMEの変換確定中のEnterでは項目を追加しない（`compositionstart`／`compositionend`と`KeyboardEvent.isComposing`を確認する）。
- 必須項目が不足しているDatasetを具体名で示し、データパック作成を無効にする。

## 3. 出力するデータパック

### 3.1 シート構成

```text
00_Overview
01_売上実績
02_市場データ
03_収益データ
…
```

`00_Overview`には、すでにStoryで整理済みの情報から次を自動生成する。

- Storyタイトル
- 元の相談・背景（長文は要約せず、表示上だけ適切な長さにする）
- 明らかにしたいこと／`decisionQuestion`
- 対象期間など、相談から確認できている条件
- StoryのQuestionの流れ
- Dataset一覧
- DatasetごとのStoryでの役割、1行の粒度、必須／推奨／任意
- Dataset間の共通キー
- 入力ルール（単位・通貨・取得不能時の`N/A`など）

Overviewは自動生成後に編集できるが、Story本文を黙って書き換えない。Overview固有の上書きを保存する。

### 3.2 各Datasetシート

- 選択した順番を列順にする。
- Dimension（年、地域、商品など）の入力例だけを数行置く。
- 数値項目は空欄にする。
- 列見出し、説明、必須／任意、入力ルールを保持する。
- 取得できない項目を`N/A`とするか空欄とするかは、テンプレート単位で明記する。

### 3.3 出力方法

- **Excel**：1 WorkbookにOverviewとDatasetごとのSheetを作る。
- **Google Sheets**：レビュー判断事項。直接作成にはGoogle OAuth／Drive APIが必要で、現状は仕組みがない。V1では「Google Sheetsで開けるExcelをダウンロード」と明記する案、またはOAuthを新規実装する案を選ぶ。
- **メールで依頼**：既存のPPT共有と同じく、Workbookをダウンロードして`mailto:`で件名・依頼文を開く。ブラウザから添付はできないため「ダウンロードしたファイルを添付してください」と案内する。

## 4. 現行コードとの対応

### 4.1 再利用できるもの

- `src/features/story/model.ts`
  - `StoryState.datasets: StoryDataset[]`がすでに複数Datasetを持つ。
  - `StorySlide.datasetRefs`がスライドからDatasetを参照する。
  - `StorySlide.suggestedDataNeeds`が必要データのラベル・形・理由を持つ。
- `src/features/editor/project.ts`
  - `ProjectState.dataset`、`datasets`、`extra`、`SlideState.dataRef`で複数の実データを扱う土台がある。
- `src/features/story/storyProject.ts`
  - StoryとEditorのProjectを相互変換する。現在のコメントどおり、複数Datasetの完全対応は未完。
- `src/lib/repo/decks.ts`／`src/lib/repo/stories.ts`
  - Storyをdeckとして保存し、実データはdataset versionへ分離する現行の正規形を利用できる。
- `src/lib/ai/plans.ts`
  - `canUseStory(plan)`と`BETA_OPEN_STORY`がある。Data Coach／Data PackはStory機能の一部として同じPro（plan ID `team`）判定を使う。
- `src/features/editor/pptExport.ts`
  - ファイルダウンロードと`mailto:`へのフォールバックの考え方を再利用できる。

### 4.2 新しく必要なもの

実データが入る前の「収集設計」は`StoryDataset`へ直接入れない。`StoryDataset`は`BuilderState['dataset']`を必須とするため、空の収集テンプレートを見本データで偽装すると、サンプルと実データの混同を再発させる。

提案型（名称はClaudeレビュー後に確定）：

```ts
interface StoryDataPackPlan {
  version: 1;
  overview: {
    titleOverride?: string;
    backgroundOverride?: string;
    purposeOverride?: string;
    rulesOverride?: string;
  };
  templates: StoryDatasetTemplate[];
}

interface StoryDatasetTemplate {
  id: string;
  label: string;
  role: string;
  importance: 'required' | 'recommended' | 'optional' | 'custom';
  grain: string[];
  fields: StoryDatasetTemplateField[];
  sharedKeys: string[];
}

interface StoryDatasetTemplateField {
  id: string;
  label: string;
  description: string;
  kind: 'dimension' | 'measure';
  required: boolean;
}
```

`StoryState`へ`dataPackPlan?: StoryDataPackPlan`を追加する。これは未入力テンプレートなのでdataset assetを作らず、Storyのworking stateに保存する。データ入力後は既存の`StoryDataset`／dataset versionを正本にする。

## 5. Coach提案の作り方

### 推奨V1

新しいAI呼び出しを増やさない。最初のAI相談の応答に任意の`data_pack`を追加し、相談文だけから複数Datasetの候補を返す。

- 元Dataset全体はAIへ送らない。
- 既存の`StoryReading.personalizations[].requiredDataHints`、`proofNeeds`、`suggestedDataNeeds`との整合を検証する。
- AI応答はZodで上限（Dataset 4件、項目各12件、文字数）を検証する。
- 存在しない分類値は弾く。
- AIから`data_pack`が無い、または検証に失敗した場合は、Questionの`suggestedDataNeeds`を粒度ごとにまとめる規則ベースのfallbackを使う。
- AI提案を自動確定せず、画面でユーザーが確認・編集する。

この方法なら`ai_consult`の1回に含まれ、新しい課金回数やAI feature IDは不要。

## 6. Pro判定

- Storyデータパックは単独商品ではなくStory機能の一部とする。
- `canUseStory(plan)`を唯一の判定にする。別の`canUseDataCoach`は原則作らない。
- ベータ中は`BETA_OPEN_STORY = true`により全員利用可能。
- ベータ終了後はplan ID `team`（画面名Pro）のみ利用可能。
- 画面の出し分けだけに頼らず、保存／AI相談などサーバー処理でも既存Story権限に従う。
- Data Pack提案は既存`ai_consult`に含め、二重計上しない。

## 7. 実装フェーズと変更候補

この作業は複数画面・AI応答・保存・出力へまたがるため、最新`main`から専用作業コピーを作り、フェーズごとにコミットする。

### Phase 1：型・正規化・fallback（画面なし）

- `src/features/story/model.ts`
  - `StoryDataPackPlan`と正規化を追加。
- `src/features/story/dataPack.ts`（新規）
  - suggestedDataNeedsからのfallback、必須判定、Dataset／項目の編集操作。
- `src/features/story/model.test.ts`
- `src/features/story/dataPack.test.ts`（新規）

確認：古いStoryに`dataPackPlan`がなくても開ける。壊れたID・過剰件数・空ラベルを正規化できる。

### Phase 2：AI相談の応答拡張

- `src/lib/ai/consult.ts`
  - optionalな`data_pack` schema、prompt、Zod検証を追加。
- `src/registry/consultation*.ts`（現行の応答型を確認して必要なファイルだけ）
- AI consultationのテスト

確認：相談文以外の表データを送らない。AI失敗時にfallbackで画面へ進める。Dataset数・項目数の上限を守る。

### Phase 3：Data Pack Builder UI

- `src/features/story/DataPackBuilder.tsx`（新規）
- `src/features/story/dataPack.module.css`（新規）
- `src/features/story/ScopeCard.tsx`
  - Storyの流れから`Coachに相談`でBuilderを開く。
  - 状態質問画面は追加しない。
- `src/features/start/StartFlow.tsx`またはStoryの既存substate
  - 戻る／進む状態を保持。
- `src/i18n/messages/{ja,en}.json`
- UI／操作テスト

確認：Dataset切替で項目が混ざらない。追加・削除・上下移動・改名・自由追加が保存される。IME変換Enterで項目が増えない。必須不足時は具体名が出る。

### Phase 4：Story保存・Editorへの受け渡し

- `src/features/story/ScopeCard.tsx`
  - `saveStory`へ`dataPackPlan`を含むdraftを渡す。
- `src/features/story/storyProject.ts`
  - 収集テンプレートと入力後の`StoryDataset`の対応を追加。
- `src/lib/repo/decks.ts`／テスト
  - working stateの往復を固定。

確認：作成→保存→開き直す→Datasetごとの列名・順番・必須区分が残る。既存Storyは壊れない。

### Phase 5：Overview／Excel／メール

- `src/features/story/dataPackExport.ts`（新規）
- `src/features/story/DataPackPreview.tsx`（新規）
- `src/features/story/ScopeCard.tsx`またはEditorのStory領域
- `package.json`／lock（Excelライブラリを採用する場合）
- `src/i18n/messages/{ja,en}.json`
- exportテスト

Excelライブラリ案：`exceljs`をクライアントでdynamic importし、Workbookをローカル生成する。採用前にbundle sizeとNext.js 16でのbrowser buildを確認する。

確認：`00_Overview`が先頭、Dataset順とSheet順が一致、列順・改名が反映、数値例を捏造しない。メール本文にOverview参照と全Dataset名が入る。

### Phase 6：Google Sheets（Claude判断後）

- 案A：V1はExcelをGoogle Sheetsで開ける案内にする（追加認証なし）。
- 案B：Google OAuth／Drive APIで新しいSpreadsheetを作る（認証・権限・プライバシー・失敗時fallbackが必要）。

## 8. 保存とマイグレーション

- `dataPackPlan`はStoryのJSON working stateに追加するため、V1ではSupabase migrationを不要とする案。
- 実データは現行どおり`dataset_assets`／`dataset_versions`を正本にする。
- 空テンプレートのためにダミーDataset versionを作らない。
- 将来、テンプレート自体を再利用・共有する要件が出た時だけ専用テーブルを検討する。
- 本番Supabaseへ直接操作しない。

## 9. テスト観点

### モデル

- 複数Datasetと項目順の往復。
- 古いStoryの後方互換。
- 空・重複ID・上限超過・不正なimportanceの正規化。
- Question／Dataset参照が削除や追加に追従する。

### UI

- Datasetごとに選択状態が独立。
- 必須不足時だけ作成不可。
- 上下移動、削除、鉛筆改名、自由追加。
- 日本語IME変換確定で追加されない。
- PCと狭い画面で操作可能。
- 日本語／英語の文言キーが一致。

### 保存

- Story作成→保存→開き直し。
- Story複製・名前変更でData Packが残る。
- Data Packが無い既存Storyを開ける。

### 出力

- Overviewが必ず先頭。
- Sheet名の31文字制限・使用禁止文字・重複を安全に処理。
- Dataset／列順／改名を反映。
- 数値欄は空。
- Story背景の長文でセルが壊れない。
- メール件名と本文をURL encodeする。

### 全体

- `npm run typecheck`
- `npm test`
- `npm run build`
- `git diff --check`

## 10. Claudeにレビューしてほしい判断事項

1. **計画型の置き場所**：`StoryState.dataPackPlan`でよいか。`StoryDataset`を拡張して未入力状態も持たせる案は、サンプルと実データの混同を避けるため非推奨。
2. **Coach提案の生成**：既存AI相談応答へoptionalな`data_pack`を追加し、規則fallbackを持つ案でよいか。
3. **ProjectStateへの受け渡し**：StoryDatasetと`ProjectState.extra`の対応をどの時点で作るか。未入力テンプレートではdataset assetを作らない方針でよいか。
4. **Google Sheets**：V1を「Google Sheetsで開けるExcel」にするか、OAuth／Drive APIを同時実装するか。
5. **Excelライブラリ**：`exceljs`のdynamic importでよいか。別の既存方針があるか。
6. **Overviewの上書き**：Story本文とは別にoverrideを保存し、Story変更時に自動上書きしない方針でよいか。
7. **データパック作成の位置**：Story開始前（ScopeCard内）で確定するか、Storyを先に保存してEditor内で作るか。モックは前者。

## 11. Claudeレビューの完了条件

- 上の7判断に、採用／修正／保留の回答がある。
- Phase 1〜6の順序と分割が妥当か確認されている。
- 既存の`StoryState.datasets`、canonical保存、Pro判定を壊さないことが確認されている。
- Google SheetsのV1範囲が確定している。
- 実装開始コミットと作業コピーの基点が確定している。

## 12. 今回は行わないこと

- 本番Supabaseへの操作。
- Google OAuthの追加。
- 外部データの検索・自動取得。
- 元Dataset全体のAI送信。
- メールの自動送信。
- Data Pack Builderの本番コード実装。

Claudeレビュー後、合意したPhaseから実装を開始する。
