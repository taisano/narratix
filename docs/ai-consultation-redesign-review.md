# AI相談アルゴリズム再設計：Claudeレビュー資料

版：2026-10-07 Codex試作
基準：main `8b3d765`
作業場所：`biz-slide-coach-ai-redesign-review`（元リポジトリとは別の隔離コピー）

> この変更は本番用mainへ入れていない。Claudeが設計・互換性・UI接続をレビューし、必要な修正を行ってから取り込むための試作である。

## 1. 結論

問題の中心は、個別の相談文の読み間違いではなく、現在の推薦単位が`RecipeId`（チャート中心）に固定され、分類に「意思決定タスク」「分析関係」「データの形」が混在していることである。

試作では、既存の`primary_goal`とRecipeを削除せず、次の順に分離した。

```text
相談文
  ↓ AI：A〜DとCritical Thinkingを分類するだけ
Decision Job → Business Question → Analytical Relationship → Data Topology
  ↓ 決定的なRule
Presentation候補（チャート／表／マトリックス等）
  ↓ 互換アダプター
既存Recipe または Story Template
```

これにより、「2時点×カテゴリー×価格帯×シェア＋増減×正確な一覧」は、折れ線ではなく`MATRIX_DELTA_SHARE`を第一案にできる。

## 2. 現行カバレッジ

| 領域 | 現行 | カバーできること | 主な不足 |
|---|---|---|---|
| 上位分類 | `primary_goal` 6種 | 推移・比較・構成・寄与・関係・評価 | `EVALUATION`だけ意思決定タスクで、他は分析関係 |
| Business Question | `proof_needs` 14種 | 変化、成長率、構成、差、順位、寄与、関連など | 予測、Scenario、Risk、Execution、Distribution、Uncertainty、Flow、Spatial |
| 時間 | `time_mode` | 1時点・2時点・複数時点 | `period_count`を保持しない。相談後の実データ再判定先がない |
| 比較軸 | `comparison_dimension` 1件 | 地域別、製品別など | 地域×製品、カテゴリー×価格帯を保持できない |
| 系列数 | `SINGLE / MULTIPLE` | 1系列の除外 | 5項目と50項目を区別できず、密度判断不能 |
| 指標 | `measure`、`measure_additivity` | 指標名と加算可否 | SHARE/RATE/MARGIN等の意味、単位、複数指標、半加算を構造化できない |
| 推薦候補 | Active Recipe 39件 | チャート中心の既存表現 | Story Template 12件を同列に順位付けできない |
| 表 | 比較・KPI・増減・ヒートマップ・基本表 | 正確な値、評価表、増減一覧 | 2次元セル内に水準＋増減ptを持つSemantic Recipeがない |
| 高密度表現 | heatmap、small multiples、leaderboardの部品あり | 手動選択・隠れ部品 | 相談推薦への接続、密度による自動切替 |
| Critical Thinking | StoryのBoundary、`CONTRIBUTION`≠原因等 | 一部の注意 | 前提・反証・別解釈・Actual/Forecast/Scenarioを共通分類として保持しない |

## 3. 不足するBusiness Question

既存`proof_needs`は捨てず、Storyと既存Recipeの細かな証明要求として維持する。上位のBusiness Questionを次の8種にそろえる。

| 新ID | 問い | 現行との関係 |
|---|---|---|
| `WHAT_HAPPENED` | 何が起きたか | OVERALL_CHANGE、CURRENT_MIX |
| `WHERE_HAPPENED` | どこで起きたか | SEGMENT_DIFFERENCE、RANKING、POSITIONING |
| `HOW_IMPORTANT` | どれくらい重要か | SIZE_CONTEXT、CONTRIBUTION、TARGET_GAP |
| `WHY_HAPPENED` | なぜ起きたか | 現行CONTRIBUTIONは原因ではない。将来CAUSAL_DRIVERが必要 |
| `WHAT_NEXT` | 今後どうなるか | SCENARIO、UNCERTAINTY、FORECASTが不足 |
| `WHAT_TO_CHOOSE` | 何を選ぶべきか | SECOND_METRIC、POSITIONINGに加えDecision Matrixが必要 |
| `WHAT_RISKS` | どんなリスクがあるか | RISK_EXPOSURE、Uncertaintyが不足 |
| `WHAT_TO_EXECUTE` | 何を実行するか | Next Actionsはあるが相談分類と接続していない |

