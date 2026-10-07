# 「今回のStoryでは」隔離試作：Claudeレビュー資料

## 1. 位置づけ

この変更は、元リポジトリを変更せずに作ったレビュー用試作である。`2d8b935`のAI相談5層分類試作の次のコミットとして分離している。本番Supabase、課金、PPT出力には触れていない。

目的は、「伝えたいことから始める」から複数枚Storyを選んだ時、一般的なQuestionだけでなく、同じAI相談の応答を使って今回の相談に当てはめた説明を各カードへ出すことである。

## 2. 実装した流れ

1. 既存の`ai_consult`応答の`story.personalizations`へ具体化候補を追加する。追加のAI呼び出しはしない。
2. AI候補は、実行時に変わるスライドIDや配列位置ではなく、`route_role + proof_needs`を照合キーにする。
3. Question Mapを規則で作った後、役割とproof_needsが完全一致した候補だけを`StorySlide.personalization`へ固定する。
4. カード右側に「今回のStoryでは」「必要になりそうなデータ」、必要な時だけ「Coachから確認」を表示する。
5. 候補が無い、説明が空、不正な保存値、ユーザーが問いを書き換えた、意味が変わる編集をした場合は従来カードへ戻る。

このため、AIは引き続き読み取りと言語化だけを行い、Question Mapの構成、順番、表示例は既存の決定的な規則が決める。

## 3. 保存モデル

`StorySlide`に次の任意項目を追加した。旧データには存在しないため、保存版は`version: 1`のまま読める。

```ts
type PersonalizationConfidence = 'confirmed' | 'proposed' | 'unknown';

interface PersonalizedStoryContext {
  explanation: string;
  confidence: PersonalizationConfidence;
  requiredDataHints: string[];
  unresolvedQuestion?: string;
  sourceTerms?: string[];
}
```

読み込み時は、説明が空なら具体化全体を使わない。データ候補は文字列だけを重複除去して最大5件、確認は最大1件、原語も文字列だけにする。Story本体の読み込みは止めない。

## 4. AIへ渡すもの・渡さないもの

渡すものは従来どおり相談文、画面言語、ユーザーが明示的に書いた補足だけである。表データ、Dataset、保存済みStory、他の相談は送らない。

プロンプトとSchemaには次を追加した。

- 説明は1〜2文で、テンプレートQuestionを今回の相談へ当てはめる。
- 必要データは2〜5件。
- 確認はStoryの組み方を変える重要なものだけ、最大1件。
- 相談文にない地域、商品、期間、指標、施策、数値、結果、原因、Actionを作らない。
- `source_terms`は相談文の原語をそのまま返し、アプリ側でも相談文に実在する語だけ残す。
- 出力言語は既存のlocale指定に従う。

## 5. 操作時の扱い

| 操作 | 具体化 |
|---|---|
| 上下の並べ替え | 同じQuestion IDに保持 |
| Main／Appendix／外した問いの移動 | 保持 |
| 削除 | Questionと一緒に削除 |
| 文言の編集 | 保存は保持するが、画面では非表示 |
| proof_needの追加・除去 | 新規Questionには付けない。既存Questionの意味が変われば除去 |
| Questionの統合・分割 | 意味が変わるため除去 |
| AIなし／旧応答／候補不一致 | 従来カード |

文言編集時にデータを削除せず非表示にしたのは、元に戻す可能性を残しつつ、古い説明を新しい問いへ誤表示しないためである。現状は「相談し直すと具体化できます」の案内や自動再相談は追加していない。

## 6. UI

- PC：既存の一般Questionと操作を左、今回の具体化を右にした2カラム。
- 760px以下：一般Question、操作、具体化、必要データ、Coach確認の順に1カラム。
- 具体化が無いカードは従来幅のまま左側だけを表示する。
- 色だけに依存せず、すべて見出しと本文で表示する。
- 日本語と英語の文言は翻訳JSONへ追加した。

## 7. テストしたこと

- AI JSON Schemaのstrict条件と旧応答互換。
- 相談文に実在する原語だけを保持し、不明語を除く。
- 不正な`requiredDataHints`等を安全に正規化する。
- Story生成時の完全一致接続と、候補が無い時のフォールバック。
- 保存・読み戻しと旧データ互換。
- 並べ替え／Appendix移動で保持し、統合／分割で除去する。
- UIに3つの見出しと内容を順に表示し、問い編集後は具体化を隠す。
- 全体テスト1406件通過（1件skip）、typecheck、production build通過。

## 8. Claudeに確認してほしいこと

