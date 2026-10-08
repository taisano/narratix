# Biz Slide Coach「Story」機能 最終提案・実装指示書

版：2026-09-30 v1.0（15.4 保存場所を追記）  
対象：未実装のPro Story機能、Plus／Pro導線、Story Editor、表・言葉の見せ方、Story確認  
実装担当想定：Claude Code  
MVP対象Route：`AIMED`  

> **この文書の位置づけ**  
> 本書は、今後実装するStory機能の提案・実装指示書である。Story機能が本サービスに実装済みであることを示す文書ではない。Prototypeで確認したUI／UXは参考であり、本番実装済みという意味ではない。

> **コードの扱い**  
> 現行コードは `/Users/sanotaisuke/Project/Narratix web app` にある。元コードを直接変更せず、実装・検証が必要な場合は複製した別環境で行うこと。本書作成時も元コードは参照のみで、変更していない。

---

## 0. 判断の優先順位

仕様が衝突した場合は、次の順序で判断する。

1. 本書に記載した2026-09-30時点の合意
2. `docs/catalog.md`および現行レジストリの用語・ID
3. 2026-09-29版「Story機能 提案仕様書」
4. Prototypeの表示・挙動

Prototypeや過去資料に「現在」「反映済み」と書かれていても、本番実装済みとは解釈しない。

---

## 1. 提案の要約

Story機能を、スライド結合やAIによるデッキ自動生成ではなく、次の機能として実装する。

> ユーザーの相談から、1枚で答えるべきか、複数QuestionからなるStoryが適切かをCoachが一つ提案する。Storyの場合は、必要なYesと最大のBarrierを踏まえてQuestion Mapを示す。ユーザー自身がデータ、表、言葉を入力し、Coachの規則と任意のAI Story確認を使いながら、意思決定に必要な説明を組み立てる。

基本方針：

- ユーザーはシェフであり、Coachは質問攻めにせず、リード案を一つ示す。
- Plus／Proとも、最初は枚数を選ばず相談文を自由入力する。
- Proでは、相談を読んだ後にOne SlideまたはStoryを一つ提案する。
- Plusは一つのQuestionを完成度の高い一品にする。
- Proは複数の一品を、意思決定につながるコースとして設計・編集できる。
- Plus／Proでチャート種類や出力品質を制限しない。
- Proの価値は枚数ではなく、Question Map、現在地、次のQuestion、スライド間整合性、共有Dataset、一括出力に置く。
- AIは相談文の構造化に原則1回使用する。
- 例外として、Proユーザーが明示的に実行した場合だけ、月30回までAI Story確認を利用できる。
- Coachはデータや結論を勝手に作らず、AIの提案も自動適用しない。

---

## 2. 既存用語を維持する

`docs/catalog.md`と現行レジストリに合わせ、次の言葉を使用する。

| 用語 | 定義 |
|---|---|
| 目的 | 推移・比較・構成・要因・関係・評価 |
| 料理 | 「今回、最も強く伝えたいこと」 |
| 材料 | 現行仕様ではチャート。Story拡張後も既存定義を壊さない |
| レシピ | チャート＋構成＋付け合わせ |
| 主役 | 1枚の中心となる可視化 |
| 付け合わせ | 主役の右または下に置く、同じデータから計算した第2パネル |
| 補完パーツ | 主役チャートの中に追加する要素 |
| `proof_needs` | Questionに答えるための証明要求。既存の共通enumを参照する |
| Story Route | Questionから必要なYesへ進む論理の順序 |
| Business Archetype | 市場創造、シェア低下、市場予測など、何について説明するか |
| 見せ方 | ユーザー向けの上位概念。グラフ、表、言葉を含む |

料理の比喩は設計思想として用いるが、ユーザー画面へ「料理」「材料」「付け合わせ」を強制しない。ユーザー画面では「Question」「見せ方」「データ」「内容」「Story」など平易な言葉を使う。

### 2.1 `proof_needs`の既存語彙

現行の`src/registry/proofNeeds.ts`を共通語彙として再利用する。

`OVERALL_CHANGE`、`GROWTH_SPEED`、`CONTRIBUTION`、`CURRENT_MIX`、`MIX_CHANGE`、`SIZE_CONTEXT`、`SEGMENT_DIFFERENCE`、`RANKING`、`TARGET_GAP`、`SECOND_METRIC`、`ITEM_SHARE`、`BRIDGE`、`RELATIONSHIP`、`POSITIONING`

- `CONTRIBUTION`は算術的な寄与であり、原因ではない。
- `RELATIONSHIP`は関連であり、因果ではない。
- Story Route、料理、Visual Recipeは同じ`proof_needs`を参照する。
- 現行語彙で表現できないEconomics、Scenario、Risk、Executionなどは、MVP中に既存IDへ無理に割り当てない。将来拡張候補として明示する。

---

## 3. Storyの基本モデル

### 3.1 Storyの最小単位

Storyの最小単位はチャートではない。

> 一つのQuestionに対し、ユーザーが作るMessageと、そのMessageを支えるEvidence、言える範囲を示すBoundary。

| 要素 | 内容 |
|---|---|
| Question | このスライドが答える問い |
| Message | ユーザーが作成する答え・主張 |
| Evidence | Messageを支えるデータ、表、事実 |
| Boundary | データから言える範囲と、まだ言えない範囲 |
| Next Question | 読み手が次に持つ疑問 |

### 3.2 One SlideとStory Flow

| 内部値 | ユーザー向け表現 | 定義 |
|---|---|---|
| `ONE_SLIDE_STORY` | 1枚で伝える | 一つの中心Questionへ、一つのスライドで答える |
| `STORY_FLOW` | Storyとして組み立てる | 一つの相談を順序のある複数Questionへ分解する |
| `MULTIPLE_QUESTIONS` | 複数の相談が含まれている | 独立したQuestionが混ざり、一つのStoryにまとめる根拠が弱い |
| `CLARIFY` | 意図を一つ確認する | 推薦に必要な情報が不足している |

One Slideでも、チャート、KPI、表、短い説明などを組み合わせてよい。チャート数ではなく、中心Questionが一つであることが基準となる。

### 3.3 Storyの枚数