## 4. 新しい分類モデルと互換方針

実装：`src/registry/consultation-model.ts`

### A. Decision Job

`MONITOR`、`IDENTIFY_PROBLEM`、`DIAGNOSE`、`EVALUATE_OPTIONS`、`FORECAST_SCENARIO`、`RECOMMEND_DECIDE`、`PLAN_EXECUTE`、`ALIGN_EXPLAIN`。

### B. Business Question

前節の8種。既存`proof_needs`の置き換えではなく、上位分類として併存する。

### C. Analytical Relationship

指示された15種をすべて語彙登録した。複数を同時保持できる。`EVALUATION`はここへ入れない。

### D. Data Topology

- `dimensions[]`：name、role、cardinality、hierarchy
- `measures[]`：name、semantic、unit、additivity
- `period_count`、`data_stage`、`share_basis`、`exact_values`
- `value_semantics[]`：LEVEL / DELTA / RATE / RANK / UNCERTAINTY
- `cell_count`、`missingness`、`data_grain`
- 特定1項目への注目を示す`focused_item_count`

`topologyFromObservedData()`を追加し、データ入力後はcardinality、period_count、cell_count、missingnessを実測値で上書きする。時間軸をラベルから推測せず、呼び出し側がroleを明示する。

### E. Presentation Form

`CHART`、`TABLE`、`MATRIX`、`HEATMAP_TABLE`、`KPI_SCORECARD`、`DECISION_MATRIX`、`PROCESS`、`TIMELINE`、`TEXT`、`HYBRID`。

候補は`SUPPORTED / ALTERNATIVE / UNSUPPORTED`を必ず持つ。実装されていない語彙も候補カタログに登録したが、利用可能であるかのようには扱わない。

### 互換方針

- `ConsultationClassification.primary_goal`以下の既存フィールドは削除しない。
- 新分類はnullableな`analysis_v2`へ追加。旧保存データと旧AIキャッシュは`null`で読める。
- `analysisFromLegacy()`で旧分類を、情報を発明せず新Ruleへ渡す。
- `legacyGoalFromAnalysis()`で既存画面・Recipeへ戻せる。
- 現行の`rankRecipes()`は変更していない。新しい`rankPresentations()`との切替はClaudeレビュー後に行う。

## 5. 表を含む推薦Rule

実装：`src/registry/presentation-rules.ts`

### MATRIX_DELTA_SHARE

次をすべて満たす場合、第一案にする。

1. `period_count = 2`
2. 非時間ディメンションが2つ以上
3. 指標がSHAREまたはRATE
4. `value_semantics`にLEVELとDELTAの両方
5. `exact_values = true`または`CROSS_TAB`

SHAREで`share_basis`が不明な場合だけ、`SHARE_BASIS`を一問確認する。条件成立時は`TREND_LINE`を明示的に除外する。

### その他の主要Rule

- 1ディメンション・2時点・シェア：`MIX_PAIR_SHARE`、必要なら`DELTA_TABLE`。2次元マトリックスは除外。
- 3時点以上・構成推移：`TREND_SHARE`。特定1項目に絞る場合だけ`TREND_LINE`も候補。
- 2非時間ディメンション・正確な率／利益率：`CROSSTAB_TABLE`→`HEATMAP_VALUE_TABLE`。積み上げを除外。
- `DISTRIBUTION`：Box Plot / Histogram / Dot Plot。ランキングへ縮約しない。現時点では未対応表示。
- `SCENARIO + UNCERTAINTY`：Scenario Table / Forecast Range / Fan Chart。通常の過去推移線は除外。
- 24セル以上または一軸9項目以上を高密度とし、Top N、Filter、Small Multiples、複数スライドを提案する。ただし元データは削除・集約しない。

閾値24セル／8項目は試作値であり、Claudeの判断が必要。

