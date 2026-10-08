# Codex への指示書：複数枚 Story の「型」（Story Route）を増やす

作成：2026-10-08（Claude）／開始時の main：`e9aba1c`（未 push のコミットを含む）
読む順：この指示書 → `AGENTS.md` → `CLAUDE.md` → `docs/handoff-log.md` の一番上 → 下の「1. 構想の置き場所」

> ユーザーが「型」と呼んでいるものは、コード・仕様では **Story Route**（`StoryRouteId`）のこと。
> 今の複数枚 Story は **AIMED** という1つの型だけで組んでいる。これを、相談の中身に合わせて他の型でも組めるようにする。

## 0. この作業のゴール

- 相談文から「どんな順序で問いを重ねるか」（型）を、規則で決められるようにする。
- 型ごとに、問いの役割・順序・止まる場所（必要な Yes）・優先度を持つ。
- まず **1つ目の型を後ろに増やしても壊れない形に整理**（R1）し、その上で型を1つずつ足す（R3）。
- ユーザーには「型の名前」を選ばせない。自然な問いの流れとして見せる（`story-spec.md` 6章冒頭）。

## 1. 構想の置き場所（まず読む）

| 読むもの | 何が書いてあるか |
|---|---|
| `docs/story-spec.md` **6章（8つの Story Route）** | 8つの型それぞれの用途・主な Yes・問いの順序・優先度・使う `proof_needs`・注意（6.2〜6.10）。**構想の正本** |
| 同 6.1 | Primary／Secondary Route の考え方。MVP は Primary の AIMED だけ。Secondary は「構造だけ持つ・自動提案しない」 |
| 同 7章 | AIMED の作り方（Route の役割 → Question → proof_needs → 料理 → レシピ → 統合・分割 → Slide）。**他の型もこの流れに合わせる** |
| 同 11章 | Coach が行うこと・行わないこと（因果を断定しない、結論を自動入力しない 等） |
| 同 17章・18章 | 実装優先順位・受入条件（「Future：残り7 Route」と書かれている部分が今回の対象） |
| `docs/proof-needs-vocabulary.md` | `proof_needs` の共通語彙（型・料理・レシピで共通） |
| `docs/decisions.md` の「Story」の節（`Route`／`AIMED` で検索） | 語彙をレジストリに置く、AI の出力に `story` を足す、など決定済みの判断 |
| `src/registry/story.ts` | `STORY_ROUTE_IDS`（8つ）、`MVP_ROUTES = ['AIMED']`、`AIMED_ROLES`、`ROUTE_SIGNAL_IDS`、`StoryReading` |
| `src/features/start/dishes.ts` | 料理の表。各料理の `roles` に、**他の型の役割 ID がすでにタグ付けされている**（下の 2.2） |

8つの型：`ANSWER_FIRST`（結論先出し）、`AIMED`、`DIAGNOSIS`（診断）、`CHOICE`（選択）、`URGENCY`（緊急性）、`BUSINESS_CASE`（投資判断）、`PROOF`（検証）、`TRANSFORMATION`（変革計画）。

## 2. 今のコードの事実（2026-10-08 時点で確認済み）

### 2.1 AIMED しか動いていない／AIMED が直書きされている場所

- `src/registry/story.ts`：`AIMED_ROLES`（ANCHOR／IMPACT／MISMATCH／EXPLANATION／DECISION）だけ定義。他の型の役割表は無い。
- `src/features/story/questionMap.ts`：`Role` 型・`ROLE_OF`（proof_needs → AIMED の役割）・`assignRoles`・`aimedQuestionMap`・`EXPLAIN_YES`（説明まで進む Yes）。**Question Map の生成が AIMED 専用**。
- `src/features/story/storyOps.ts`：`priorityOf`（`AIMED_ROLES` を参照）、役割の並び順の配列（`'AIMED.IMPACT', …`）。
- `src/features/story/QuestionMapView.tsx`：役割 ID → 表示文言（`story.role.impact` など）の対応と、`AIMED.DECISION` の特別扱い。
- `src/features/story/outline.ts`：見せ方の名前 → AIMED の役割の対応。
- `src/registry/storyTemplates.ts`：`roles: ['AIMED.IMPACT', …]`（「参考」「メッセージを入れる」で使う役割）。
- `src/features/story/model.ts`：`primaryRoute: 'AIMED'` が既定値、`secondaryRoute` は保存形式だけ（`normalizeStory` は知らない値を既定に戻す）。
- `src/features/story/scope.ts`：1枚か Story かの判定（型の判定ではない）。

### 2.2 すでにあるもの（再利用する）