1. `route_role + proof_needs完全一致`をAI候補と規則生成Questionの接続キーとして採用してよいか。誤接続を避ける代わりに、AIのproof_needs groupingが規則と違う場合は具体化が出ない。
2. `confirmed`を「相談文に明記された意図」として使ってよいか。データの結果を確認済みという意味には使っていない。
3. 問い編集時は具体化を非表示にする方針でよいか。将来「相談し直すと具体化できます」を表示する場合も、ユーザー操作なしのAI再実行はしない。
4. Executive Summaryは固定的なproof_needを持たないため、今回は具体化対象外でよいか。
5. 今回は`StoryReading.personalizations`を任意項目にした。AI Schema側では新応答に必須、Zod側では旧応答のため既定`[]`としている。この互換方針でよいか。

## 9. 未実装

- 実AIを用いた表現品質のeval、誤具体化率の計測。
- 「相談し直すと具体化できます」の案内と再相談UI。
- ユーザーがチェックボックスで追加したQuestionへの安全な静的対応表。現在は具体化なし。
- Executive Summary用の具体化。
- ブラウザ実機による視覚回帰テスト。SSRの構造テストとproduction buildまでは実施した。

## 10. Claude のレビュー（2026-10-07）

8章の質問への回答と、行った修正。

1. **採用しない**：`route_role + proof_needs完全一致`は設計上の欠陥がある。AI は規則側の `groups()`／`unifiable()`（同じ役割の中でどの proof_needs を1枚にまとめるか）を知らないため、ほとんどの場合で完全一致せず具体化が接続されない。
   → `target`方式に変更した。AI は証明要求1つ（または`DECISION`）ごとに具体化を1件返すだけにして、まとめ方（grouping）は常にアプリ側が決める。問いの `proofNeeds` に当たる候補をアプリが集めて1つに合成する（説明は先頭の証明要求のもの、必要データ・原語は重複を除いて合算、確かさは一番低いものを採用）。これで grouping ルールが変わっても AI 側の出力形式を変えずに済む。
2. **賛成**：`confirmed`は「相談文に明記された意図」の意味で使う。データの観測結果の確認済みという意味には使わない。この方針に変更はない。
3. **賛成**：問い編集時は具体化を非表示にする。再相談UIは今回も実装しない。
4. **賛成**：Executive Summaryは固定的なproof_needを持たないため、今回は具体化対象外のままとする。
5. **賛成**：`StoryReading.personalizations`は任意項目のまま。Zod側は旧応答のため既定`[]`。AI Schema側は新応答で必須（`target`は`proof_needs`で選んだ語のみ＋`DECISION`）。

### 追加の修正

- `src/registry/story.ts`：`StoryPersonalizationCandidate`を`routeRole + proofNeeds`から`target: ProofNeedId | 'DECISION'`へ変更。
- `src/features/story/questionMap.ts`：`personalizationFor()`を、問いの`proofNeeds`（1つ以上）に当たる候補を集めて合成する実装に全面書き換え。
- `src/lib/ai/consult.ts`：AI JSON Schema・Zod schema・`toStoryReading()`を`target`方式へ。`target`が`proof_needs`に実在しない（AIの取りこぼし・誤記）場合は、その具体化を捨てる（誤った問いに付けないため）。
- `src/lib/ai/provider.ts` / `consult-client.ts` / `api/ai/consult/route.ts`：具体化で応答が長くなる分、`maxOutputTokens`を2000→3500、タイムアウトを20秒→30秒（クライアント側35秒、Route Handlerの`maxDuration`を40秒）に広げた。途中で切れるとJSON全体が壊れてAI相談ごと使えなくなるため。
- `src/features/story/QuestionMapView.tsx` / `story.module.css`：「今回のStoryでは」見出しにCoachの印（丸いC）を追加し、AIが相談文から書いた内容だと分かるようにした。
- テスト（`storyOps.test.ts`、`consult.test.ts`）を`target`方式に合わせて更新し、「`proof_needs`に実在しない`target`は捨てる」ケースを追加した。

### 今回のレビューでは行っていないこと

- `docs/ai-consultation-redesign-review.md`で検討した、AI呼び出しを段階的に減らす環境変数の切り替え（`analysis_v2`を既定で頼まない等）は、このラウンドでは実装していない。必要なら別途。
- 新規の`personalization.test.ts`は作らず、既存テストファイルの更新に留めた。
- 実際のOpenAI APIを使った確認（時間内に返る、JSONが切れない、具体化が問いに正しく付く、相談文にない固有名詞を作らない）は、ローカルにAPIキーが無いため未実施。本番または鍵のある環境での確認が必要。
- `npm test` / `npm run build`は、このレビュー環境（Macのシェルではなく隔離コピーがマウントされたLinux VM）ではネイティブバイナリの不整合（rolldownのdarwin-arm64 bindingがmacOS用）で実行できなかった。`npm run typecheck`（`tsc --noEmit`）は通過を確認した。Mac本体のターミナルでの`npm test`・`npm run build`の再確認を推奨する。