- 枚数を先に決めない。
- Main Storyの理想は3〜8枚。
- 10枚をSoft Maximumとする。
- 1〜2枚で十分なら無理に増やさない。
- 11枚以上も禁止しないが、CoachはQuestion統合、Supporting Evidence／Appendixへの移動、複数Storyへの分割を提案する。
- 表紙、目次、区切り、元データ、出典一覧、AppendixはMain Story枚数に含めない。
- Executive Summaryは追加した場合、Main Storyに含める。

各Questionは次の優先度を持てる。

| 値 | 意味 |
|---|---|
| `REQUIRED` | 必要なYesに到達するため欠かせないQuestion |
| `CONDITIONAL` | Barrier、データ、会議目的によって必要 |
| `SUPPORTING` | 理解を助けるが統合・省略できるQuestion |
| `APPENDIX` | 判断の補足として保持するQuestion |
| `COACHING_ONLY` | データがなくスライドにせず、確認事項として残すQuestion |

Questionの重要度とスライド化を分ける。`REQUIRED`でも、データがなければ`COACHING_ONLY`になり得る。

---

## 4. Plus／Proの商品境界

### 4.1 共通基盤

PlusとProで次を分けない。

- 利用可能なチャート種類
- Mekko、Waterfall、Slopeなどの高度なチャート
- データ保持
- Mechanical Check
- PowerPoint出力品質
- 元データの保持
- 基本的な色・ラベル・表示設定

最適なチャートを料金プランの都合で利用不能にしない。

### 4.2 Plus

> Plusは、今のQuestionを伝わる1枚にする。

- 複数の切り口が相談に含まれる場合、中心Questionを一つ提案する。
- ユーザーは中心Questionを切り替えられる。
- 左サイドバーにはCoachと、現在の1枚のVariationを表示する。
- 同じQuestion・同じDatasetから、別の見せ方を比較できる。
- 次に考える価値があるQuestionを一つだけ表示できる。
- Story全体のQuestion Mapは作らない。

### 4.3 Pro One Slide

- One Slideを選んだ場合の編集体験はPlusと共通。
- ProだからStoryを強制しない。
- 一つのQuestionで十分なら、ProにもOne Slideを推薦する。

### 4.4 Pro Story

> Proは、最初から意思決定までのQuestion Mapを見せる。

- 左サイドバーにStory全体、現在地、次Questionを表示する。
- 選択中スライドのVariationも利用できる。
- Story全体の期間、単位、出典、色、Dataset参照を確認する。
- 複数DatasetとData Viewを扱う。
- Main Story、Supporting Evidence、Appendixを整理できる。
- PPTまたはPPT＋Data ZIPを一括出力できる。

### 4.5 Proの色機能

「Proでは色数が増える」という制限にしない。Proでは、同じ市場・ブランド・製品をStory全体で同色に維持し、一括変更できることを差別化とする。

---

## 5. 相談から推薦までのUX

### 5.1 入口で枚数を聞かない

Plus／Proとも、最初にOne Slide／Storyを選ばせず、自由に相談文を書いてもらう。

```text
相談文
  ↓ AIを1回使用
構造化JSON
  ↓ 規則
中心Question／必要なYes／最大のBarrier／proof_needs
  ↓ 規則
ONE_SLIDE_STORY／STORY_FLOW／MULTIPLE_QUESTIONS／CLARIFY
  ↓
Coachのおすすめを一つ表示
```

### 5.2 AIが追加で構造化する項目

既存の`ConsultationClassification`を壊さず、Story用の構造を追加する。

```json
{
  "decision_question": "どの訪日市場を優先して追うべきか",
  "desired_yes": "SELECTION",
  "primary_barrier": "市場規模と回復率で候補が一致しない",
  "proof_needs": ["OVERALL_CHANGE", "SEGMENT_DIFFERENCE", "SECOND_METRIC"],
  "scope_candidate": "STORY_FLOW",
  "route_signals": ["DATA_DISCOVERY", "MISMATCH", "PRIORITIZATION"],
  "outcome_direction": "MIXED",
  "confidence": 0.89,
  "alternative_question": null
}
```

AIはRoute、レシピ、結論を自由生成しない。分類を受け、規則が推薦する。

### 5.3 必要なYes

| 値 | 読み手に期待する状態 |
|---|---|
| `RECOGNITION` | 事実・問題・機会を認識する |
| `INTERPRETATION` | 原因や意味に納得する |
| `SELECTION` | 選択肢から方向を選ぶ |
| `FEASIBILITY` | 実行可能性に納得する |
| `COMMITMENT` | 予算・人員・行動を承認する |

Routeの全ステップを通すのではなく、`desired_yes`を停止条件として必要なQuestionだけを提案する。

### 5.4 One Slideを推薦する主な条件

- 中心Questionが一つ。
- `proof_needs`が一つ、または一つのレシピへ統合できる。
- 同じDatasetで答えられる。
- 相談の動詞が「見せたい」「報告したい」「比較したい」。
- `desired_yes`が主に`RECOGNITION`。
- 次の判断や原因特定まで求められていない。
- ユーザーが明示的に「1枚で」と書いている。

### 5.5 Storyを推薦する主な条件

- 一つのDecision Questionに複数のBarrierがある。
- Questionに論理的な順序がある。
- 複数の`proof_needs`を別々に確認する必要がある。
- Datasetや指標が異なり、1枚では誤読される。
- 事実→要因→判断、または基準→選択肢→Trade-off→判断が必要。
- 「理由を特定」「判断」「承認」「実行」「展開」まで相談に含まれる。
- 「一連の流れ」「複数枚」と明示されている。

### 5.6 `MULTIPLE_QUESTIONS`

複数QuestionがあるだけでStoryにしない。同じDecision Questionへ向かっていない場合は、中心を一つ確認するか、別Storyとして扱う。

### 5.7 確認は一問だけ

確信度が低い場合は、枚数ではなく意図の深さを一問だけ確認する。

例：

> 今回は、関西だけが伸びた事実を見せることが中心ですか。それとも、伸びた理由まで確認しますか？

回答後は追加質問を連続させず、推薦へ進む。

### 5.8 推薦画面

おすすめを一つ大きく表示し、別の進め方は閉じる。

