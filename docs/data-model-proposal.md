# データの持ち方の提案（ローンチ前の作り直し）

作成：2026-10-03（Claude）。状態：**採用。Codex が作業コピーで実装する**（`AGENTS.md` 2.1 E）。10章はおすすめのとおりに進める。進み具合は `docs/data-model-progress.md`。

## 0. 前提

- 今の保存データ（チャート48件・ストーリー19件ほか）は、すべて開発者が作ったダミーで、**消してよい**（ユーザーの判断）。古いデータの移行は考えない。
- **テンプレート（library_items）だけは残す**。今の中身を書き出しておき、新しい形に読み込み直す（8章）。
- 将来の2つの機能に耐える形にする。
  - **Ask My Data**：保存したチャート・ストーリー・データを横断して、根拠付きで答える。
  - **Check Missing Insight**：スライドの主張（ヘッダーのメッセージ）を、同じデータにある別の事実で補う。
- チーム・組織での共有は**未定**。どちらにも対応できる形にする（3.1）。
- 方針：**編集画面の中の形（ProjectState・SlideState）はなるべく変えず、「保存する形」を作り直す**。描画・PPT 出力・Coach は今のまま動く。

## 1. Codex の監査への判定

コードと実データ（`261003_Supabase Data Audit.csv`）で確かめた。

| 指摘 | 判定 | 根拠・補足 |
|---|---|---|
| P0-1 データの意味（単位・定義・期間・通貨・地域など）が構造で無い | Confirmed | `src/registry/dataset.ts:45-68`。単位は表全体に自由記述が1つ。`colMeta` は型にあるが、読み書きするコードが無い（実データ0件）。通貨・指標の種類は `meaning.ts:15-38` で毎回、名前から推測しているだけ |
| P0-2 出典が自由記述1本 | Confirmed | `ProjectState.source: string`（`project.ts:67-86`）、`StoryDataset.source`（`story/model.ts:20-30`）。URL・日付の欄は無い。実データでは URL を含む出典は0件 |
| P0-3 データの正本が曖昧 | Confirmed | 開き直しは `view_specs.ui` だけを読む（`repo/charts.ts:53-61`）。`datasets.data`・`view_specs.spec`・`view_spec_versions` は書くだけで、どこからも読まれない。`saveChart` が `datasets` に入れるのは1枚目のスライドのデータだけ（`charts.ts:93-101`） |
| P0-4 主張と根拠が残らない／誰が書いたか分からない | Confirmed（補足あり） | 書き手の記録は無い。ただし、AI でヘッドラインを作る処理（`lib/ai/headline.ts`）は「下準備。まだ呼ばない」で、画面から呼ばれていない。**今のタイトルは、ユーザーの入力・見本・切り口の問いのどれか**。AI が入る前に記録の形を決めれば、取りこぼしは無い |
| P0-5 計算した事実の入力・式・版が無い | Confirmed（補足あり） | `Fact` は `{id, kind, value, text}`（`facts.ts:13-23`）。ただし `slideFacts` もまだ画面から呼ばれておらず、保存もしていない。保存が要るのは「提案を出して、ユーザーが採用した時の根拠」だけで、その時に作ればよい |
| P0-6 意味の混入（宇宙事業のデータに訪日の指標名） | Confirmed（原因は推定） | 2件とも、比較期間の名前が「Visitor arrivals…／Travel spending…」で、値は宇宙事業の本数。**期間の名前がデータの値と結び付いておらず、値だけを入れ替える操作（表への貼り付け・セルの入力など）では前の名前が残る**。`replaceWithTable` は形が違う時だけ名前を消す（`editor/edit.ts:169-174`）。新しい形では、名前と単位をデータの項目に持たせるので、この種の混入は構造上起きにくくなる |
| P0-7 データの形の版が無い | Confirmed | DB の `version` は保存回数。データの JSON 自体に版は無い |
| P1-1 ストーリーのスライド→データの参照が無い | Confirmed | `datasetRefs` は共通のデータでは空（`storyProject.ts:133-172`）。実データ111枚で0件 |
| P1-2 ストーリーに履歴が無い | Confirmed | `stories` を上書き（`repo/stories.ts:60-71`）。800ms ごとの自動保存 |
| P1-3 複製・派生の記録が無い | Confirmed | `duplicateChart`・`duplicateStory` は新しく保存し直すだけ。テンプレートからのコピーだけ `ui.origin` に残る |
| P1-4 検索用の項目が無い | Confirmed | DB の列は owner・name・updated_at・tags だけ。tags の先頭に言語のタグが混ざっている（`charts.ts:23-24`） |
| P1-5 組織の境界が無い | Confirmed | `owner_id` だけ。組織・チームの表は無い |
| P2 提案・判断・Question List・Speaker Notes | Confirmed | どれも無い。PPT 出力はノートを書かない（`export/pptx/scene-to-pptx.ts`） |

