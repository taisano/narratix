# Story Route R0 設計メモ

- 作成日：2026-10-08
- 開始時の `main`：`06456be`
- 状態：**2026-10-08に6点すべてユーザー確認済み。R1・R2へ反映**
- 正本：`docs/story-spec.md` 6・7・11・17・18章
- 実装指示：`docs/codex-story-routes-brief.md`

## 1. この設計で固定すること

- Story Routeは枚数テンプレートではなく、Questionから必要なYesへ進む論理の順序とする。
- Route名をユーザーに選ばせない。画面には自然なQuestionと短い役割名だけを出す。
- Route・役割・順番・優先度・停止条件・`proof_needs`はレジストリを正本にする。
- AIはRoute名を決めない。AIが読み取った`routeSignals`、`outcomeDirection`、`desiredYes`などから、規則が同じ入力に必ず同じRouteを返す。
- 結論、Recommendation、Ask、Action、Commitmentはユーザーが書く。Coachは空の問いと参考の見せ方までを用意し、自動入力しない。
- `desiredYes`を超えて、相談文にない実行・投資・承認まで広げない。
- 役割とスライドは1対1に固定しない。統合・分割、Supporting／Appendixへの移動は既存ルールを使う。
- Secondary Routeの保存構造は維持するが、自動接続はR4以降とする。

## 2. Route定義が持つ情報の案

R1では、次の意味を`src/registry/story.ts`の型付き定義にする。フィールド名は実装時に既存コードへ合わせて確定する。

```ts
interface RouteDef {
  id: StoryRouteId;
  roles: RouteRoleDef[];
  primaryYes: DesiredYesId[];
  /** desiredYesごとに、どの役割までをQuestion Mapへ出すか */
  stopRules: Partial<Record<DesiredYesId, string[]>>;
}

interface RouteRoleDef {
  id: string;
  labelKey: string;
  question: LocalizedText;
  priority: QuestionPriorityId;
  proofNeeds: ProofNeedId[];
  settingOnly?: boolean;
  noForcedSlide?: boolean;
  userAuthored?: boolean;
}
```

`DesiredYesId`を単純な大小関係にしない。例えば`SELECTION`と`FEASIBILITY`は別方向なので、Routeごとの`stopRules`で必要な役割を明示する。

## 3. 8つのRouteの役割表案

優先度はQuestion Mapへ置く重要度であり、独立スライド化の指定ではない。`—`は、その役割自体が新しいデータを必須としないことを表す。

### 3.1 `ANSWER_FIRST` — 結論先出し

用途：結論が固まっており、短時間で判断・承認を得る。

| 役割ID | 画面名 ja / en | Question ja / en | 優先度 | 主な`proof_needs` | 注記 |
|---|---|---|---|---|---|
| `ANSWER_FIRST.DECISION` | 判断 / Decision | 何について判断・承認を得るか / What decision or approval is needed? | `REQUIRED` | — | Story設定、独立スライドを強制しない |
| `ANSWER_FIRST.ANSWER` | 結論 / Answer | 提案する結論は何か / What answer do you propose? | `REQUIRED` | — | ユーザー入力 |
| `ANSWER_FIRST.REASONS` | 根拠 / Reasons | その結論を支える理由は何か / What reasons support the answer? | `REQUIRED` | `OVERALL_CHANGE`, `SIZE_CONTEXT`, `SEGMENT_DIFFERENCE`, `RANKING` | 相談に合う語だけを採用 |
| `ANSWER_FIRST.EVIDENCE` | 裏づけ / Evidence | 理由を裏づける事実は何か / What evidence supports the reasons? | `REQUIRED` | 読み取った`proofNeeds` | 既存の料理・レシピへ接続 |
| `ANSWER_FIRST.RISKS` | リスク / Risks | 判断前に確認すべき反対材料や条件は何か / What risks or conditions must be checked? | `CONDITIONAL` | `TARGET_GAP`, `SECOND_METRIC`, `RELATIONSHIP` | 高額・不可逆判断ではMain |
| `ANSWER_FIRST.ASK` | 依頼 / Ask | 読み手に何を決めてほしいか / What do you want the audience to decide? | `REQUIRED` | — | ユーザー入力、独立スライドを強制しない |