## 6. MATRIX_DELTA_SHAREの試作

実装：`src/features/templates/matrixDelta.ts`

- 既存`STORY_TABLE_BASIC`をRendererとして再利用するSemantic Recipe。
- セルを「最新シェア」「基準時点からの増減pt」の2行で生成。
- 比率入力（0.35）と百分率入力（35）を明示指定し、推測で変換しない。
- `share_basis`なし、または行列サイズ不一致を拒否。
- 欠損を0で補わず「—」で残す。
- 行・列を削除しない。高密度時は表示方法だけを返す。
- 色付けは任意要件なので、P0試作では色がなくても読める値＋ptを優先した。

専用Rendererにする場合は主値と副値の文字サイズを分け、deltaによる任意色付けを追加できる。現在の基本表でもPPTとプレビューは同じScene計算を使える。

## 7. Critical Thinking Rule

新分類に次を保持する。

- 結論の性質：OBSERVED / INFERRED / PROPOSED / UNKNOWN
- 因果主張の有無
- 前提、反証、別解釈、意思決定への含意

決定Ruleは定型コードだけを返し、結論やActionを生成しない。

- RELATIONSHIPで因果主張：`RELATIONSHIP_IS_NOT_CAUSATION`
- Actual/Forecast/Scenario混在：`SEPARATE_ACTUAL_FORECAST_SCENARIO`
- 前提あり：`SHOW_ASSUMPTIONS`
- 判断を変える反証・別解釈あり：`SHOW_DECISION_CHANGING_ALTERNATIVES`
- 提案をEvidenceとして扱わない：`DO_NOT_PRESENT_PROPOSAL_AS_EVIDENCE`

## 8. ロードマップ

| 優先度 | 内容 | 試作状態 |
|---|---|---|
| P0 | 5層語彙、互換マッピング | 実装済み |
| P0 | Presentation候補層とSUPPORTED表記 | 実装済み |
| P0 | MATRIX_DELTA_SHARE Rule・値生成 | 実装済み |
| P0 | CROSSTAB / HEATMAPの推薦接続 | 実装済み |
| P0 | Small Multiples接続 | 候補は接続、Recipe／UI接続は未実装（ALTERNATIVE） |
| P0 | 密度による自動切替 | Ruleと選択肢は実装、UI適用は未実装 |
| P1 | Box / Range / Scenario / Forecast Range / Fan / Tornado | 語彙のみ、UNSUPPORTED |
| P1 | Decision / Risk Matrix、Roadmap / Milestone | 近似または未対応を明示 |
| P2 | Spatial、Flowの専用表現、より高度な不確実性 | 未実装 |

Pie、Donut、Radar、Gauge、3Dは追加していない。

## 9. テスト

追加したゴールデンケース：

1. 3カテゴリー×5価格帯×2時点のシェア＋増減 → MATRIX_DELTA第一案、折れ線NG
2. 5価格帯×5年間のシェア → 100%積み上げ、特定1項目のみ折れ線可
3. 5ブランド×2時点 → MIX_PAIR_SHARE／増減表、2Dマトリックス不要
4. 地域×製品の利益率 → CROSSTAB／HEATMAP、積み上げNG
5. 店舗別売上の分布と外れ値 → DISTRIBUTION、ランキングNG
6. 3シナリオの予測＋不確実性 → SCENARIO＋UNCERTAINTY、通常線NG

境界テスト：share_basis不明、旧分類互換、実データ再判定、候補状態、欠損、行列不一致、高密度でも元行列を保持。

## 10. Claudeに確認してほしいこと

1. `analysis_v2`を既存分類の内側へ置く方針でよいか。将来トップレベルへ昇格するか。
2. `share_basis`の正本を相談分類、Datasetのmeasure metadata、両方のどこに置くか。データ入力後はDataset側が正本になるのが自然。
3. MATRIX_DELTAを既存基本表＋Semantic BuilderでP0とするか、専用Content／Rendererを作るか。
4. 高密度の仮閾値（24セル、一軸8項目）を採用するか。
5. 現在hiddenの`small_multiples_bar`を正式なRecipeへ接続してよいか。
6. 新AI JSON Schemaを一度に本番へ切り替えるか、schema version／feature flagで段階導入するか。
7. `proof_needs`にScenario／Risk等を追加する時期。上位Business Questionだけ先行し、既存Story Routeを壊さない案を推奨。

