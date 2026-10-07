# Stage 3 確認テスト実施計画（修正版）

## 戦略変更理由

- ✅ **proof_needs grouping ロジック**：既存テスト 1400+ 件（consult.test.ts + questionMap.test.ts）で既に検証済み
- ✅ **互換性・型安全性**：typecheck / build / test で全通過
- ⚠️ **実AI実行テスト**：OpenAI API 認証が隔離コピー環境で未設定のため、実施困難

## 優先実施順序

### 優先度 P0：高価値で実施可能

#### 1. Story生成画面での実動作確認（優先度最高）
**目的**：personalization が実際の画面で正しく表示されるか確認
**手順**：
```bash
npm run dev
# ブラウザで以下を操作：
# 1. 複数枚Story相談を入力（2時点×複数ディメンション×SHARE など）
# 2. Story生成後、各カードで「今回のStoryでは」が表示されるか確認
# 3. 問い編集 → 具体化が非表示になるか確認
# 4. 並べ替え → 具体化が保持されるか確認
```
**期待結果**：
- 2カラム（PC）/ 1カラム（スマホ）の表示が正しい
- 具体化データが表示される（ただし必須ではない）
- 問い編集後に古い説明が隠れる

**実施時間**：15分

---

#### 2. 密度閾値の実データ検証（優先度 P0）
**目的**：24セル / 8項目の閾値が実データで適切か確認
**手順**：
```bash
# 過去の相談データから cell_count を実測
npm run test -- presentation-rules.test.ts --grep "MATRIX_DELTA|dense"
```
**期待結果**：
- MATRIX_DELTA_SHARE が提案される相談の cell_count を確認
- 実際のユースケースで 24セル以下がほとんど → 修正検討
- または 24セル以上のケースが十分にある → 現状維持

**実施時間**：10分（テストログから読み取り）

---

#### 3. share_basis CLARIFY フロー確認（優先度 P0）
**目的**：share_basis が不明な時に CLARIFY が返されているか確認
**手順**：
```bash
npm run test -- consult.test.ts --grep "SHARE|share_basis"
# または
npm run dev で相談画面で share 相談を入力、share_basis を明記しない
```
**期待結果**：
- consult.ts で share_basis が null の時に expected_action が CLARIFY になる
- または、Story 生成画面で「分母を教えてください」が表示される

**実施時間**：10分

---

### 優先度 P1：ドキュメント化

#### 4. テスト結果の docs 反映
**ファイル**：`docs/stage3-verification-results.md`（作成予定）
**内容**：
- テスト1-3 の結果
- 修正の要否判定
- main push 前のチェックリスト

---

## 実施見積もり

| テスト | 時間 | 難易度 | 優先度 |
|---|---|---|---|
| 1. 画面動作確認 | 15 分 | 低 | P0 |
| 2. 密度実測 | 10 分 | 低 | P0 |
| 3. CLARIFY確認 | 10 分 | 低 | P0 |
| **合計** | **35 分** | — | — |

---

## 次ステップ

1. **テスト1-3 を上記手順で実施**
2. **テスト結果に基づいて修正判断**：
   - すべて OK → main push 準備
   - 要修正 → presentation-rules.ts / consult.ts 修正
3. **修正後に typecheck / test / build 再実行**
4. **handoff-log.md へテスト結果記載**
5. **main へ push**

---

## 判定基準

| テスト | OK の基準 | NG の場合の対応 |
|---|---|---|
| 1. 画面 | 2カラム表示・問い編集で非表示 | UI 微調整 |
| 2. 密度 | 24セル以下が大部分 | 閾値を 20 に下げ検討 |
| 3. CLARIFY | share_basis null で CLARIFY 返す | consult.ts Prompt 微調整 |