- `SELECTION`で止まる：Decision → Answer → Reasons → Evidence。AskはQuestion Mapに置くが、承認依頼まで相談に無ければ空の次Questionとして扱う。
- `COMMITMENT`まで進む：上記＋Risks（条件該当時）＋Ask。

### 3.2 `AIMED`

既存の`AIMED_ROLES`をそのまま正本へ移し、結果・順番・文言を変えない。

| 役割ID | 画面名 ja / en | Question ja / en | 優先度 | 主な`proof_needs` | 注記 |
|---|---|---|---|---|---|
| `AIMED.ANCHOR` | 目的 / Anchor | 何を明らかにするか / What are we trying to find out? | `REQUIRED` | — | Story設定 |
| `AIMED.IMPACT` | 全体 / Overall | 全体として何が起きているか / What is happening overall? | `REQUIRED` | `OVERALL_CHANGE`, `CURRENT_MIX`, `SIZE_CONTEXT` | 既存どおり |
| `AIMED.MISMATCH` | 差・例外 / Differences | 全体の裏にどんな差・例外があるか / What differences or exceptions sit behind the whole? | `REQUIRED` | `SEGMENT_DIFFERENCE`, `MIX_CHANGE`, `TARGET_GAP`, `SECOND_METRIC` | 既存どおり |
| `AIMED.EXPLANATION` | 説明 / Explanation | 違いをどこまで説明できるか / How far can we explain the differences? | `CONDITIONAL` | `CONTRIBUTION`, `BRIDGE`, `RELATIONSHIP`, `SECOND_METRIC` | 因果を断定しない |
| `AIMED.DECISION` | 判断 / Decision | 次に何を判断・確認するか / What do we decide or check next? | `REQUIRED` | — | 独立スライドを強制しない |

- `RECOGNITION`で止まる：Anchor → Impact → Mismatch → Decision。
- `INTERPRETATION`以上：説明に必要なEvidenceがある時だけExplanationを加える。
- Selection以降の具体的な選択はSecondary Routeの将来範囲。R1〜R3ではDecisionを空の問いとして残す。

### 3.3 `DIAGNOSIS` — 診断

内部IDの`SYMPTOM`は互換のため残し、画面では中立的な「観察結果」と表示する。

| 役割ID | 画面名 ja / en | Question ja / en | 優先度 | 主な`proof_needs` | 注記 |
|---|---|---|---|---|---|
| `DIAGNOSIS.SYMPTOM` | 観察結果 / Outcome | 何が起きているか / What outcome do we observe? | `REQUIRED` | `OVERALL_CHANGE`, `SIZE_CONTEXT`, `CURRENT_MIX` | 既存IDを維持 |
| `DIAGNOSIS.LOCATION` | 起きている場所 / Location | どこ・誰・いつに集中しているか / Where, for whom, or when is it concentrated? | `REQUIRED` | `SEGMENT_DIFFERENCE`, `RANKING`, `MIX_CHANGE` | Outcome＋Locationで止められる |
| `DIAGNOSIS.DRIVER` | 寄与・関連 / Driver | 何が増減へ寄与し、何と関連しているか / What contributes to the change or moves with it? | `CONDITIONAL` | `CONTRIBUTION`, `BRIDGE`, `RELATIONSHIP`, `SECOND_METRIC` | 寄与・関連・原因を区別 |
| `DIAGNOSIS.ROOT_CAUSE` | 原因の検証 / Root cause | 原因と言えるには何を追加で確かめる必要があるか / What else must be tested before calling it a cause? | `CONDITIONAL` | 将来の`CAUSAL_DRIVER` | 現行語彙では自動追加せず、Evidenceなしに原因と断定しない |
| `DIAGNOSIS.ACTIONABILITY` | 動かせる点 / Actionability | どこまで再現・修正・緩和できるか / What can be replicated, corrected, or mitigated? | `CONDITIONAL` | `TARGET_GAP`, `POSITIONING` | 相談が対応可能性を求める場合だけ |
| `DIAGNOSIS.ACTION` | 次の対応 / Action | 次に何を試す・確認するか / What should be tried or checked next? | `CONDITIONAL` | — | ユーザー入力、独立スライドを強制しない |

