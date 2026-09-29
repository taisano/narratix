# Biz Slide Coach `proof_needs` 共通語彙仕様

版：2026-09-29 v1.0  
対象：Story Route／一品料理（Dish）／Visual Recipe間の共通分類  
関連資料：

- `Biz_Slide_Coach_Story_Proposal_Spec_Latest.md`
- 「一品料理の表（材料 × 料理 × 見せ方）たたき台」

---

## 1. 決定事項

Story側と一品料理側で、`proof_need`の語彙を統一する。

ただし、一つのQuestionや料理が複数の証明要求を持つ場合に対応するため、データ上は単数の`proof_need`ではなく、配列の`proof_needs`を使用する。

```json
{
  "proof_needs": [
    "SIZE_CONTEXT",
    "CURRENT_MIX"
  ]
}
```

---

## 2. `proof_needs`の定義

`proof_needs`は、Questionに答えるために、データから何を確認・提示する必要があるかを表す共通語彙である。

`proof_needs`は次のいずれでもない。

- Story全体の流れそのもの
- チャート名
- レイアウト名
- ユーザーが書くMessageや結論
- AIが生成する仮説

例：

```text
Question
「どの市場が成長を牽引したか」

proof_needs
CONTRIBUTION

対応する見せ方
差分バー／増減表／ウォーターフォール
```

---

## 3. 共通語彙

### 3.1 初期実装で使用する語彙

| ID | 意味 | 代表的なQuestion | 主な表示候補 |
|---|---|---|---|
| `OVERALL_CHANGE` | 全体が時間とともにどう変化したか | 全体はどう変わってきたか | 折れ線、縦棒 |
| `GROWTH_SPEED` | どの程度の速さで増減したか | どれくらいの速さで伸びたか | CAGR表、伸び率横棒、変化率注記 |
| `CONTRIBUTION` | 各項目が全体の増減にどれだけ算術的に寄与したか | どの項目が増加を牽引したか | 差分バー、増減表、ウォーターフォール |
| `CURRENT_MIX` | 現時点の構成比 | 現在は何で構成されているか | 100%積み上げ、Mekko、構成表 |
| `MIX_CHANGE` | 構成比が期間間でどう変化したか | 内訳の比率はどう動いたか | 100%積み上げ、構成比差分、スロープ |
| `SIZE_CONTEXT` | 全体または項目の絶対的な規模 | 市場・売上の大きさはどの程度か | 絶対値棒、積み上げ棒、KPI |
| `SEGMENT_DIFFERENCE` | 市場・地域・商品などの間にどのような差があるか | どのセグメントが異なるか | 横棒、Slope、Small Multiples |
| `RANKING` | 項目間の順位 | どこが最も大きいか | 降順横棒、ランキング表 |
| `TARGET_GAP` | 目標・平均・基準からの乖離 | 目標からどれだけ離れているか | 基準線付き棒、Bullet、差分バー |
| `SECOND_METRIC` | 別の指標で見た場合に結果が一致するか | 人数と消費額では見え方が違うか | 2指標比較、散布図、対比表 |
| `ITEM_SHARE` | 特定項目が全体に占める比率 | 特定ブランドの比率はどの程度か | 強調した100%積み上げ、KPI |
| `BRIDGE` | 始点から終点への増減内訳 | AからBへ何が変化を生んだか | ウォーターフォール |
| `RELATIONSHIP` | 二つの指標の関連性 | 二つの指標は連動しているか | 散布図、バブル |
| `POSITIONING` | 複数指標上での相対的な位置 | どの領域に位置づけられるか | Matrix、散布図、バブル |

### 3.2 将来追加を検討する語彙

| ID | 意味 |
|---|---|
| `CAUSAL_DRIVER` | 原因として説明できる要因 |
| `SCENARIO_RANGE` | 下振れ・基準・上振れなどの予測幅 |
| `ECONOMICS` | 売上、費用、利益、回収期間などの事業性 |
| `RISK_EXPOSURE` | リスクが顕在化した場合の影響範囲 |
| `IMPLEMENTATION_GAP` | 目標状態と実行能力・進捗の差 |

