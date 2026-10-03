# データの持ち方の作り直し：進み具合

設計：`docs/data-model-proposal.md`（正本）。作業の決まり：`AGENTS.md` 2.1 E。
Codex・Claude のどちらが続きをしても、**このファイルだけ読めば始められる**ように書く。新しい記録を上に書く。

## 今の状態（ここを毎回書き換える）

- 今の段階：**未着手**
- 作業コピー：`~/Project/Narratix web app-data-model-codex`（未作成）
- 元にした main のコミット：（作る時に書く）
- 最後のコミット：—
- typecheck / test / build：—
- 次に始める場所：手順1（型と変換）

## チェックリスト（提案書 7章の順）

- [x] 0a. テンプレートの書き出し：済（2026-10-03。31件、すべて公開。`supabase/seed/library_items.v3.json`。全件 `normalizeProject` で読めることを確認）
- [ ] 0b. 準備：作業コピーを作る
- [ ] 1. 型と変換：`CanonicalTable`・`DeckContent`・`SlideRecord`・`TextField`・`SourceRecord` の型。今の Dataset／ProjectState ⇄ 新しい形の変換（`src/features/data/canonical.ts` ほか）。往復のテスト（推移・Mekko・2指標スロープ・順位スロープ・縦長の表・バブルのグループ・表／言葉の型）
- [ ] 2. DB：workspaces・workspace_members・sources・datasets・dataset_versions・decks・deck_versions・templates のマイグレーションと RLS。テスト（workspace の境界、版は書き換え不可、他人のものは見えない）
- [ ] 3. 保存と読み込み：`src/lib/repo/` を decks に置き換え（チャート・ストーリー・下書き・複製・削除・見る・タグ）。PPT 出力で版を固定
- [ ] 4. 文の書き手：タイトル・チャートタイトル・問いに `author` と `basis`。`titleData` を `basis` に置き換え
- [ ] 5. 出典とサンプルの区別：「出典」の欄を `sources` につなぐ（URL・公開日は任意）。見本は `kind: 'sample'`
- [ ] 6. テンプレートの読み込み：`scripts/import-templates.ts`
- [ ] 7. 古い表を消す（ユーザーの許可を得てから）

## ユーザーがすること（Codex はしない）

- [x] テンプレートの書き出し（済。main に入れた）
- [ ] 段階2のマイグレーションを Supabase に当てる（Claude と一緒に）
- [ ] 段階7で古い表を消すことの許可

## 決めたこと

（理由つきで書く。提案書と違う判断は `docs/decisions.md` にも）

- テンプレートの書き出しは、元のまま保存した（直さない）。読み込む時（段階6）に次を直す：
  - 「宇宙事業の資料作成本数推移」と「Space Business Presentation」の2件は、期間の名前が訪日データの指標名（Visitor arrivals… / Travel spending…）のまま（P0-6 の混入）。読み込む時に期間の名前を空にする（中身は四半期×テーマの本数で、指標が2つあるデータではない）。
  - `created_by`（作った人の id）は読み込まない。新しい形ではシステムのテンプレートとして持つ。

## 迷っていること・Claude に判断してほしいこと

（ここに書いたら、その段階で止める）

## 記録（新しいものを上に）

### YYYY-MM-DD 段階N 〈名前〉（Codex）
- したこと：
- 変えたファイル：
- コミット：
- 確かめたこと：typecheck / test / build、往復のテスト、作る→保存→開く→PPT 出力
- 残っていること・次の人へ：