```text
Coachのおすすめ

今回はStoryとして組み立てるのがおすすめです。

想定するQuestion
1. どこで伸びたか
2. 何が寄与したか
3. 他地域でも再現できるか

[このStoryから始める]

別の進め方
▸ まず1枚に絞る
```

### 5.9 意図の修正

- 「想定するQuestionが違う」では、AIが抽出済みの範囲を規則で切り替え、AIを再度呼ばない。
- 「相談内容を修正する」では、元の相談文を入力欄へ残した状態で編集できる。
- 相談文が変更された場合のみ、新しい相談としてAIを1回呼ぶ。
- 更新失敗時も以前の提案を消さない。
- 作成開始後に相談文を変更しても、既存スライドやDatasetを自動削除しない。

---

## 6. 8つのStory Route

Story Routeはスライド枚数のテンプレートではなく、QuestionからYesへ進む論理の順序である。Route名をユーザーに選ばせず、自然なQuestionの流れとして表示する。

### 6.1 Primary／Secondary Route

- Primary RouteはStoryの背骨として必ず一つ。
- 相談がその先の判断まで明示する場合だけ、Secondary Routeを最大一つ接続する。
- Secondary Routeを丸ごと追加せず、Primaryで回答済みの役割を省く。
- 接続点に`transitionQuestion`を持つ。
- MVPではPrimary `AIMED`のみ実装し、Secondary自動提案は将来構想とする。

例：

```json
{
  "primaryRoute": "DIAGNOSIS",
  "secondaryRoute": {
    "route": "CHOICE",
    "startAt": "CRITERIA",
    "transitionQuestion": "再現可能なら、どの地域が次の候補になるか"
  }
}
```

代表的な将来接続：

- `DIAGNOSIS → CHOICE`
- `AIMED → CHOICE`
- `DIAGNOSIS → BUSINESS_CASE`
- `URGENCY → TRANSFORMATION`
- `CHOICE → BUSINESS_CASE`
- `PROOF → BUSINESS_CASE`または`TRANSFORMATION`

### 6.2 Answer First

用途：結論が固まり、短時間で判断・承認を得たい。  
主なYes：`SELECTION`、`COMMITMENT`

```text
Decision Question
→ User-authored Answer
→ Reasons
→ Evidence
→ Risks
→ Ask
```

- AnswerとAskはユーザー入力。
- Decision QuestionはStory設定として必須だが、独立スライドを強制しない。
- Evidenceは既存`proof_needs`と料理・レシピに接続する。
- Risksは`CONDITIONAL`だが、高額投資・不可逆判断ではMain Storyに置く。

### 6.3 AIMED

用途：データから全体像、差、説明を積み上げて判断へ進む。  
主なYes：`RECOGNITION`、`INTERPRETATION`、`SELECTION`

| 役割 | Question | 優先度 | 主な`proof_needs` |
|---|---|---|---|
| `AIMED.ANCHOR` | 何を明らかにするか | `REQUIRED` | なし。Story設定として扱う |
| `AIMED.IMPACT` | 全体として何が起きているか | `REQUIRED` | `OVERALL_CHANGE`、`CURRENT_MIX`、`SIZE_CONTEXT` |
| `AIMED.MISMATCH` | 全体の裏にどんな差・例外があるか | `REQUIRED` | `SEGMENT_DIFFERENCE`、`MIX_CHANGE`、`TARGET_GAP`、`SECOND_METRIC` |
| `AIMED.EXPLANATION` | 違いをどこまで説明できるか | `CONDITIONAL` | `CONTRIBUTION`、`BRIDGE`、`RELATIONSHIP`、`SECOND_METRIC` |
| `AIMED.DECISION` | 次に何を判断・確認するか | `REQUIRED` | 新しいデータとは限らない |

DecisionはQuestion Mapに必ず置くが、独立スライドには固定しない。最後のEvidence、Executive Summary、Decisionスライドのいずれかでユーザーが記入する。

### 6.4 Diagnosis

用途：Positive、Negative、Mixed、Neutralな結果を生んだ要因を明らかにする。  
主なYes：`RECOGNITION`、`INTERPRETATION`。必要に応じてSecondaryへ接続。

```text
Outcome
→ Location
→ Driver
→ Root Cause
→ Actionability
→ Action
```

- 既存`DIAGNOSIS.SYMPTOM`は、Storyでは中立的に「Outcome／観察された結果」と表示する。将来の内部ID変更は互換性を考慮する。
- `outcome_direction`は`POSITIVE`、`NEGATIVE`、`MIXED`、`NEUTRAL`、`UNKNOWN`。
- Positiveでは再現・拡大、Negativeでは修正・緩和、Mixedでは押し上げ・押し下げを扱う。

Driverの表現を3段階に分ける。

| 表現 | 条件 |
|---|---|
| 増減への寄与 | 加算可能な要因分解が成立 |
| 関連する要素 | 相関または同時変化のみ確認 |
| 原因 | 追加検証で因果を支持するEvidenceがある |

Coachはこの3つを混同しない。

### 6.5 Choice

用途：市場、商品、施策、投資先などから選ぶ。  
主なYes：`SELECTION`、`COMMITMENT`

```text
Decision
→ Criteria
→ Options
→ Trade-offs
→ User-authored Recommendation
→ Conditions
→ Commitment
```

- Criteria、Options、Trade-offsは原則`REQUIRED`。
- Recommendationはユーザー入力。
- Conditionsは`CONDITIONAL`。
- CommitmentはQuestion Mapへ置くが、相談がSelectionまでなら次のQuestionに留める。
- 主な既存`proof_needs`は`RANKING`、`POSITIONING`、`SECOND_METRIC`、`TARGET_GAP`。
- 比較表、KPIスコアカード、散布図、バブルなどを候補にする。

### 6.6 Urgency

用途：なぜ今動く必要があるかを示す。  
主なYes：`RECOGNITION`、`COMMITMENT`

```text
Status Quo
→ Inflection
→ Exposure
→ Cost of Delay
→ Window
→ No-regret Move
```

- 主な既存`proof_needs`は`OVERALL_CHANGE`、`TARGET_GAP`、`SIZE_CONTEXT`。
- No-regret Moveはユーザー入力。
- Cost of Delayを推測で作らない。データがなければCoaching Questionとする。