- `RECOGNITION`で止まる：Outcome → Location。
- `INTERPRETATION`まで：Driver。現行の`CONTRIBUTION`／`RELATIONSHIP`は寄与・関連として扱い、Root Causeへ昇格させない。因果を支えるEvidence語彙を定義した段階でRoot Causeを接続する。
- Actionability／Actionは相談文が対応まで明示した場合だけ。R3ではSecondaryを自動接続しない。

### 3.4 `CHOICE` — 選択

| 役割ID | 画面名 ja / en | Question ja / en | 優先度 | 主な`proof_needs` | 注記 |
|---|---|---|---|---|---|
| `CHOICE.DECISION` | 選ぶこと / Decision | 何を選ぶ必要があるか / What needs to be chosen? | `REQUIRED` | — | Story設定 |
| `CHOICE.CRITERIA` | 判断基準 / Criteria | 何を基準に比べるか / What criteria should be used? | `REQUIRED` | `SECOND_METRIC`, `TARGET_GAP` | 既存ID |
| `CHOICE.OPTIONS` | 選択肢 / Options | 比べる選択肢は何か / What options are being compared? | `REQUIRED` | `RANKING`, `SIZE_CONTEXT`, `POSITIONING` | 既存ID |
| `CHOICE.TRADE_OFFS` | 得失 / Trade-offs | 選択肢ごとの強み・弱みは何か / What are the trade-offs of each option? | `REQUIRED` | `SECOND_METRIC`, `POSITIONING`, `TARGET_GAP` | 既存ID |
| `CHOICE.RECOMMENDATION` | 推奨案 / Recommendation | どの案を選ぶか / Which option do you recommend? | `REQUIRED` | — | ユーザー入力、独立スライドを強制しない |
| `CHOICE.CONDITIONS` | 成立条件 / Conditions | その選択が成立する条件は何か / Under what conditions does the choice hold? | `CONDITIONAL` | `TARGET_GAP`, `SECOND_METRIC` | 不確実性がある場合 |
| `CHOICE.COMMITMENT` | 決定 / Commitment | 何をいつ決めるか / What will be committed, and when? | `CONDITIONAL` | — | ユーザー入力 |

- `SELECTION`で止まる：Decision → Criteria → Options → Trade-offs → Recommendation。
- `COMMITMENT`まで：Conditions（該当時）＋Commitment。
- Coachは優先市場・投資先などを自動決定しない。

### 3.5 `URGENCY` — 緊急性

| 役割ID | 画面名 ja / en | Question ja / en | 優先度 | 主な`proof_needs` | 注記 |
|---|---|---|---|---|---|
| `URGENCY.STATUS_QUO` | 現状 / Status quo | 現状はどう推移しているか / How is the current situation evolving? | `REQUIRED` | `OVERALL_CHANGE`, `SIZE_CONTEXT` |  |
| `URGENCY.INFLECTION` | 変化点 / Inflection | 何が、いつ変わり始めたか / What changed, and when? | `REQUIRED` | `OVERALL_CHANGE`, `GROWTH_SPEED`, `SEGMENT_DIFFERENCE` | 既存ID |
| `URGENCY.EXPOSURE` | 影響範囲 / Exposure | 放置するとどこまで影響するか / What is exposed if nothing changes? | `REQUIRED` | `SIZE_CONTEXT`, `TARGET_GAP` | 推測値を作らない |
| `URGENCY.COST_OF_DELAY` | 遅れる影響 / Cost of delay | 遅れるほど何が失われるか / What is lost as action is delayed? | `CONDITIONAL` | `SIZE_CONTEXT`, `TARGET_GAP`, `BRIDGE` | データが無ければCoaching Question |
| `URGENCY.WINDOW` | 動ける期間 / Window | いつまでに動く必要があるか / By when does action need to happen? | `CONDITIONAL` | `OVERALL_CHANGE`, `TARGET_GAP` | 期限を推測しない |
| `URGENCY.NO_REGRET_MOVE` | まず行うこと / No-regret move | 不確実でも始められる対応は何か / What can be started despite uncertainty? | `CONDITIONAL` | — | ユーザー入力 |

- `RECOGNITION`で止まる：Status Quo → Inflection → Exposure。
- `COMMITMENT`まで：Cost of Delay／Window（Evidenceがある時）＋No-regret Move。

### 3.6 `BUSINESS_CASE` — 投資判断