**追加で見つけたこと**

- **ダミーと実データの区別が無い**：48件中27件の出典が「サンプル・ダミー・架空」。今のままだと、Ask My Data がダミーを根拠に答えてしまう。
- **期間の入れ物を指標に流用している**：2指標スロープ・順位スロープは、「現在」「比較」の2つの入れ物に別々の指標（訪日客数と消費額）を入れている。単位は名前の文字の中（「（万人）」「（億円）」）にしか無い。
- **期間の名前が実データと合っていない例**：「2025／2020」のまま、行は2019年・2024年。
- **欠損の理由が消える**：貼り付けの時は「空欄・-・n/a・エラー」を見分けている（`dataCheck.ts:13,28`）が、保存するのは null だけ。

## 2. 設計の原則

1. **データは、スライドから切り離した「資産」にする**。1つのデータを、複数のスライド・チャート・ストーリーで使い回せる。
2. **保存したデータの版は書き換えない**。直したら新しい版を作る。スライドは「どの版を使ったか」を指す。PPT に出した時の版は必ず残る。
3. **意味は構造で持つ**。単位・期間・指標の名前を、タイトルや自由記述から推測しない。分からない時は「不明」と保存する（推測で埋めない）。
4. **文には「誰が書いたか」と「何を根拠にしたか」を付ける**。ユーザー・AI・AI の案をユーザーが直したもの・見本・テンプレートを区別する。
5. **今しか取れない情報だけを、ローンチ時から保存する**。あとから作り直せるもの（検索の索引・計算した事実・埋め込み）は、版から作り直せる形にして、今は作らない。

## 3. 全体の形

```text
workspace（個人／チーム）
 ├─ sources            出典（資料名・発行元・URL・公開日・取得日・種類〔社内／外部／サンプル〕）
 ├─ dataset_assets     データ（名前・タグ・今の版）※旧 datasets と名前が重なるため
 │    └─ dataset_versions   版（書き換えない）：正規化した表＋元の入力＋出典の参照
 ├─ decks              チャート／ストーリー（kind で区別。名前・タグ・今の版・複製元）
 │    └─ deck_versions      版：スライドの並び・見せ方・文（書き手付き）・使ったデータの版
 ├─ templates          テンプレート（deck と同じ形。管理者が公開）
 ├─ consultation_history   相談の履歴（今のまま＋workspace）
 └─（あとから）claims / insight_suggestions / question_items / asset_index
```

### 3.1 workspace（組織は未定でも、今入れておく）

- サインアップした時に、本人だけの workspace（kind = personal）を1つ作る。
- すべての資産に `workspace_id` と `created_by` を持たせ、RLS は「その workspace のメンバーか」で判定する。
- 今は個人の workspace しか無いので、動きは今の `owner_id` と同じ。チーム共有を始める時は、メンバーを足すだけで済む。
- **後から入れると、すべての表と RLS を作り直すことになる**。データが空の今なら、ほとんど手間がかからない。

### 3.2 データ：dataset_assets と dataset_versions

> 表名（2026-10-03 決定）：新しいデータの資産の表は **`dataset_assets`**（ずっとこの名前。あとで改名しない）。旧 `datasets` を段階7まで残すため、同じ名前は使えない。版の表は `dataset_versions`（旧表と重ならない）。コードの型の名前（Dataset・DatasetVersion）は変えない。

**dataset_versions の中身（正規化した表）**