### 6.7 Business Case

用途：予算、新規事業、設備、システム、M&Aなどの投資判断。  
主なYes：`FEASIBILITY`、`COMMITMENT`

```text
Opportunity／Problem
→ Value Pool
→ Economics
→ Assumptions
→ Scenarios
→ Risks
→ Stage Gates
→ Ask
```

- 主な既存`proof_needs`は`SIZE_CONTEXT`、`GROWTH_SPEED`、`SECOND_METRIC`、`BRIDGE`。
- Economics、Scenario、Riskは将来の語彙・Template拡張対象。
- Askはユーザー入力。
- 市場規模と自社獲得可能価値を混同しない。

### 6.8 Proof

用途：新しい主張、既存常識への反論、不確実性の高い施策を検証する。  
主なYes：`INTERPRETATION`、`FEASIBILITY`

```text
Claim
→ Test
→ Evidence
→ Counter-evidence
→ Boundary
→ Experiment
→ Scale Decision
```

- Claim、Test、Evidence、Boundaryは原則`REQUIRED`。
- Counter-evidenceは高リスクの主張ではMain Storyへ置く。
- 主な既存`proof_needs`は`RELATIONSHIP`、`SECOND_METRIC`、`TARGET_GAP`。
- 相関から因果を断定しない。

### 6.9 Transformation

用途：中期計画、組織改革、営業変革、DXなどの実行計画。  
主なYes：`FEASIBILITY`、`COMMITMENT`

```text
Ambition
→ Baseline
→ Gap
→ Initiatives
→ Sequence
→ Ownership
→ Milestones
→ Governance
```

- 主な既存`proof_needs`は`TARGET_GAP`、`BRIDGE`、`OVERALL_CHANGE`。
- Roadmap、Milestone、Ownership、Governanceは将来のStory Template拡張対象。

### 6.10 Routeは全ステップを強制しない

例：「関西地域だけ売上が伸びたことを経営陣に報告したい」は、One SlideまたはDiagnosisのOutcome＋Locationで止める。「他地域へ展開する地域を決めたい」まで明示された場合に限り、DiagnosisからChoiceへ接続する。

---

## 7. MVP：AIMED Story

### 7.1 実装対象

- Pro StoryのPrimary Routeは`AIMED`のみ。
- `desired_yes`に応じて必要なQuestionまで提案する。
- Secondary Route用データ構造は将来互換のため持てるが、自動提案しない。
- 残り7 Routeは仕様・構造を文書化するが、MVP実装対象外。

### 7.2 Question生成

Routeの役割をそのまま1枚にしない。

```text
Route role
→ Question
→ proof_needs
→ 料理
→ 材料・レシピ
→ 統合・分割
→ Slide
```

### 7.3 統合条件

次を満たす場合は1枚への統合候補とする。

- 同じSource Datasetを使う。
- 同じ中心Questionへ答える。
- 主役と付け合わせで表現できる。
- 指標の意味を混同しない。
- 一つのMessageで説明できる。
- `catalog.md`の項目数上限を超えない。

例：全体の拡大と成長の牽引役は`TREND_STACKED_DELTA`で統合可能。

### 7.4 分割条件

- 異なるSource Datasetを使う。
- 重要な指標が多い。
- 規模と率を同画面に置くと誤読される。
- 反対材料やBoundaryを分ける必要がある。
- 項目数がレイアウト上限を超える。

### 7.5 インバウンド市場の参考例

```text
AIMED.IMPACT
市場全体はどこまで回復したか
proof_needs: OVERALL_CHANGE
参考レシピ: TREND_LINE、TREND_COLUMN、条件付きでTREND_STACKED

AIMED.MISMATCH
市場別の回復にはどんな差があるか
proof_needs: SEGMENT_DIFFERENCE
参考レシピ: COMP_RANK_DELTA、COMP_VARIANCE、TREND_SLOPE

AIMED.EXPLANATION
人数の回復度と旅行消費額では見え方がどう変わるか
proof_needs: SECOND_METRIC、SIZE_CONTEXT、CURRENT_MIX
参考レシピ: COMP_RANK_METRIC2、MIX_MEKKO

AIMED.DECISION
人数、成長率、消費額のどれを判断基準として扱うか
見せ方: 言葉でまとめる／次のアクション／Executive Summary
```

中国が人数では2019年未満だが、2024年旅行消費額では最大という関係は、`SECOND_METRIC`による重要なMismatchとして扱う。Coachは優先市場を決定せず、どの指標を判断基準にするかをQuestionとして示す。

---

## 8. Editorの画面構造

既存Editorの3カラム構造を維持する。

```text
┌────────────┬──────────────────────┬──────────────┐
│ 左：Coach   │ 中央上：完成プレビュー │ 右：見せ方・調整 │
│ Story Map  ├──────────────────────┤              │
│ 現在地      │ 中央下：入力UI          │              │
└────────────┴──────────────────────┴──────────────┘
```

設計思想上は、中央が調理場、右が味付け・盛り付け、左がCoachとコース全体。ただし画面上で料理用語を強制しない。

### 8.1 左サイドバー

Plus／Pro One Slide：

- 現在のQuestion
- CoachのおすすめVariation
- 別の見せ方
- 次に考えるQuestionを一つ

Pro Story：

- Storyの目的
- 全Question
- `確認済み／作成中／次に作る／この後`の状態
- 現在地
- 次Question
- Dataset状態
- 選択中スライドのVariation
- Supporting Evidence／Appendixへの移動

Story NavigationとVariationは排他的にしない。

### 8.2 中央上

- 常に完成するスライドのプレビューを表示。
- グラフ、表、言葉、Hybridで共通。
- 入力と設定の変更を即時反映する。

### 8.3 中央下

見せ方に応じて入力UIを切り替える。

| 見せ方 | 中央下 |
|---|---|
| グラフ | Data Grid、Excel・表から貼り付け |
| 表 | 表の列・行・数値・ラベル入力 |
| 言葉 | 構造化されたText入力欄 |
| Hybrid | `データ`と`内容`のタブ |

### 8.4 右サイドバー

右サイドバーの「チャート」を「見せ方」に変更する。