これらは、対応するQuestion、データ要件、Visual Recipeが定義できた段階で追加する。

---

## 4. `DRIVER`を`CONTRIBUTION`へ変更する理由

一品料理の「成長の牽引役」は、開始時点から終了時点までの増加額によって、どの項目が全体の増加に大きく寄与したかを示す。

これは算術的な寄与であり、成長の原因を証明するものではない。

したがって、初期実装では次のように区別する。

| ID | 意味 | 自動計算 |
|---|---|---|
| `CONTRIBUTION` | 各項目の増加額・減少額による寄与 | 元データから計算可能 |
| `CAUSAL_DRIVER` | 増減を生じさせた原因 | 単純な差分計算では判定しない |

使用例：

```text
事実
Enterpriseの増加額が最も大きい。

言えること
Enterpriseは全体の増加額に最も大きく寄与した。

自動的には言わないこと
Enterpriseが市場成長の原因である。
```

---

## 5. 複合語は原子的な語彙へ分解する

`SIZE_AND_MIX`のように複数の証明要求を一つにまとめたIDは、原則として作らない。

変更前：

```json
{
  "proof_need": "SIZE_AND_MIX"
}
```

変更後：

```json
{
  "proof_needs": [
    "SIZE_CONTEXT",
    "CURRENT_MIX"
  ]
}
```

これにより、Story Route、料理、Visual Recipeのそれぞれで、必要な証明要求を組み合わせて再利用できる。

---

## 6. 三つのレイヤーでの使い方

### 6.1 Story Route

Story Routeの各役割は、そのQuestionで必要になる`proof_needs`を指定する。

```json
{
  "route": "AIMED",
  "role": "EXPLANATION",
  "question": "どの市場が全体の増加に寄与したか",
  "proof_needs": ["CONTRIBUTION"]
}
```

### 6.2 一品料理（Dish）

料理は、どの`proof_needs`に対応できるかを宣言する。

```json
{
  "dish_id": "growth_driver",
  "question_template": "どの項目が伸びを引っ張ったか",
  "supports_proof_needs": ["CONTRIBUTION"]
}
```

### 6.3 Visual Recipe

Visual Recipeは、`proof_needs`を満たすために必要なデータ、変換、見せ方を定義する。

```json
{
  "recipe_id": "TREND_LINE_DELTA",
  "proof_needs": ["OVERALL_CHANGE", "CONTRIBUTION"],
  "required_data": ["period", "category", "value"],
  "derived_metrics": ["absolute_change"],
  "primary_visual": "LINE",
  "supporting_visual_options": [
    "DELTA_BAR",
    "DELTA_TABLE"
  ]
}
```

---

## 7. Story Routeとの対応例

| Story Route | Route上の役割 | `proof_needs`の例 |
|---|---|---|
| Answer First | Evidence | `SIZE_CONTEXT`、`SEGMENT_DIFFERENCE` |
| AIMED | Impact | `OVERALL_CHANGE`、`SIZE_CONTEXT` |
| AIMED | Mismatch | `SEGMENT_DIFFERENCE`、`SECOND_METRIC`、`MIX_CHANGE` |
| AIMED | Explanation | `CONTRIBUTION`、`BRIDGE` |
| Diagnosis | Symptom | `OVERALL_CHANGE`、`TARGET_GAP` |
| Diagnosis | Location | `SEGMENT_DIFFERENCE`、`ITEM_SHARE` |
| Diagnosis | Driver | `CONTRIBUTION`、`BRIDGE` |
| Choice | Criteria／Trade-offs | `SECOND_METRIC`、`POSITIONING` |
| Urgency | Inflection | `OVERALL_CHANGE`、`GROWTH_SPEED` |
| Business Case | Value Pool | `SIZE_CONTEXT`、`GROWTH_SPEED` |
| Proof | Evidence | `RELATIONSHIP`、`SEGMENT_DIFFERENCE` |
| Transformation | Gap | `TARGET_GAP` |