## 11. 意図的に未接続の範囲

- `plan.ts`、`coach.ts`、推薦画面はまだ`RecipeId[]`前提。`rankPresentations()`は呼ばれていない。
- Semantic Recipeから`ensureTemplate()`へMATRIX_DELTA contentを渡すアダプターは未実装。
- Matrixの編集UI、専用のdelta色付け、保存形式への`share_basis`追加は未実装。
- ルール版自然文分類は旧語彙のまま。新分類はAI出力Schemaに追加したが、実AIでの評価は未実施。
- P1表現は誤って利用可能に見えないよう`UNSUPPORTED`。代替可能なものだけ`ALTERNATIVE`。
- 本番DB、Supabase、保存済みdeck、元リポジトリには触れていない。

## 12. 変更ファイル

- `src/registry/consultation-model.ts`：5層のうちA〜D、Critical Thinking、互換変換、実データ再判定
- `src/registry/presentation-rules.ts`：Eの候補カタログ、決定Rule、実装状態
- `src/registry/consultation.ts`：保存互換を保った`analysis_v2`
- `src/lib/ai/consult.ts`：AIの構造化Schemaと一般化された分類定義
- `src/features/templates/matrixDelta.ts`：水準＋増減ptを持つクロス表生成
- `src/registry/presentation-rules.test.ts`：6ゴールデンケースと境界・互換テスト
- `src/features/templates/matrixDelta.test.ts`：セル、欠損、密度、入力制約テスト

## 13. Claude のレビュー（2026-10-07）

10章の質問への回答。コード側の修正は`docs/story-personalization-review.md`の10章（具体化の接続方式）と、`src/lib/ai/provider.ts`等のトークン上限・タイムアウト拡大のみで、5層分類（`analysis_v2`）自体のロジックは今回変更していない。

1. `analysis_v2`は既存分類の内側に置いたままでよい。トップレベルへ昇格するかは、実際に推薦（`rankPresentations()`）へ接続する段になってから判断する（11章にある通り、まだ呼ばれていない）。
2. `share_basis`の正本は、データ入力前は相談分類（AIの読み取り）、データ入力後はDatasetのmeasure metadata側に移すのが自然。今回はコードを変えていないが、Dataset側に正本を置く設計変更をする時は、相談分類の値は「初期値のヒント」として扱う変換を一箇所に用意すること。
3. MATRIX_DELTAは既存基本表＋Semantic BuilderでP0とする案に賛成。専用Content／Rendererは、実際に使用頻度が見えてから検討する。
4. 高密度の仮閾値（24セル、一軸8項目）は仮採用でよい。実データでの見た目確認後に調整する前提。
5. `small_multiples_bar`を正式なRecipeへ接続することには賛成だが、今回のレビューでは未接続のまま（11章の「意図的に未接続」の通り）。
6. 新AI JSON Schemaは段階導入が安全。`analysis_v2`は現状、推薦に使っていないのにAIへ毎回頼むと応答が長くなり、トークン・時間の上限に響く。環境変数での切り替え（頼む／頼まない）の仕組みはこのラウンドでは実装していないが、次に着手する時はまずこれを入れることを推奨する。
7. `proof_needs`へのScenario／Risk等の追加は、上位Business Questionだけ先行し、既存Story Routeを壊さない案に賛成。今回は追加していない。

### 確認が必要な残課題

- 実際のOpenAI APIでの応答確認（`analysis_v2`を含めた場合の応答時間・JSON整合性）は、ローカルにAPIキーが無いため未実施。
- `npm test` / `npm run build`は、このレビュー環境（隔離コピーがマウントされたLinux VM）ではrolldownのネイティブバインディングの不整合で実行できなかった。`tsc --noEmit`は通過。Mac本体のターミナルでの再確認を推奨する。