今のアプリにはすでに「縦長の表（1行1つの値）＋切り出し方（pivot）」の仕組みがある（`dataset.long`・`editor/long.ts`）。これを保存の正本にする。横長に貼った表も、保存の時に縦長へ直す。描画に使う行×列（＋現在・比較）の表は、スライドの「見せ方」から毎回作る。

```ts
/** dataset_versions.payload（版 1） */
interface CanonicalTable {
  schemaVersion: 1;
  /** 表の項目（列）。時間・分類・指標の役割と意味を持つ */
  fields: Field[];
  /** 1行＝1つの観測。fields の順に値（分類・時間は member の id、指標は数値か null） */
  records: (string | number | null)[][];
  /** null の理由（分かる時だけ）。キーは "行番号:項目の id" */
  missing?: Record<string, 'blank' | 'not_available' | 'not_applicable' | 'confidential' | 'error'>;
}

type Field = TimeField | DimensionField | MeasureField;

interface TimeField {
  id: string; name: string; role: 'time';
  granularity: 'year' | 'half' | 'quarter' | 'month' | 'week' | 'day' | 'point' | 'unknown';
  basis?: 'calendar' | 'fiscal' | 'unknown';
  members: { id: string; label: string; start?: string; end?: string }[];   // 例：{ label: '2024', start: '2024-01-01', end: '2024-12-31' }
}

interface DimensionField {
  id: string; name: string; role: 'dimension';
  kind: 'geography' | 'category' | 'entity' | 'segment' | 'scenario' | 'other' | 'unknown';   // scenario＝実績・計画・予測など
  members: { id: string; label: string; total?: boolean }[];   // total＝「合計」「全体」の行
}

interface MeasureField {
  id: string; name: string; role: 'measure';
  unit: {
    label: string;                 // 画面に出す単位（例：億円、万人、%）
    quantity: 'currency' | 'count' | 'percent' | 'ratio' | 'index' | 'duration' | 'score' | 'other' | 'unknown';
    currency?: string;             // JPY・USD など
    scale?: number;                // 1e4（万）・1e8（億）など。分かる時だけ
  };
  aggregation: 'sum' | 'average' | 'ratio' | 'stock' | 'unknown';   // 足し合わせてよいか
  definition?: string;             // 指標の定義（任意）
  denominatorFieldId?: string;     // 割合・1人当たりの分母（分かる時だけ）
  valueKind?: 'actual' | 'plan' | 'forecast' | 'target' | 'reference' | 'unknown';
  derived?: { formulaId: string; inputs: string[] };   // アプリが計算して足した指標の時だけ
}
```

**版に一緒に保存するもの**

- `input`：貼り付けた元の表（文字のまま）と、読み方の選択（合計を外す・単位をそろえる など）。**元に戻せる唯一の情報なので、必ず残す**。
- `source_ids`：出典。複数の出典を混ぜた表もありうるので、配列にする。
- `content_hash`（値）と `semantics_hash`（項目の意味・単位・期間）：同じデータを2回保存しない判定と、主張が古くなったかの判定に使う。
- `parent_version_id`：どの版を直してできたか。

**今の画面との対応（変換の決まり）**

| 今の Dataset | 正規化した表 |
|---|---|
| `rows`・`cols` | 2つの項目（time か dimension）。`dimensions.rows/cols` がその名前 |
| `periods.current/base`（推移・Mekko など） | 時間の項目の2つの member（名前＝期間の名前） |
| `periods.current/base`（2指標スロープ・順位スロープ） | **2つの指標**（名前と単位をそれぞれに持つ） |
| `unit` | 指標の `unit.label`（指標ごと） |
| `groups`（バブルの色分け） | dimension の項目を1つ足す |
| `long`（縦長の表） | ほぼそのまま。項目に役割と単位を足す |

この変換は、保存・読み込みの時に1か所（`src/features/data/canonical.ts` を新しく作る）で行う。画面と描画は今の行×列の形のまま使える。

### 3.3 出典：sources

```ts
interface SourceRecord {
  id: string; workspaceId: string;
  kind: 'external_web' | 'external_document' | 'internal' | 'survey' | 'user_estimate' | 'sample';
  title: string;                   // 資料名（例：訪日外客統計）
  publisher?: string;              // 発行元（例：日本政府観光局）
  url?: string;
  publishedAt?: string;            // 公開日
  retrievedAt?: string;            // 取得日（入れた日を既定にする）
  locator?: string;                // ページ・表番号など
  citationText: string;            // スライドに出す出典の文（今の「出典：…」）
}
```