- AI の読み取り（`StoryReading`）に `desiredYes`・`routeSignals`・`outcomeDirection`・`proofNeeds`・`scopeCandidate` がある。**`routeSignals` と `outcomeDirection` は今、`scope.ts` が「深い相談か」を見る以外では使われていない**（型の選択には未使用）。AI のプロンプト・スキーマにも既にある（`src/lib/ai/consult.ts`）。
- `dishes.ts` の `roles` に、他の型の役割 ID が既に付いている：`DIAGNOSIS.SYMPTOM／LOCATION／DRIVER`、`CHOICE.CRITERIA／OPTIONS／TRADE_OFFS`、`URGENCY.INFLECTION`、`BUSINESS_CASE.VALUE_POOL`、`PROOF.EVIDENCE`、`TRANSFORMATION.GAP`。**この ID を、新しい型の役割表の ID の基準にする**（勝手に別名を作らない）。
- `story-spec.md` 6.4 に「既存 `DIAGNOSIS.SYMPTOM` は、Storyでは中立的に『Outcome／観察された結果』と表示する」とある。

### 2.3 今回のブランチ前の状態（引き継ぎ）

- `main` は `e9aba1c`。未 push：`ce05b04 8bc8974 3c008d6 e602b67 be4f715 9a9a0f0 8569dbe d0a03f5 e9aba1c`。**push はユーザーが行う**。
- データパック（Data Coach）は `DATA_PACK_ENABLED = false`（`src/features/story/dataPackFlag.ts`）で非公開。**コードは残す・触らない・公開しない**。AI の `data_pack` もこのフラグで止めてある。
- ステージング未確認：①各問いの「今回のStoryでは」が戻っているか（データパックの AI 依頼を外した効果）、②「1枚で」と書かれた相談で複数枚を選んだ時の説明文（`scope.oneByContent`／`scope.storyByContent`）。**型を足す作業が①の確認結果を前提にしないよう、AI のプロンプトを変える時は必ず `CONSULT_PROMPT_VERSION`（`src/lib/ai/consult-client.ts`）を上げる**。

## 3. 進め方（段階）

各段階を別のコミットにし、段階ごとに `docs/handoff-log.md` に記録する。途中で設計判断が要るものは、止めて「ユーザーに聞くこと」（4章）に書く。

### R0：設計メモ（コードを変えない）

- `docs/decisions.md` に、型を足す方針（次の R1〜R3）を書く。`story-spec.md` と食い違う点（もしあれば）を理由つきで書く。
- 型ごとの**役割表の案**（役割 ID・問い（ja/en）・優先度・主な `proof_needs`・止まる Yes）を、`story-spec.md` 6章の順序から起こして文書にする。**ユーザーが確認するまで実装しない**（4章の質問に答えをもらう）。

### R1：AIMED を「型の表」に一般化する（見た目・挙動は変えない）

- `src/registry/story.ts` に型の定義（例：`ROUTES: Record<StoryRouteId, RouteDef>`）。`RouteDef` は `roles: RouteRoleDef[]`（今の `AIMED_ROLES` と同じ形）、止まる条件、役割の並び順を持つ。`AIMED_ROLES` は `ROUTES.AIMED.roles` の別名として**残す**（既存の参照を壊さない）。
- `questionMap.ts` の `ROLE_OF`／`assignRoles`／`aimedQuestionMap` を、型を引数に取る形に一般化する。AIMED の結果は**1文字も変えない**（既存テスト `questionMap`／`storyOps`／`QuestionMapView`／`outline`／`storyProject` が全部そのまま通ること）。
- 役割 ID → 表示文言は、翻訳ファイルのキー（`story.role.*`）に型ごとに足す。表示文言を TS に直書きしない。
- `MVP_ROUTES`（今 `['AIMED']`）が、**どの型を実際に提案してよいか**を決める唯一のスイッチになるようにする（まだ AIMED だけのまま）。

### R2：型を決める規則（AI には型名を選ばせない）

- 入力は `StoryReading`（`desiredYes`・`routeSignals`・`outcomeDirection`・`proofNeeds`・`primaryBarrier`）。**同じ読み取りなら必ず同じ型**（`scope.ts` の方針 18.1 と同じ。乱数・日時に依存しない）。
- 新しいファイル（例：`src/features/story/route.ts`）に `decideRoute(reading): { route: StoryRouteId; reasons: RouteReason[] }`。`reasons` の持ち方・テストの書き方は `scope.ts`／`scope.test.ts` に合わせる。
- 目安（要ユーザー確認。4章）：`ROOT_CAUSE`／`EXPLANATION` かつ結果の向きが POSITIVE・NEGATIVE・MIXED → DIAGNOSIS、`PRIORITIZATION` → CHOICE、`ANSWER_READY` → ANSWER_FIRST、`URGENCY` → URGENCY、`INVESTMENT` → BUSINESS_CASE、`VALIDATION` → PROOF、`EXECUTION` → TRANSFORMATION、`DATA_DISCOVERY`／`MISMATCH` だけ、または決められない → AIMED（今の挙動）。
- 迷う時は AIMED に倒す（今の挙動を守る）。`MVP_ROUTES` に入っていない型は、決まっても AIMED で組み、理由を `reasons` に残す。
- AI のスキーマは変えなくてよい（`routeSignals` は既にある）。変える場合は R0 で理由を書き、プロンプトの版を上げる。