| 役割ID | 画面名 ja / en | Question ja / en | 優先度 | 主な`proof_needs` | 注記 |
|---|---|---|---|---|---|
| `BUSINESS_CASE.OPPORTUNITY` | 機会・課題 / Opportunity | どんな機会・課題へ投資するか / What opportunity or problem is being addressed? | `REQUIRED` | `SIZE_CONTEXT`, `TARGET_GAP` |  |
| `BUSINESS_CASE.VALUE_POOL` | 価値の規模 / Value pool | 獲得可能な価値はどの程度か / How much value may be addressable? | `REQUIRED` | `SIZE_CONTEXT`, `GROWTH_SPEED`, `SECOND_METRIC` | 市場規模と自社価値を区別。既存ID |
| `BUSINESS_CASE.ECONOMICS` | 採算 / Economics | 費用・便益・回収はどう見込むか / What are the costs, benefits, and payback? | `REQUIRED` | 将来の`ECONOMICS`、現状は`BRIDGE`, `SECOND_METRIC` | 新語彙候補 |
| `BUSINESS_CASE.ASSUMPTIONS` | 前提 / Assumptions | 判断を左右する前提は何か / Which assumptions drive the case? | `REQUIRED` | `SECOND_METRIC`, `TARGET_GAP` |  |
| `BUSINESS_CASE.SCENARIOS` | シナリオ / Scenarios | 前提が変わると結果はどう動くか / How do outcomes change under different assumptions? | `CONDITIONAL` | 将来の`SCENARIO_RANGE` | 新語彙候補 |
| `BUSINESS_CASE.RISKS` | リスク / Risks | 下振れ要因と影響は何か / What could go wrong, and with what impact? | `CONDITIONAL` | 将来の`RISK_EXPOSURE` | 新語彙候補 |
| `BUSINESS_CASE.STAGE_GATES` | 段階判断 / Stage gates | どの条件で次段階へ進むか / What conditions allow the next stage? | `CONDITIONAL` | `TARGET_GAP` | 専用Template候補 |
| `BUSINESS_CASE.ASK` | 投資依頼 / Ask | 何を承認してほしいか / What approval is requested? | `REQUIRED` | — | ユーザー入力、独立スライドを強制しない |

- `FEASIBILITY`で止まる：Opportunity → Value Pool → Economics → Assumptions。必要に応じてScenarios／Risks。
- `COMMITMENT`まで：上記＋Stage Gates（該当時）＋Ask。
- **R3実装済み。** V1は既存の`proof_needs`だけを接続し、採算・シナリオ・リスクの数値をCoachが補わない。根拠が無い役割は空のQuestionとして残し、ユーザーがデータと判断を加える。将来の`ECONOMICS`／`SCENARIO_RANGE`／`RISK_EXPOSURE`と専用Templateは、実データと利用場面を確認してから別途追加する。

### 3.7 `PROOF` — 検証

| 役割ID | 画面名 ja / en | Question ja / en | 優先度 | 主な`proof_needs` | 注記 |
|---|---|---|---|---|---|
| `PROOF.CLAIM` | 主張 / Claim | 何を確かめたいか / What claim needs testing? | `REQUIRED` | — | ユーザー入力を保持 |
| `PROOF.TEST` | 検証方法 / Test | 何が確認できれば主張を支持できるか / What test would support the claim? | `REQUIRED` | `RELATIONSHIP`, `SECOND_METRIC`, `TARGET_GAP` |  |
| `PROOF.EVIDENCE` | 支持材料 / Evidence | 主張を支持する事実は何か / What evidence supports the claim? | `REQUIRED` | `RELATIONSHIP`, `SECOND_METRIC`, `TARGET_GAP` | 既存ID |
| `PROOF.COUNTER_EVIDENCE` | 反対材料 / Counter-evidence | 主張に反する事実は何か / What evidence weighs against the claim? | `CONDITIONAL` | `SECOND_METRIC`, `SEGMENT_DIFFERENCE`, `TARGET_GAP` | 高リスク主張ではMain |
| `PROOF.BOUNDARY` | 成立範囲 / Boundary | どこまでなら主張が成り立つか / Where does the claim hold, and where does it not? | `REQUIRED` | `SEGMENT_DIFFERENCE`, `POSITIONING` |  |
| `PROOF.EXPERIMENT` | 次の検証 / Experiment | 次に何を試せば不確実性を減らせるか / What experiment would reduce uncertainty next? | `CONDITIONAL` | — | 因果を自動確定しない |
| `PROOF.SCALE_DECISION` | 展開判断 / Scale decision | 何を満たせば展開するか / What must be true before scaling? | `CONDITIONAL` | `TARGET_GAP` | ユーザー入力 |