```text
見せ方を選ぶ

グラフで伝える
[推移] [比較] [構成]
[要因] [関係] [評価]

表・言葉で伝える
[表で整理] [言葉でまとめる]
```

- 系統→目的→種類という深い階層を作らない。
- 選択後は同じ領域を完成形の選択へ入れ替え、下へ積み増さない。
- Coachのおすすめを初期選択する。
- ユーザーが変更するときだけ一覧を開く。

---

## 9. 表・言葉の見せ方

チャート以外をサブ扱いしない。KPI、表、言葉はQuestionによってスライドの主役になれる。

### 9.1 表で整理

MVPで次を一通り実装する。

| 内部ID案 | ユーザー向け名称 | 用途 |
|---|---|---|
| `BASIC_TABLE` | 基本表 | 正確な値を一覧で確認 |
| `COMPARISON_TABLE` | 比較表 | 複数案・市場・商品を同じ基準で比較 |
| `DELTA_TABLE` | 増減付き表 | 現在値と前年差・計画差を表示 |
| `KPI_SCORECARD` | KPIスコアカード | 少数の重要指標をまとめる |
| `HEATMAP_TABLE` | ヒートマップ型の表 | 多数項目から特徴を見つける |

強調セルは独立Templateではなく、各表の表示設定を基本とする。必要ならVariationとして表示する。

KPIには、数値、単位、対象期間、比較基準、増減、出典を持たせる。単一KPI、KPI横並び、実績対目標、KPI＋小さな推移、Scenario KPIを将来拡張可能にする。

### 9.2 言葉でまとめる

MVPで次を一通り実装する。

| 内部ID案 | ユーザー向け名称 |
|---|---|
| `CONCLUSION_THREE_REASONS` | 結論＋3つの根拠 |
| `EXECUTIVE_SUMMARY` | Executive Summary |
| `ISSUE_INSIGHT_ACTION` | 課題→示唆→アクション |
| `TWO_COLUMN_COMPARE` | 2カラム比較 |
| `BULLET_SUMMARY` | 箇条書き |
| `NUMBER_WITH_EXPLANATION` | 数字＋短い説明 |
| `NEXT_ACTION` | 次のアクション |

Coachは入力欄、参照するEvidence、未入力状態を示す。本文や結論を自動入力しない。

### 9.3 Blank Text

Blank Textは逃げ道として利用可能にしてよいが、標準推薦にしない。最低限、メッセージタイトル、本文、出典、ページ番号の構造を維持する。

### 9.4 内容と表示設定を分離する

| 場所 | 役割 |
|---|---|
| 中央下 | 何を入れるか |
| 中央上 | 完成するとどう見えるか |
| 右 | どう見せるか |
| 左 | Story全体で何を作っているか |

右で本文を書かせたり、中央のData Gridで色を設定させたりしない。

---

## 10. Dataset、Data View、Content

### 10.1 基本モデル

StoryがSource Datasetを持ち、スライドは参照する。

```text
Source Dataset
  ↓
Data View（期間・項目・並び・強調）
  ↓
Slide（見せ方・表示設定・Message）
```

一つのDatasetを複数スライドで共有できる。Dataset更新は関連スライドへ原則自動反映するが、影響範囲を表示し、「このスライド用に複製」できる。

### 10.2 見せ方を変更しても内容を失わない

- グラフ→表：同じDatasetを使用。
- 表→グラフ：数値列を利用し、文字列列を勝手に削除しない。
- グラフ／表→言葉：Datasetを保持し、Text Contentを別に持つ。
- Hybrid：DatasetとContentの両方を参照する。

### 10.3 部分データから始められる

最新期間だけを貼り付けた場合も止めない。

- 現在値スライドは作成可能。
- 推移や成長率には期間追加が役立つことを静かに案内する。
- 後から同じ指標・分類の時系列を追加する場合、既存Datasetへの統合候補を示す。
- 単位、年度、指標定義を確認せず自動統合しない。

### 10.4 大きなDataset

- Storyに役立ちそうな項目と粒度を参考として示す。
- 取引明細全体ではなく、必要な粒度へ集計された表を推奨できる。
- 大きな表が貼られても、まず受け入れ、必要な列・Data Viewを規則で確認する。
- 集計・除外・変換は内容と理由を表示し、ユーザー確認なしに実行しない。
- AIへ元Dataset全体を送らない。

### 10.5 複数Dataset

Data Planは質問ウィザードではなく、参考情報とする。

推奨トーン例：

> このStoryでは、2種類のデータがあると整理しやすそうです。  
> A. 市場・国別×期間×訪日客数。これがあると、全体の回復と市場別の差を確認できると思います。  
> B. 市場・国別×費目×旅行消費額。これがあると、規模の大きい市場と消費の中身がどう違うかを確認できるのではないでしょうか。  
> 項目名や表の形は同じでなくても構いません。AとBを市場・国別に比べる場合は、市場・国の名称や分類が揃っていると対応させやすいでしょう。

次のような事前回答ボタンは挟まない。

- この形に近いデータがある
- 別の形のデータがある
- どのデータが使えるか確認したい
- 今は手元にない

ユーザーは`このStoryから始める`でEditorへ進み、手元のデータをそのまま貼り付けられる。

データを集める依頼を作りたい人のために、**任意の副導線**として「データパックを作る」を置く（`docs/story-data-pack-implementation-plan.md` 13章）。主導線の`このStoryから始める`は変えず、事前質問も挟まない。データパックは複数Datasetの収集テンプレートを`00_Overview`付きのExcelで出力する。

### 10.6 Coachが確認する条件

事前に細かく質問せず、入力後も次は聞かずに進める。

- 列名が提案例と違う。
- 項目、期間、地域、内訳が多い。
- 今回使わない列が含まれる。
- 同じDatasetを複数スライドで使えそう。

次の場合だけ確認する。

- 金額と率など、意味の異なる指標を合算しようとしている。
- 年と年度、実績と予測、通貨・単位が混在する。
- 集計、除外、変換でデータの意味が変わる。
- 複数Datasetの対応関係が一意に決まらない。
- そのまま進めると誤ったチャートになる。

