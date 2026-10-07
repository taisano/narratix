# Narratix Stage 3 隔離コピー内での修正計画

## 実装修正（必須）

### 1. SMALL_MULTIPLES の target リンク追加
**ファイル**: src/registry/presentation-rules.ts
**現状**: 
```ts
SMALL_MULTIPLES: { ..., status: 'ALTERNATIVE', target: { kind: 'chart', id: 'small_multiples_bar' }, ... }
```
**修正**: small_multiples_bar を hidden から正式化（確認後）
```ts
// chart registry から small_multiples_bar が正式になったことを確認してから修正
```
**優先度**: P0 optional（現在 ALTERNATIVE なので現状維持でも OK）

### 2. Renderer 設計判断のドキュメント化
**ファイル**: docs/ai-consultation-redesign-review.md
**現状**: 
```
6. MATRIX_DELTA_SHAREの試作
- 既存`STORY_TABLE_BASIC`をRendererとして再利用するSemantic Recipe。
```
**修正**: トレードオフを明記
```md
## 6. MATRIX_DELTA_SHAREの試作と設計判断

### 実装方針（P0）
- 既存`STORY_TABLE_BASIC`をRendererとして再利用するSemantic Recipe
- セルを「最新シェア」「基準時点からの増減pt」の2行で生成

### 将来の専用Renderer化（P1検討）
- 専用Renderer にする場合は主値と副値の文字サイズを分け、deltaによる任意色付けを追加可能
- 判断基準: PPT出力でのカラーニーズ、複数Storyでの再利用性
```

**優先度**: P0（ドキュメント化のみ）

### 3. Executive Summary 具体化対象外の明記
**ファイル**: docs/story-personalization-review.md
**現状**: 
```
## 4. AIへ渡すもの・渡さないもの
```
**修正**: 既に「4. AIへ渡すもの・渡さないもの」で「渡さない」に文書化されており、追加修正不要
**確認**: 8章で「Executive Summaryは具体化対象外でよいか」と確認事項としても記載済み
**対応**: レビュー結果で「対象外でOK」と判断したため、ドキュメント化不要

---

## 確認テスト（必須）

### テスト1: 実AI実行による proof_needs 分類の検証
**目的**: AI が rule と同じ proof_needs グループを返すか確認
**対象**: 最低 5 相談文
**手順**:
1. 試作版の AI で相談文を処理
   ```bash
   npm run test -- consult.test.ts 2>&1 | grep "proof_needs"
   ```
2. 返された proof_needs と、questionMap.ts の `groups()` 関数の結果を比較
3. 完全一致の確認

**期待結果**: AI proof_needs grouping が rule と 80% 以上一致
**判断**: 一致度が低い場合 → AI schema の Prompt を調整、または rule側を修正

### テスト2: 密度閾値（24セル、8項目）の検証
**目的**: 実ユースケースで高密度判定が適切か確認
**手順**:
1. 過去の相談・データで cell_count を再計算
   ```bash
   npm run test -- presentation-rules.test.ts --grep "dense|high_density"
   ```
2. 実際に Top N / Filter / Small Multiples が提案されるべき相談を 3-5 件確認
3. Heatmap への切替えが妥当かチェック

**期待結果**: 24セル以上で高密度判定が行われ、densityOptions が返される
**判断**: 実際の利用者には 24セル以下がほとんどの場合 → 閾値を 20 セルに引き下げ検討

### テスト3: share_basis CLARIFY フロー の UX 確認
**目的**: share_basis が不明な時の UX が実用的か確認
**手順**:
1. Share 相談で share_basis を明記しないケースをテスト
   ```bash
   npm run dev
   ```
2. 相談後、"CLARIFY" アクションが表示されるか確認
3. 「シェアの分母を教えてください」案内が適切か確認

**期待結果**: CLARIFY が表示され、ユーザーが分母を入力できる
**判断**: 現在 Story 生成画面で CLARIFY フロー未実装の可能性あり → plan.ts を確認

---

## 確認不要（設計・テストで既に完了）

### ✓ 旧互換性
- ✓ `analysis_v2: null` で旧キャッシュを読み込める
- ✓ Zod schema で `ConsultationAnalysisV2Schema.nullable().default(null)`
- ✓ typecheck / test 通過

### ✓ AI 安全性
- ✓ Critical Thinking で観測・推論・提案の区別
- ✓ `share_basis` null チェック（CLARIFY 返す）
- ✓ 相談文の原語のみを `sourceTerms` へ

### ✓ Story 具体化ロジック
- ✓ route_role + proof_needs 完全一致で接続
- ✓ 問い編集時は非表示（削除せず）
- ✓ UI 2カラム（PC）+ 1カラム（モバイル）実装済み

---

## 修正実施の判定基準

### テスト1 結果による修正フロー

**case A: AI proof_needs が rule と 80% 以上一致**
→ 修正不要、docs を「確認済み」で更新して main へ

**case B: 80% 未満、かつ規則側の問題**
→ questionMap.ts の `groups()` ロジック見直し、テスト追加

**case C: 80% 未満、かつ AI 側の問題**
→ consult.ts の AI Prompt 修正
   - 例: "proof_needs を同じカード に見える論理的なグループで返す"
   - 実施: Codex と協力して Prompt 改善

### テスト2 結果による修正フロー

**case A: 24セルが適切**
→ 修正不要、docs に「検証済み」を記載

**case B: 20セル程度に下げるべき**
→ presentation-rules.ts で `dense = cells >= 20` に変更、テスト値更新

### テスト3 結果による修正フロー

**case A: UX フロー が完成している**
→ 修正不要

**case B: plan.ts で CLARIFY 未対応**
→ plan.ts を確認し、必要に応じて CLARIFY → Question へ変換する UI を追加

---

## デプロイ前チェックリスト

- [ ] テスト1: AI proof_needs grouping の一致度確認（80% 以上）
- [ ] テスト2: 密度閾値 24セル の検証（実ユースケース 3-5件）
- [ ] テスト3: share_basis CLARIFY フロー の UX 確認
- [ ] typecheck / test 全通過（既に通っているが、修正後に再実行）
- [ ] npm run build 通過（既に通っているが、修正後に再実行）
- [ ] docs を修正内容に合わせて更新
- [ ] handoff-log.md へ修正内容を記載
- [ ] main へ push（修正なしの場合も「レビュー確認済み」を記載）

