# 作業の引き継ぎ記録（Codex ⇄ Claude）

Codex が行った作業を、新しいものを上にして1件ずつ書く（書き方は `AGENTS.md` の4章）。
Claude は作業を始める前にここを読み、変わったファイルを確かめてから進める。

## ユーザーから Codex への頼み方（ひな形）

```
やること：（例：マイチャートのカードの「複製」を「コピーを作る」に変える）
場所：（分かれば画面名やファイル名。例：マイチャート／src/features/my-page/MyPage.tsx）
終わりの目安：（例：日本語と英語の両方で表示が変わり、テスト・ビルドが通る）
触らないもの：（あれば）
```

## 記録のひな形（Codex は、これを「記録」の見出しのすぐ下に足す）

```
### YYYY-MM-DD 〈作業の名前〉（Codex）
- 頼まれたこと：
- 変えたファイル：
  - `path/to/file`：何を変えたか（1行）
- 確かめたこと：typecheck / test / build（通った・落ちた）、画面で見たこと
- コミット：`[codex] …`（短いハッシュ）
- 残っていること・Claude に伝えたいこと：（無ければ「なし」）
```

---

## 記録

### 2026-10-02 バブルを第一案に（Codex）
- 頼まれたこと：「チャートから選ぶ」でバブルを選んだ時、4つの切り口すべてで選択チャートを第一案にする。
- 変えたファイル：
  - `src/features/start/dishes.ts`：bubbleの4マスへchosenの日英案内を追加し、KEEP_CHOSENへ追加した。
  - `src/features/start/plan.test.ts`：第一案・別案・切り口変更後の復帰を確認する対象にbubbleを追加した。
- 確かめたこと：第1便の5チャート実装後にtypecheck / test / buildをまとめて実行する。
- コミット：`[codex] バブルを第一案にする`（本コミット）
- 残っていること・Claude に伝えたいこと：なし。

### 2026-10-02 幅が変わる縦棒を第一案に（Codex）
- 頼まれたこと：「チャートから選ぶ」で幅が変わる縦棒を選んだ時、4つの切り口すべてで選択チャートを第一案にする。
- 変えたファイル：
  - `src/features/start/dishes.ts`：variable_widthの4マスへchosenの日英案内を追加し、KEEP_CHOSENへ追加した。
  - `src/features/start/plan.test.ts`：第一案・別案・切り口変更後の復帰を確認する対象にvariable_widthを追加した。
- 確かめたこと：第1便の5チャート実装後にtypecheck / test / buildをまとめて実行する。
- コミット：`[codex] 幅が変わる縦棒を第一案にする`（本コミット）
- 残っていること・Claude に伝えたいこと：なし。

### 2026-10-02 ウォーターフォールを第一案に（Codex）
- 頼まれたこと：「チャートから選ぶ」でウォーターフォールを選んだ時、4つの切り口すべてで選択チャートを第一案にする。
- 変えたファイル：
  - `src/features/start/dishes.ts`：waterfallの4マスへchosenの日英案内を追加し、KEEP_CHOSENへ追加した。
  - `src/features/start/plan.test.ts`：第一案・別案・切り口変更後の復帰を確認する対象にwaterfallを追加した。
- 確かめたこと：第1便の5チャート実装後にtypecheck / test / buildをまとめて実行する。
- コミット：`[codex] ウォーターフォールを第一案にする`（本コミット）
- 残っていること・Claude に伝えたいこと：なし。

### 2026-10-02 2期間の100%積み上げを第一案に（Codex）
- 頼まれたこと：「チャートから選ぶ」で2期間の100%積み上げ（カテゴリ別）を選んだ時、4つの切り口すべてで選択チャートを第一案にする。
- 変えたファイル：
  - `src/features/start/dishes.ts`：share_pairの4マスへchosenの日英案内を追加し、KEEP_CHOSENへ追加した。
  - `src/features/start/plan.test.ts`：第一案・別案・切り口変更後の復帰を共通確認するテストを追加した。
- 確かめたこと：第1便の5チャート実装後にtypecheck / test / buildをまとめて実行する。
- コミット：`[codex] 2期間の100%積み上げを第一案にする`（本コミット）
- 残っていること・Claude に伝えたいこと：なし。

### 2026-10-02 チャートから選ぶ：Mekko を第一案に（Claude）
- 変えたファイル：`src/features/start/dishes.ts`（Mekko のマスに chosen、KEEP_CHOSEN・resolveChosen）、`coach.ts`（推薦の分岐・Proposal.name）、`plan.ts`（伝えたいことを替えたら選んだチャートの案に戻す）、`RecipeScreen.tsx`（選んだチャートで作る／Coachからの別案のカード、現在の選択）、`src/registry/recipes.ts`・`ids.ts`（MIX_MEKKO_SHIFT）、文言、テスト。
- 確かめたこと：typecheck / test / build 通過。Mekko の4つの伝えたいことを画面で確認。
- 残っていること：ほかのチャートへの展開、時点別の構成比テーブル、カード内での強調項目の選択。

### 2026-10-02 配色テーマの仕上げ（Claude）
- Codex の「チャートのカラーテーマを4種類追加」を確認し、残りを対応した。
- 変えたファイル：
  - `src/registry/controls.ts`：配色の選択肢に4テーマを追加。
  - `src/engine/layout/charts/combo-config.ts`：複合グラフの棒・線の色を、単色の濃淡テーマ全部と Pastel Pop で使い分け。
  - `src/engine/theme.ts`：`singleHueScale` を追加。Pastel Pop の primary を線の色、secondary を面の色に。
  - `src/engine/theme.test.ts`：レジストリと THEME_IDS の一致、複合グラフの色のテストを追加。
  - `src/features/story/QuestionMap.tsx` → `QuestionMapView.tsx`（大文字・小文字の衝突の解消）。
- 確かめたこと：typecheck / test / build 通過。6テーマ×6チャートの見本と、編集画面の配色の選択を画面で確認。
- 残っていること：なし

### 2026-10-02 チャートのカラーテーマを4種類追加（Codex）
- 頼まれたこと：既存2テーマを維持したまま、Deep Ocean Teal・Executive Plum・Warm Market・Pastel Popを追加する。
- 変えたファイル：
  - `src/engine/theme.ts`：4テーマのIDと色を追加し、単色濃淡の共通選択処理とPastel Popの面色・線色を実装した。
  - `src/features/editor/ThemePicker.tsx`：6テーマの見本・表示順・Plus対象・7項目超過時の注意対象を更新した。
  - `src/i18n/messages/ja.json`：新テーマの名前・説明と、テーマ共通の項目数警告を追加した。
  - `src/i18n/messages/en.json`：新テーマの名前・説明と、テーマ共通の項目数警告を追加した。
  - `src/engine/theme.test.ts`：既存テーマの互換性、新テーマの色選択・保存・描画・PPT一致を検証するテストを追加した。
- 確かめたこと：テーマ関連テスト34件と全体テスト（1281件、1件skip）は通った。typecheckとbuildは、既存のStory機能にある`QuestionMap.ts` / `questionMap.ts`の大文字小文字競合で失敗（buildのコンパイル自体は成功）。ブラウザの管理ポリシー確認が通らず、実画面の目視確認は未実施。
- コミット：`[codex] チャートのカラーテーマを4種類追加`（本コミット）
- 残っていること・Claude に伝えたいこと：許可範囲外の`src/registry/controls.ts`と`src/engine/layout/charts/combo-config.ts`は未変更。combo固有の棒・線の色分け、レジストリ選択肢、目視確認、既存Story型エラーの解消はClaude側で対応が必要。