原則：不便だから聞くのではなく、黙って進めると意味が変わるときだけ聞く。

---

## 11. Coachの役割と境界

### 11.1 Coachが行うこと

- 相談理解を短く言い換える。
- 必要なYesと最大のBarrierを分類する。
- One SlideまたはStoryを一つ提案する。
- Story Routeを一つ提案する。
- 必要な場合だけSecondary Routeを接続する。
- 中心Question、Question Map、`proof_needs`を提示する。
- あると進めやすいデータの形を提案する。
- 既存の料理・材料・レシピから参考の見せ方を提示する。
- 同じDatasetのVariationを提示する。
- 単位、期間、指標種別などをMechanical Checkする。
- Story全体の抜け、重複、矛盾の可能性を質問する。

### 11.2 Coachが通常行わないこと

- Message、結論、Executive Summaryを自動入力する。
- データの正確性、信頼性、網羅性を保証する。
- 相関を因果と断定する。
- 経営判断、投資先、優先順位を決定する。
- 外部データを無断で追加する。
- 「確認済み」を「検証済み」と表現する。

### 11.3 AI Story確認の例外

ユーザーが明示的に`StoryをAIで確認`を実行した場合に限り、AIはヘッダーテキストの代替案を提示できる。

- 必ず「代替案」と表示する。
- 自動適用しない。
- ユーザーが`使う`または`編集して使う`を選んだ場合だけ反映する。
- 代替案を事実確認済みと表現しない。
- 数値を含む案は、既存`slideFacts`とfact IDによる照合方法を再利用する。

### 11.4 C／Q／i

| 表示 | 意味 | 動作 |
|---|---|---|
| `C` | Mechanical Check | 重大な数値・単位・意味問題では保存・出力を止める |
| `Q` | Coaching Question | 進行を止めず、重要な一問を表示する |
| `i` | Reference | 参考例・考え方。通常は閉じる |

---

## 12. Story完成前の確認

### 12.1 規則で常時Detectする

- 同じ市場・ブランド・製品の色が異なる。
- 単位、通貨、期間、年度が不一致。
- 実績と予測の区別がない。
- 出典が空欄またはTemplateのまま。
- Messageや構造化Textの必須入力欄が空。
- Dataset更新後に表示が未更新。
- 同じDatasetを参照しているのに数値が不一致。
- レシピのデータ条件を満たさない。
- Excelエラー、欠損、合計行の誤認。
- Main Storyが10枚を超える。
- 複数Datasetの結合で重複・粒度不一致がある。

### 12.2 AI Story確認

Proユーザーが任意で実行する。

確認対象：

- Story全体の流れ。
- Questionの抜け・重複。
- MessageとEvidenceの関係。
- 寄与、関連、原因の混同。
- 期間、指標、単位の意味的な不一致。
- 事実、解釈、経営上のQuestionの区別。
- ヘッダーテキストの代替案。

出力：

- 重要なCoaching Questionを最大3件程度。
- 必要なスライドのヘッダーテキスト代替案。
- 自動修正はしない。

### 12.3 AI Story確認の回数

- Proに月30回含める。
- 一つのStory確認を1回と数え、枚数では変えない。
- ヘッダー代替案も同じ1回に含む。
- 成功した確認だけ数える。
- APIエラー・処理失敗は数えない。
- 内容を変更せず以前の結果を再表示する場合は数えない。
- 修正後に再確認した場合は1回消費する。
- 契約更新日に30回へ戻す。
- 追加クレジット購入に拡張可能なデータ構造とする。価格は本書の対象外。

既存の`ai_usage`に新しいfeature値`ai_story_review`を追加する案とする。現行`ai_headline`が別に存在する場合でも、Story確認内のヘッダー代替案を二重計上しない。

---

## 13. AIへ送るデータと画面文言

### 13.1 通常時

- AI相談では相談文だけを送る。
- レシピ推薦、Variation、データチェックは規則で行う。
- 通常のチャート作成・編集では、表データをAIへ送らない。

### 13.2 Story確認時

ユーザーが明示的に実行した場合だけ、次を送る。

- 元の相談文。
- Story RouteとQuestion Map。
- ユーザーが入力したヘッダーとMessage。
- スライド順序、レシピ、設定。
- 単位、期間、出典。
- Mechanical Check結果。
- スライドに表示している集計済みデータ、またはアプリが計算した`slideFacts`。

送らないもの：

- 元のExcelファイル。
- Storyで使われていない行・列。
- 元Dataset全体。
- 無関係なStory、スライド、アカウント内ファイル。

原則として、現行`docs/ai-foundation.md`の`slideFacts`方式を優先し、Story確認に不足する場合だけスライドで使用中の集計済みデータを送る。

### 13.3 画面の短い文言

> 通常のチャート作成・編集では、表データをAIへ送信しません。「StoryをAIで確認」を実行した場合のみ、StoryのQuestion、テキスト、設定、スライドで使用している集計済みデータをOpenAI APIへ送信します。元のDataset全体は送信しません。

`AIへ送信する内容を見る`で詳細を開けるようにする。

### 13.4 API設定

- 可能な範囲で`store: false`を使用する。
- ファイルアップロードを使わず、構造化JSONを送る。
- APIキーはサーバー側だけに置く。
- 実際のプライバシーポリシー、OpenAI契約、保持設定と画面文言を一致させる。
- OpenAI APIへ送信されたデータは、明示的にオプトインしない限りモデル学習に利用されない。ただし標準設定では不正利用監視ログに最大30日保持される場合があるため、法務・プライバシー表示で過度な断定をしない。

---

## 14. Executive Summary

- 必須にしない。
- Story Map上で`追加して作成`または`今回はスキップ`を選べる。
- `言葉でまとめる > Executive Summary`として作成する。
- Coachは代筆しない。

入力項目例：

- 全体として確認されたこと。
- 判断を変える差・例外。
- 重要なEvidenceと参照スライド。
- 今回判断・確認すること。
- Boundary。

AI Story確認では、Executive Summaryと参照Evidenceの不一致をCoaching Questionとして確認できる。

---

## 15. 保存・出力

### 15.1 出力

```text
[PPTを出力]
[PPT＋DataをZIPでダウンロード]
```

ZIP例：