- **見本・テンプレートのデータは `kind: 'sample'`**。Ask My Data・Check Missing Insight の対象から、いつも外す。
- スライドに出す文は `citationText`。今の「出典」の欄はこれを編集する。

### 3.4 チャート・ストーリー：decks と deck_versions

- **チャートとストーリーを、同じ表の2つの種類にする**（`kind: 'chart' | 'story'`）。マイチャートのタブは kind で分ける。どちらも「スライドの並び」で、版・複製・タグ・検索・見る（ビューアー）を共通にできる。
- `decks.working` に編集中の中身を入れる（ストーリーの自動保存はここ）。`deck_versions` は書き換えない版で、次の時に作る。
  - チャートの［保存］
  - ストーリーの区切り（PPT 出力の時、名前を変えた時、30分ごとなど）
  - **PPT に出した時は必ず版を作り、その版の id を出力の記録に残す**（「この PPT はこのデータから作った」をあとで再現できる）
- 複製は `copied_from_deck_id`・`copied_from_version_id`、テンプレートから作った時は `template_id` を持つ。

**版の中身（スライド1枚）**

```ts
interface DeckContent {
  schemaVersion: 1;
  slideLocale: 'ja' | 'en';
  slides: SlideRecord[];
  story?: StoryMeta;               // ストーリーの時だけ：決めたい問い・ルート・グループ（本編・付録・外す）など。今の StoryState から slides を除いたもの
}

interface SlideRecord {
  id: string;                      // 版をまたいで同じ（主張・提案の参照先）
  view: SlideView;                 // 今の SlideState（チャート・設定・補完・強調・表／言葉の型）からデータを除いたもの
  data: {
    datasetVersionId: string;
    pivot: PivotSpec;              // どの項目を行・列・現在・比較・指標にするか（今の longPivot を一般化）
  }[];                             // 2つ以上のデータを使う型（KPI など）もあるので配列
  texts: {
    message?: TextField;           // ヘッダーのメッセージ（＝ユーザーの主張になりうる）
    chartTitle?: TextField;        // チャートタイトル（未設定＝自動）
    question?: TextField;          // ストーリーの問い
    notes?: TextField;             // スピーカーノート（PPT のノートに出す）
  };
}

interface TextField {
  text: string;
  author: 'user' | 'ai' | 'ai_edited' | 'template' | 'sample' | 'rule';   // rule＝自動のチャートタイトルなど
  ai?: { feature: string; model: string; promptVersion: string; original: string; factIds?: string[]; at: string };
  basis?: { datasetVersionId: string; dataHash: string; semanticsHash: string };   // 書いた時のデータ（古くなったかの判定）
  updatedAt: string;
}
```

- 今の `titleData`（値だけのハッシュ）は `basis` に置き換える。単位・期間・項目の意味が変わった時も「データが変わりました」と知らせられる。
- 表示で隠した行・系列（`controls.items/series`）は今と同じく見せ方の設定で、**データの版には全部残る**。Check Missing Insight は、隠した項目も含めて計算できる。

### 3.5 タグ

- `user_tags text[]`：ユーザーが付けたタグ。保存の時にそろえる（前後の空白・全角半角・大文字小文字）。
- `lang`：言語は別の列にする（今はタグの先頭に混ざっている）。
- `auto_tags`：アプリが付ける分類（チャートの種類・指標の名前・地域・期間など）。版から作り直せるので、別の列にして、いつでも作り直す。
- データ（dataset_assets）にもタグを付けられる。

### 3.6 あとから足すもの（今は形だけ決める）

| 表 | 中身 | いつ |
|---|---|---|
| `claims` | `TextField` のうち主張として扱うもの（deck・slide・版・指標の範囲） | Ask My Data・Missing Insight の開発時。**版から作り直せる** |
| `insight_suggestions` | 対象の主張、関係（supports・qualifies・contrasts・contradicts・extends・requires_more_data）、根拠（版・指標・行・式・計算の版）、検出ロジックの版、ユーザーの判断と日時 | Missing Insight の開発時 |
| `question_items` | Question List。元の提案・主張・スライド・版への参照 | 同上 |
| `asset_index` | 検索用（workspace・種類・指標・期間・粒度・地域・単位・出典の種類・タグ・言語・埋め込み） | Ask My Data の開発時。**版から作り直せる** |