Routeと`proof_needs`は固定の一対一対応ではない。相談内容とQuestionに応じて、同じRoute役割でも複数の`proof_needs`を持てる。

---

## 8. 一品料理の既存案からの変更

| 料理 | 変更前 | 変更後 |
|---|---|---|
| 成長の牽引役 `growth_driver` | `DRIVER` | `CONTRIBUTION` |
| 増加要因 `increase` | `DRIVER` | `CONTRIBUTION` |
| 減少要因 `decrease` | `DRIVER` | `CONTRIBUTION` |
| 全体規模と構成 `size_and_mix` | `SIZE_AND_MIX` | `SIZE_CONTEXT`＋`CURRENT_MIX` |
| 相関 `correlation` | `RELATION` | `RELATIONSHIP` |
| 重点領域 `focus_area` | `POSITION` | `POSITIONING` |
| 規模を含めた位置づけ `size_position` | `POSITION` | `POSITIONING`＋`SIZE_CONTEXT` |
| 象限別の分類 `quadrant` | `POSITION` | `POSITIONING` |

その他の語彙は、初期案を維持する。

---

## 9. 命名・データ設計ルール

1. IDは大文字の`UPPER_SNAKE_CASE`を使用する。
2. 一つのIDには一つの証明要求だけを持たせる。
3. 複数の証明要求は`proof_needs`配列で表す。
4. チャート名やレイアウト名を`proof_needs`に入れない。
5. Question、Message、Story Routeの役割を`proof_needs`に入れない。
6. 算術的寄与と因果要因を分ける。
7. 相関・関連性を因果として扱わない。
8. 新しいIDを追加する場合は、代表Question、必要データ、対応する料理、Visual Recipeを同時に定義する。
9. 同義語を追加せず、既存IDへのマッピングを優先する。
10. UIには内部IDを表示せず、「全体の変化」「成長への寄与」など平易な日本語を表示する。

---

## 10. 推薦処理の例

```text
相談
「市場全体が伸びた中で、どの商品が成長を牽引したか見せたい」

Story分類
Route：AIMED
Role：Explanation
proof_needs：OVERALL_CHANGE、CONTRIBUTION

料理候補
growth_driver

材料
折れ線、積み上げ縦棒、100%積み上げなど

Visual Recipe
主役：推移チャート
付け合わせ：項目別増加額
形の初期値：差分バー
切替候補：増減表
```

付け合わせの形は、`proof_needs`を変えずに切り替える。

```text
CONTRIBUTION
├─ 差分バー：大小・順位を見せる
├─ 増減表：正確な数値や項目数の多さに対応する
└─ ウォーターフォール：各増減が全体変化に足し上がる
```

---

## 11. Claude Codeへの実装指示

> Story側と一品料理側で`proof_need`の語彙を統一してください。ただし、一つのQuestionや料理が複数の証明要求を持てるよう、データ上は`proof_needs`の配列にします。複合語の`SIZE_AND_MIX`は`SIZE_CONTEXT`と`CURRENT_MIX`へ分解します。また、増加額で示す「成長の牽引役」は因果を意味する`DRIVER`ではなく、算術的な寄与を表す`CONTRIBUTION`としてください。因果要因は、必要になった時点で`CAUSAL_DRIVER`として別に扱います。`RELATION`は`RELATIONSHIP`、`POSITION`は`POSITIONING`に統一してください。UIには内部IDを直接表示せず、既存の平易な日本語ラベルを使用してください。

---

## 12. 受入条件

- Story Routeと一品料理が同じ`proof_needs` enumを参照している。
- `proof_needs`は配列として複数指定できる。
- `CONTRIBUTION`から差分バー、増減表、ウォーターフォールを選択できる。
- 付け合わせの形を変えても`proof_needs`と元データが変わらない。
- `CONTRIBUTION`を因果関係として表示しない。
- `RELATIONSHIP`を因果関係として表示しない。
- 複合的な要求は複数の原子的なIDで表現される。
- UI上の文言はユーザー向けの日本語で、内部IDは表示されない。