- `INTERPRETATION`で止まる：Claim → Test → Evidence → Boundary。高リスクならCounter-evidenceもMain。
- `FEASIBILITY`まで：Experiment＋Scale Decision（相談が実験・展開判断を求める場合）。

### 3.8 `TRANSFORMATION` — 変革計画

| 役割ID | 画面名 ja / en | Question ja / en | 優先度 | 主な`proof_needs` | 注記 |
|---|---|---|---|---|---|
| `TRANSFORMATION.AMBITION` | 目指す姿 / Ambition | 何をどこまで変えるか / What should change, and by how much? | `REQUIRED` | `TARGET_GAP` | ユーザーの目的を保持 |
| `TRANSFORMATION.BASELINE` | 現状 / Baseline | 現在地はどこか / What is the current baseline? | `REQUIRED` | `OVERALL_CHANGE`, `SIZE_CONTEXT` |  |
| `TRANSFORMATION.GAP` | 隔たり / Gap | 目指す姿まで何が足りないか / What gap separates the baseline from the ambition? | `REQUIRED` | `TARGET_GAP`, `BRIDGE` | 既存ID |
| `TRANSFORMATION.INITIATIVES` | 施策 / Initiatives | どの施策でGapを埋めるか / Which initiatives could close the gap? | `REQUIRED` | `CONTRIBUTION`, `POSITIONING` | ユーザーが選ぶ |
| `TRANSFORMATION.SEQUENCE` | 順序 / Sequence | 何をどの順で進めるか / In what sequence should the work proceed? | `REQUIRED` | 将来の`IMPLEMENTATION_GAP` | Roadmap候補 |
| `TRANSFORMATION.OWNERSHIP` | 担当 / Ownership | 誰が何に責任を持つか / Who owns each part? | `CONDITIONAL` | — | ユーザー入力 |
| `TRANSFORMATION.MILESTONES` | 節目 / Milestones | どの節目で進捗を確かめるか / At which milestones will progress be checked? | `CONDITIONAL` | `TARGET_GAP` | 専用Template候補 |
| `TRANSFORMATION.GOVERNANCE` | 推進方法 / Governance | どのように判断・修正を続けるか / How will decisions and course corrections be governed? | `CONDITIONAL` | — | ユーザー入力 |

- `FEASIBILITY`で止まる：Ambition → Baseline → Gap → Initiatives → Sequence。
- `COMMITMENT`まで：Ownership → Milestones → Governance。
- **R3実装済み。** V1は現状とGapだけを既存Evidenceへ接続する。目指す姿、施策、順序、担当、節目、推進方法はユーザーが決める空のQuestionとして置き、Coachは実行計画を代筆しない。将来の`IMPLEMENTATION_GAP`とRoadmap／節目Templateは、実際の計画データの形を確認してから別途追加する。

## 4. Route選定規則の案

### 4.1 基本

- 規則への入力は`StoryReading`だけとし、相談文をR2で再解析しない。
- 候補Routeごとに一致した`routeSignals`を記録するが、隠れた点数や乱数は使わない。
- `MVP_ROUTES`に無い候補は選定理由へ残し、実際のQuestion MapはAIMEDで作る。
- 手がかりが弱い、矛盾する、`DATA_DISCOVERY`／`MISMATCH`だけの場合はAIMEDへ倒す。

### 4.2 優先順位案

複数の手がかりがある時は、「ユーザーがすでに到達している地点」を優先し、不要な分析を前に足さない。

1. `ANSWER_READY` → `ANSWER_FIRST`
2. `INVESTMENT` → `BUSINESS_CASE`
3. `EXECUTION` → `TRANSFORMATION`
4. `VALIDATION` → `PROOF`
5. `URGENCY` → `URGENCY`
6. `PRIORITIZATION` → `CHOICE`
7. `ROOT_CAUSE` → `DIAGNOSIS`
8. `EXPLANATION`かつ`outcomeDirection !== 'UNKNOWN'` → `DIAGNOSIS`
9. それ以外 → `AIMED`

補助条件：