計算した事実（`facts.ts`）はふだん保存しない。提案を出した時・AI の案を採用した時だけ、根拠として次を一緒に残す：`datasetVersionId`、`measureId`、使った member、式の id、計算の版、生の値と表示の値、単位と分母。

## 4. 入力の時にユーザーに確かめること（負担を増やしすぎない）

貼り付けた後に、1枚の「データの意味」カードを出す（読み取った値を先に入れておき、確かめるだけにする）。

| 項目 | 既定 | 必須か |
|---|---|---|
| 時間の項目と粒度（年・四半期・月） | 名前から推定して入れておく | いいえ（不明で保存できる） |
| 指標ごとの名前と単位 | 貼り付けの読み取り（今の dataCheck が単位・通貨・% を見分けている） | 単位は「不明」でも保存できる |
| 出典（資料名・URL・公開日） | 空。取得日は今日 | いいえ。空なら「出典なし」 |
| サンプルかどうか | 見本のまま＝サンプル | 自動 |

- 「不明」のまま保存しても、作る・出すことはできる。ただし Ask My Data の比較では「単位が不明なので比べません」と扱う。
- 出典を入れた人だけ、出典を検索・引用できる。

## 5. 保存の流れ（今の画面からの変化）

```text
編集画面（ProjectState：今のまま）
  → 保存
    → canonical.ts：スライドごとのデータを正規化した表へ。同じ値・意味なら既存の版を使う（hash）
    → dataset_assets / dataset_versions に新しい版（変わった時だけ）
    → decks.working（ストーリー）または deck_versions（チャートの保存・PPT 出力）
  開く
    → deck の版 → 使っているデータの版 → canonical.ts で行×列へ → ProjectState
```

- 正本は **dataset_versions（データ）と deck_versions／decks.working（スライド）** の2つだけ。今の `datasets.data`・`view_specs.ui`・`view_spec_versions.dataset`・`stories.story.datasets` は、新しい形では使わない。
- ブラウザの下書き（localStorage）は今のまま ProjectState。ログインした時に、上の流れで保存する。

## 6. ローンチ前に必要なもの（P0）と、あとでよいもの

**P0：ローンチ前（あとからでは取れない、または全部の表を作り直すことになる）**

| # | 内容 | 理由 | 大きさ |
|---|---|---|---|
| P0-1 | dataset_assets・dataset_versions（書き換えない版、正規化した表、`schemaVersion`、元の入力） | 元の入力と版は、保存した時にしか取れない | L |
| P0-2 | 指標ごとの単位・時間の項目・欠損の理由を表に持つ（不明も可） | 入力の時にしか分からない。あとからはタイトルから推測するしかない | M |
| P0-3 | sources（サンプルの区別を含む） | 出典の URL・日付は、あとから復元できない | M |
| P0-4 | スライド→データの版の参照、PPT に出した時の版の固定 | 出した資料の根拠を再現できなくなる | M |
| P0-5 | 文の書き手と根拠（`TextField`）。AI のヘッドラインを画面に出す前に入れる | AI の元の案と、ユーザーが直したかどうかは、その時にしか残せない | S |
| P0-6 | workspace_id と RLS | あとからでは全部の表と RLS の作り直しになる | S（今なら） |
| P0-7 | 複製元・テンプレート元の id、ユーザーのタグと言語の分離 | 複製の関係は、あとから分からない | S |

**P1：ローンチ直後でよい（Ask My Data・Missing Insight の開発前）**

- データの意味カード（4章）の画面の仕上げ。P0 では、読み取った値を黙って保存し、カードは最小限にする。
- スピーカーノートの欄と、PPT のノートへの書き出し（PptxGenJS の `addNotes`）。
- ストーリーの版を作るタイミングの調整、版の一覧から戻す画面。
- `auto_tags` の生成。

**P2：機能の開発時**