```text
Story_Name/
├ Story_Name.pptx
└ Story_Name_Data.xlsx
```

Data workbook案：

- DatasetごとのSheet。
- 単位、期間、出典。
- ユーザーが承認した変換。
- Datasetを使用するスライド。
- 必要に応じてChange Log。

既存設定として、元データのスライドをPPT末尾へ付ける選択も維持する。

### 15.2 順序

1. Executive Summary（追加した場合）
2. Main Story
3. Supporting Evidence
4. Appendix
5. 元データスライド（選択した場合）

### 15.3 変更・バージョン

- 相談文変更、Route変更、Story再提案で既存スライドを自動削除しない。
- 現在のStoryを維持、新しい提案を別案として確認、新しい提案へ切替、を選べる設計にする。
- Dataset、Content、見せ方を別々に保存する。

### 15.4 保存場所：マイチャートの「Story」（2026-09-30 追記）

- マイチャートに「Story」という階層（タブ）を、チャート・下書き・相談の履歴と並べて作る。並びは **チャート／Story／下書き／相談の履歴**。
- 1つの Story を **1件** として保存する（スライドをチャートとしてバラバラに保存しない）。
- 保存先は表 `stories`（本人だけが読み書きできる。RLS は `chart_drafts` と同じ形）。1行に Story の状態（16章のデータモデル。Dataset・スライド・Executive Summary・AI Story 確認の結果を含む）を jsonb で持ち、一覧用に名前・Main Story の枚数・Primary Route を列にも持つ。
- 一覧の名前は、付けた名前 → 決めたい問い（`decisionQuestion`）→ 最初の Question の順。一覧では、開く・名前の変更・複製・削除ができる。
- ベータの間は全員が使える（`BETA_OPEN_STORY`）。ベータが終わったら Pro（プラン ID `team`）だけにする。プランの呼び名は、コード上の ID が `free`＝基本、`pro`＝Plus、`team`＝Pro。

---

## 16. データモデル案

既存型と整合させながら、概念として次を持つ。

```json
{
  "storyId": "story_001",
  "scope": "STORY_FLOW",
  "desiredYes": "SELECTION",
  "primaryBarrier": "市場規模と回復率で候補が一致しない",
  "primaryRoute": "AIMED",
  "secondaryRoute": null,
  "routeConfidence": 0.89,
  "businessArchetype": "MARKET_PRIORITY",
  "datasets": [
    {
      "id": "visitors_by_market",
      "label": "市場別の訪日客数",
      "sourceData": {},
      "unit": "people",
      "periodType": "CALENDAR_YEAR",
      "source": "",
      "usedBySlides": ["slide_1", "slide_2"]
    }
  ],
  "slides": [
    {
      "id": "slide_1",
      "order": 1,
      "routeRole": "AIMED.IMPACT",
      "questionPriority": "REQUIRED",
      "presentationMode": "GRAPH",
      "question": "市場全体はどこまで回復したか",
      "proofNeeds": ["OVERALL_CHANGE"],
      "userAuthoredMessage": "",
      "suggestedDataNeeds": [
        {
          "label": "市場・国別の訪日客数",
          "suggestedShape": ["市場・国", "期間", "訪日客数"],
          "reason": "全体の回復と市場別の差を確認しやすいため"
        }
      ],
      "referenceRecipes": ["TREND_LINE"],
      "datasetRefs": ["visitors_by_market"],
      "dataView": {
        "periods": [],
        "categories": [],
        "highlight": null
      },
      "textContent": null,
      "nextQuestion": "市場別の回復にはどんな差があるか",
      "status": "NOT_STARTED",
      "mechanicalChecks": [],
      "coachQuestions": []
    }
  ],
  "executiveSummary": {
    "enabled": false,
    "userAuthoredContent": {},
    "evidenceSlideRefs": []
  },
  "aiStoryReview": {
    "lastReviewedRevision": null,
    "result": null
  }
}
```

`userAuthoredMessage`、Executive Summaryの本文、Decision、Recommendation、Ask、Actionはユーザーが入力する。

---

## 17. 実装優先順位

### P0：既存機能の安定

- 貼り付け、プレビュー、保存、復元、PPT出力。
- 処理中、成功、失敗の明示。
- プレビューとPPTの一致。
- 既存Plus体験を壊さない。

### P1：Story用の相談構造化とScope推薦

- `decision_question`、`desired_yes`、`primary_barrier`、`proof_needs`、`scope_candidate`。
- One Slide／Story／Multiple Questions／Clarifyの規則。
- おすすめ一つ＋閉じた別案。
- 相談文の編集と再提案。

### P2：AIMED Question Map

- Anchor、Impact、Mismatch、Explanation、Decision。
- `desired_yes`による停止。
- 料理・レシピへの接続。
- 枚数の統合・分割。
- 3〜8枚の理想、10枚のSoft Maximum。

### P3：Pro Story Editor

- 左：Story Navigation＋Variation。
- 中央：完成プレビュー＋入力UI。
- 右：「見せ方」。
- Source Dataset、Data View、Content。
- Main／Supporting／Appendix。

### P4：表・言葉の見せ方

- 5つの表Template。
- 7つのText Template。
- Hybrid入力。
- 見せ方変更時の内容保持。

### P5：整合性確認とAI Story確認

- 常時Mechanical Check。
- `ai_story_review`。
- 月30回。
- Coaching Question最大3件。
- ヘッダーテキスト代替案。
- `slideFacts`再利用。

### P6：出力

- 複数スライドPPT。
- PPT＋Data ZIP。
- Executive Summary任意。
- Supporting／Appendix／元データ順序。

### Future

- 残り7 Route。
- Primary＋Secondary自動接続。
- Roadmap、Scenario、Risk、Stage Gateなどの専用Template。
- Teamの共同作業、ブランド管理、管理者機能。

---

## 18. MVP受入条件

### 18.1 相談・推薦

- 同じ相談文、同じプロンプト版、同じ規則版から同じ推薦が返る。
- ProでOne SlideまたはStoryが一つ推薦される。
- ProだからStoryを強制しない。
- 推薦理由が相談の言葉に結びついている。
- 相談文にない実行・投資・承認まで範囲を広げない。
- 不明な内容をAIが推測で確定しない。