- `EXPLANATION`だけで結果の向きが不明ならAIMED。相談が「原因を特定」と明示した`ROOT_CAUSE`は方向不明でもDiagnosis候補にする。
- `PRIORITIZATION`と`ROOT_CAUSE`が両方ある場合、何を選ぶかが明示されていればChoice、原因把握が先ならDiagnosis。R2では`desiredYes === 'SELECTION'`ならChoice、それ以外はDiagnosisとする案。
- `INVESTMENT`と`PRIORITIZATION`が重なればBusiness Case。ただし単なる候補比較で予算・承認が無ければChoice。
- `EXECUTION`と`URGENCY`が重なれば、実行計画の作成が目的ならTransformation、今動く必要の説明が目的ならUrgency。`desiredYes === 'COMMITMENT'`かつ`EXECUTION`があればTransformationを優先する案。
- 上記で決められない競合はAIMEDへ倒し、`reasons`に競合を残す。

### 4.3 `decideRoute`の返り値案

```ts
type RouteReason =
  | { code: 'matched_signal'; signal: RouteSignalId }
  | { code: 'matched_outcome'; outcome: OutcomeDirectionId }
  | { code: 'matched_yes'; desiredYes: DesiredYesId }
  | { code: 'route_not_enabled'; candidate: StoryRouteId }
  | { code: 'ambiguous_fallback'; candidates: StoryRouteId[] }
  | { code: 'default_aimed' };
```

画面では内部Route名やこの理由コードをそのまま見せない。必要なら「原因を確かめたいご相談なので、結果→違い→要因の順で整理します」のように、翻訳ファイルの説明文へ変換する。

## 5. R1〜R3の実装順

1. **R1（完了）**：AIMEDをRoute表へ移す。`AIMED_ROLES`は別名として残し、Question Map・画面・保存結果を変えない。
2. **R2（完了）**：決定的な`decideRoute`と理由を追加する。追加RouteはR3で1型ずつ`MVP_ROUTES`へ有効化する。
3. **R3-1（完了）**：Diagnosis。Outcome＋Locationで認識、Driverで解釈までとし、結果方向をStoryに保存して寄与の問いへ反映する。Root Causeは現行語彙では自動追加しない。
4. **R3-2（完了）**：Choice。判断基準→選択肢→得失→ユーザーが書く推奨案を基本線とし、実行可能性では成立条件、Commitmentでは最終決定までを加える。
5. **R3-3（完了）**：Answer First。ユーザーが書く結論→根拠→裏づけ→ユーザーが書く依頼を基本線とし、Commitmentではリスク・条件を依頼の前に加える。
6. **Urgency（完了）**：現状→変化点→影響範囲をRecognitionの基本線とし、Commitmentでは遅れる影響・動ける期間・最初の対応までを加える。期限や放置影響の値は推測しない。
7. **Proof（完了）**：主張→検証方法→支持材料→成立範囲を基本線とし、Feasibilityでは反対材料・次の検証・展開条件までを加える。関連を因果として自動確定しない。
8. Business Case、Transformationは、必要な語彙・Templateを別途決めてから実装する。

## 6. ユーザー確認が必要な6点

2026-10-08、以下の推奨案をすべて採用することでユーザー確認済み。

1. 最初に追加するRouteを **Diagnosis → Choice → Answer First** としてよいか。
2. 4.2のRoute選定優先順位、とくに競合時の補助条件でよいか。
3. 画面にはRoute名を出さず、3章の短い役割名だけを出す方針と文言でよいか。
4. 3章の停止条件でよいか。特にDiagnosisを`RECOGNITION`ならOutcome＋Location、`INTERPRETATION`ならDriverまでとするか。
5. 8 Routeすべてを既存Storyと同じPro対象にし、Route別の課金差を作らない方針でよいか。
6. 「Coachにまかせる」で相談文に「1枚で」とあるのに内容上Storyが必要な場合も、現在の明示指定を優先して1枚にし、説明を追加しない方針を維持するか。それとも、Storyを提案して理由を1行出すか。

## 7. R0では変更しないもの

- アプリコード、AIプロンプト、保存形式、`MVP_ROUTES`。
- Data Packのコードと`DATA_PACK_ENABLED = false`。
- Secondary Routeの自動接続。
- 新しい`proof_needs`や専用Template。