- claims・insight_suggestions・question_items・asset_index（埋め込みを含む）。
- 計算した事実への「入力の参照・式の id・計算の版」の追加（`facts.ts` の拡張）。
- 指標どうしの派生（1人当たり＝消費額÷人数）。単位と分母が分かっている時だけ計算する。

## 7. 実装の順番（案）

1. **型と変換（画面は変えない）**：`CanonicalTable`・`DeckContent`・`TextField` の型。今の Dataset／ProjectState ⇄ 新しい形の変換と、往復のテスト（行×列・2指標・縦長の表・バブルのグループ・Mekko）。
2. **DB**：新しい表・RLS・テスト（workspace の境界、版は書き換えられない、他人の workspace は見えない）。
3. **保存と読み込み**：`repo/charts.ts`・`repo/stories.ts` を decks に置き換える。マイチャート・ストーリー・下書き・複製・削除・見る。
4. **文の書き手**：タイトル・チャートタイトル・問いの入力で `author` を付ける。見本・テンプレート・切り口の問いは、それぞれの種類で入れる。
5. **出典とサンプルの区別**：今の「出典」の欄を `sources` につなぐ（URL・公開日は任意の欄）。
6. **テンプレートの読み込み**（8章）。
7. **古い表を消す**：projects・datasets・view_specs・view_spec_versions・chart_drafts・stories。

各段階で typecheck・test・build と、作る→保存→開く→PPT 出力の画面の確認をする。

## 8. テンプレートを残す手順

1. 今、`library_items` を書き出す（前回と同じく SQL Editor から。管理者で実行する）。
   ```sql
   select json_agg(t order by sort, created_at) from public.library_items t;
   ```
2. 書き出したファイルを `supabase/seed/library_items.v3.json` としてリポジトリに入れる（中身はダミーのデータだけ）。
3. 新しい形にした後、読み込みの処理（`scripts/import-templates.ts`）で、ProjectState を deck とデータの版に変えて入れる。データの出典は `kind: 'sample'` にする。
4. テンプレートの画面で、全件が表示され、コピーして編集・PPT 出力できることを確かめる。

## 9. テスト（新しく足すもの）

- 保存→読み込みで、行・列・値・単位・期間の名前・指標の名前が変わらない（各チャートの種類で）。
- 2指標スロープ：2つの指標が別々の単位を持ち、期間とは扱われない。
- 値だけを貼り替えた時、前のデータの期間の名前・指標の名前・単位が残らない（P0-6 の再発防止）。
- 隠した行・系列が、データの版には残っている。
- 同じデータを2回保存しても、版が増えない（hash）。値か意味が変わった時だけ増える。
- PPT に出した時の版が固定され、あとでデータを直しても、その版から同じスライドを描ける。
- 複製で `copied_from` が入り、元を消しても複製は開ける。
- 他人の workspace のデータは、読めず書けない。版は書き換え・削除できない（workspace ごと消す時を除く）。
- 文の書き手：ユーザーの入力・見本・テンプレート・自動のチャートタイトルが、それぞれ正しく記録される。
- サンプルの出典のデータは、検索の対象から外れる。
- （P2）訪日データでの Check Missing Insight：保存済みデータから、2024年の訪日客数1位＝韓国、消費額の合計1位＝中国、1人当たり消費1位＝米国（約33万円）を計算できる。指標が違う1位を矛盾と判定しない。単位か分母が不明なら計算せず、追加データが要ると返す。

## 10. 決めてほしいこと（プロダクトの判断）

1. **チャートとストーリーを同じ表（decks）にまとめてよいか**。画面は今のまま2つのタブ。おすすめ：まとめる（版・複製・検索・見るを共通にできる）。
2. **出典の入力をどこまで求めるか**。おすすめ：資料名だけ入力を促し、URL・公開日は任意。
3. **ストーリーの版を作るタイミング**。おすすめ：PPT 出力・名前の変更・30分ごと。
4. **データだけを一覧で見せるか**（マイチャートに「データ」のタブ）。おすすめ：ローンチ時は見せない（保存の形だけ資産にしておく）。
5. **既存のダミーデータを消す時期**。おすすめ：手順 7 の時に、テンプレートを読み込んだ後で消す。