### R3：型を1つずつ実装（1型＝1つ以上のコミット、毎回 `MVP_ROUTES` に足す）

おすすめの順番：

1. **DIAGNOSIS**（`outcomeDirection` と `ROOT_CAUSE` の手がかりが既にあり、`dishes.ts` に `SYMPTOM／LOCATION／DRIVER` のタグが揃っている）。6.4 の「Driver の3段階（増減への寄与／関連する要素／原因）」を Coach が混同しないこと。
2. **CHOICE**（`CRITERIA／OPTIONS／TRADE_OFFS` のタグがある。Recommendation はユーザー入力、Coach は優先市場を決めない）。
3. **ANSWER_FIRST**（Answer と Ask はユーザー入力。Decision Question は独立スライドを強制しない）。
4. URGENCY → PROOF → BUSINESS_CASE → TRANSFORMATION は、**新しい語彙・Template（Scenario／Risk／Stage Gate／Roadmap 等）が要る**ので、R3 の最初では手を付けない。必要な語彙を `docs/decisions.md` に書いてユーザーに確認する。

各型で必ず確かめること：

- 役割ごとの問い（ja/en）、優先度（REQUIRED／CONDITIONAL…）、`proof_needs` への接続、止まる Yes（`desired_yes` を超えて広げない。相談文にない実行・投資・承認まで足さない）。
- 「全ステップを強制しない」（6.10）：例えば「関西だけ伸びたと報告したい」は Outcome＋Location で止める。
- 3〜8枚が理想、10枚で統合・Appendix・分割を提案（`STORY_SIZE`）。
- Decision／Ask／Recommendation／Commitment などの**結論の役割は独立スライドを強制せず**、ユーザーが書く（Coach は結論を自動入力しない）。
- 画面（左の Story の地図、`QuestionMapView`、`StoryNav`）が、役割表から出る（AIMED の直書きを残さない）。
- 既存の Story（`primaryRoute: 'AIMED'` で保存済み）が**そのまま開ける・並びが変わらない**こと。

### R4（今回はやらない）

Secondary Route の自動接続（`DIAGNOSIS → CHOICE` など）、型ごとの専用 Template。構造（`secondaryRoute`）はもうあるので壊さないこと。

## 4. ユーザーに聞くこと（R0 で止めて確認する）

1. 最初に足す型はどれか（おすすめ：DIAGNOSIS → CHOICE → ANSWER_FIRST）。
2. 型の選び方（R2 の目安の表）でよいか。複数の手がかりが重なった時の優先順位。
3. 型の名前や「Outcome／Location／Driver」などの用語を、画面にどこまで出すか（今の AIMED は「全体／差・例外／説明／判断」の4語）。型ごとの役割の呼び名（ja/en）の案。
4. 型ごとの「止まる Yes」（例：DIAGNOSIS は RECOGNITION／INTERPRETATION で止まる）の最終確認。
5. 無料・Pro の線引き（今は `canUseStory` と同じ。型ごとに変えるか）。
6. 「Coach にまかせる」の時、相談文が「1枚で」と書いている場合に説明文を出すか（今は複数枚を選んだ時だけ出している）。

## 5. 守ること（AGENTS.md に加えて、この作業で特に）

- 作業の前後で `docs/handoff-log.md` を更新（JST の開始・終了時刻、開始時の main、コミット）。段階（R0〜R3）ごとに記録する。
- 設計と食い違う判断は、先に `docs/decisions.md` に理由を書く。**既存機能は消さない**（`AIMED_ROLES`、`MVP_ROUTES`、`primaryRoute` の既定値、1枚 Story、データパックのコード）。
- 画面の文言は `src/i18n/messages/ja.json` と `en.json` の**両方**に。役割の呼び名は翻訳キー。
- レジストリが唯一の設計図：役割表・型の定義は `src/registry/` に置き、画面や `questionMap.ts` に ID や文言を直書きしない。
- 本番 Supabase・秘密情報（`.env*`）に触れない。**push しない**。保存形式を変える時は後方互換（読み込み時に補う）にする。必要なら `normalizeStory` に足す。
- 検証：`npm run typecheck`、`npm test`、`npm run build`、`git diff --check`（コミット前に全部）。Node は 22 系（`package.json` の `engines`）。
- ステージング／実機で確かめるのはユーザー。確かめられていないことは「未確認」と記録に書く。

## 6. 受入条件（R3 の1型ごと）

- その型が `MVP_ROUTES` に入り、`decideRoute` がその型を選ぶ相談文のテストがある（選ばない相談文のテストも）。
- 役割表から Question Map ができ、`desired_yes` で止まる／広げない、のテストがある。
- 結論の役割が自動入力されない、因果を断定する文言が無い、のレビュー（コード上の確認）を記録に書く。
- 既存の AIMED のテストが全て通り、AIMED で保存済みの Story が変わらず開ける。
- 画面で型の名前を選ばせていない。ja/en の文言が揃っている。