### 18.2 AIMED Story

- AIMEDの必要Questionが過不足なく表示される。
- Route roleとスライドを1対1に固定しない。
- DecisionはQuestion Mapにあるが、独立スライドを強制しない。
- 10枚を超える場合、統合・Appendix・分割を提案する。

### 18.3 Editor

- Plus／Proで中央と右の操作体系が共通。
- Pro左側でStory全体、現在地、次Questionが分かる。
- Proでも選択中スライドのVariationが使える。
- グラフ、表、言葉のいずれも中央上で完成形を確認できる。
- 中央下の入力UIが見せ方に応じて切り替わる。
- 見せ方を変えてもDatasetとContentを失わない。

### 18.4 Dataset

- 一つのDatasetを複数スライドで共有できる。
- Dataset更新時に影響範囲を表示する。
- スライド固有Data Viewを維持する。
- 部分データから始められる。
- ユーザーの確認なしに集計・除外・変換・結合しない。
- Data Planの事前質問を強制しない。

### 18.5 表・言葉

- 5つの表Templateが選べる。
- 7つのText Templateが選べる。
- Text Templateの本文はユーザーが入力する。
- KPI、表、言葉が主役になれる。

### 18.6 AI Story確認

- 明示的な操作時だけAIを呼ぶ。
- 残り回数を表示する。
- 月30回をサーバー側で判定する。
- 成功時だけ回数を消費する。
- 元Dataset全体を送らない。
- 代替ヘッダーを自動適用しない。
- AIが失敗してもPPT出力を含む通常機能は利用できる。

### 18.7 出力

- PPTを出力できる。
- PPT＋Data ZIPを出力できる。
- Executive Summaryを追加またはスキップできる。
- 元データを無断で変更・削除しない。

---

## 19. 検証シナリオ

最低限、次をテストする。

1. 「関西だけ売上が伸びたことを報告したい」→One Slide。
2. 「市場全体の回復、市場差、消費の中身から優先市場を議論したい」→AIMED Story。
3. 相談に二つの独立Questionがある→中心確認または別Story提案。
4. スナップショットだけ入力→現在値スライドを作り、推移用の期間追加を非強制で案内。
5. 時系列を後から追加→同じDatasetへの統合候補を表示。
6. 同じDatasetからグラフ、比較表、KPIを作成。
7. グラフ→表→言葉→グラフでデータ・Textを保持。
8. 複数Datasetの市場名が一部不一致→勝手に削除しない。
9. 人数では中国が2019年未満、旅行消費額では最大→`SECOND_METRIC`のMismatchとして扱う。
10. 寄与を原因と断定したMessage→AI Story確認でQuestionを出す。
11. 出典がTemplateのまま→規則で検出。
12. 同じ市場の色がスライド間で異なる→規則で検出。
13. Executive Summaryなしで出力。
14. Executive SummaryありでEvidence参照を含めて出力。
15. AI Story確認失敗→回数を消費せず、通常出力は可能。
16. 30回到達→追加クレジット案内、規則ベース確認は継続利用可能。

---

## 20. 非対象・禁止事項

MVPでは次を行わない。

- 残り7 Routeの本番実装。
- AIによるデッキ全自動生成。
- AIによるExecutive Summaryの自動入力。
- AIによる経営判断・投資先・優先順位の決定。
- 外部データの無断追加。
- 元Dataset全体のAI送信。
- フル機能のPowerPoint自由配置エディター。
- 巨大な取引明細を自由にモデリングするExcel代替。
- Plusのチャート種類・データチェック・出力品質の意図的な劣化。
- Routeの全ステップを機械的にスライド化すること。
- 相談にないAction、Commitment、投資判断を自動で追加すること。

---

## 21. 守るべき最終原則

1. おすすめは一つだけ出す。
2. ユーザーに枚数やRouteを最初から選ばせない。
3. AIは相談文の構造化に原則1回だけ使う。
4. 任意のAI Story確認はPro月30回とし、ユーザーが明示的に実行する。
5. Route、Question Map、料理、レシピの推薦は再現可能な規則で行う。
6. Coachは通常、Message、結論、Executive Summaryを代筆しない。
7. AI Story確認のヘッダー代替案は自動適用しない。
8. データを黙って変えない、失わない。
9. 外部データを勝手に追加しない。
10. 重大な意味・単位問題は保存・出力を止める。
11. 寄与、関連、原因を区別する。
12. 一枚で十分ならStoryを勧めない。
13. Storyは3〜8枚を理想とするが、枚数を固定しない。
14. 10枚を超える場合は、統合、Appendix、Story分割を提案する。
15. Plusを意図的に不完全にしない。
16. Proの価値を枚数、チャート種類、AI利用量だけに置かない。
17. Story Route、Business Archetype、料理、レシピ、見せ方を混同しない。
18. 左はCoachとStory、中央は入力と完成形、右は見せ方という構造を維持する。
19. Data Planは参考情報であり、作り始める前の質問ウィザードにしない。
20. ユーザーはシェフであり、Coachは材料を持っているか逐一確認せず、必要な場面だけ助言する。

---

## 22. 最終フロー

```text
相談
  ↓ AIで構造化
中心Question／必要なYes／最大のBarrier／proof_needs
  ↓ 規則
Plus：中心Questionを一つ提案
Pro：One SlideまたはStoryを一つ提案
  ↓
One Slide
  → 1枚の料理・レシピ・Variation

Story
  → Primary Route
  → 必要な場合だけSecondary Route（将来）
  → Question Map
  → あると進めやすいデータを参考表示
  ↓
Editor
  左：Story Navigation＋Variation
  中央上：完成プレビュー
  中央下：データ／表／言葉の入力
  右：見せ方・詳細設定
  ↓
Mechanical Check＋Coaching Question
  ↓ 任意
AI Story確認（月30回）
  → Story上の重要な確認
  → ヘッダーテキスト代替案
  ↓
ユーザー自身のMessage、Executive Summary、Decision
  ↓
PPT または PPT＋Data ZIP
```

Biz Slide Coachはコンサルティングサービスの代替ではない。ユーザーが自分のデータと判断を使い、信頼できる説明を組み立てるためのStory Coachである。
