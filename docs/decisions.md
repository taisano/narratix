# 決定記録

設計書（registry-spec.md）と食い違う判断や、実装上の選択を1〜3行で残す。

## 2026-09-23

- **コードの置き場所**：iCloud Drive 外の `~/Project/Narratix web app` を git リポジトリの正本とする。iCloud 側の指示書フォルダは参照用に残し、以後の更新はリポジトリ内の `docs/` で行う。
- **技術スタック確定**：Next.js 16（App Router）＋ TypeScript 5.9、Vitest、zod 4（レジストリと ViewSpec の検証。JSON Schema は `z.toJSONSchema` で生成）、Supabase（Postgres＋Auth＋RLS）。TypeScript 7 は Next.js との組み合わせ実績が少ないため見送り。
- **PptxGenJS は 3.12.0 に固定**：見本コードの注意点（テキストの margin はpt、表セルの margin はインチ）が 3.12 の挙動に基づくため。4.x への更新は出力の見た目を検証してから。
- **ホスティング**：Vercel を想定（未確定）。

## 2026-09-23（レジストリ）

- **設定の適用先は Control 側だけに持つ**：チャート定義に `controls` 一覧は置かず、`controlsFor(chart)` で逆引きする（二重管理を避ける）。補完パーツは、チャート側に「推奨」、補完パーツ側に「適用可能（appliesTo）」を持ち、推奨 ⊆ 適用可能をテストで保証する。appliesTo は設計書の「主な適用チャート」と各チャートの「推奨補完」の和集合。
- **見せられる／見せられないは語彙（AspectId）で持つ**：設計書の日本語の説明を20語の語彙に置き換え、補完パーツの `covers` と突き合わせる。語彙は `src/registry/aspects.ts`。
- **スキーマの互換**：MATRIX 系チャート（trend / comparison）は MEKKO データも受け取れる（どちらも「行×列の実数」）。p05 の左の合計棒（stacked_100）を MEKKO データから描くため。transform を持つパネルはスキーマ照合を省き、変換後の形は配置エンジン側で確かめる。
- **パネル型の補完パーツの置き場所**：揃えた表は既定で p02（上下 3:1）の下、Mekko は p05 の右下、横棒ランキングとヒートマップは p03 の右（行揃え）。示唆ボックスは p03 の右（3:1）。
- **ViewSpec の id / version は任意**：AI が返す JSON には含まれないため。保存時に DB 側で付ける。
- **sparkline は保留**：3時点以上が必要だが、Dataset は current / base の2時点しか持てない。Dataset の拡張と合わせて決める。
- **slope は比較期間を必須にしない**：MATRIX_TIME_SERIES の2行（2時点）でも描けるため。

## 2026-09-23（transform と配置エンジン）

- **見本をゴールデン値にする**：`scripts/extract-reference-golden.mjs` が `reference/mekko-builder.html` の `model()` と `layout()` を Node でそのまま実行し、5パターン（標準、期間の伸び率、強調、表なし、入力順）の結果を `src/engine/__fixtures__/reference-mekko.json` に書き出す。エンジンはこれと全アイテムの座標・文言・色が一致することをテストで保証する。見本を変えたらスクリプトを再実行する。
- **見本の構成は「p02 上下（上：Mekko、下：揃えた表）」で再現する**：揃えの指定でつながったパネルの間隔は 0.14 in（通常は 0.25 in）。列で揃える表は、比率で決まる高さより内容が小さければ内容の高さに縮め、余りをチャート側に渡す（比率は上限として働く）。
- **スライド枠の寸法を見本に合わせた**：タイトル y=0.32、パネル領域 1.18〜6.90、出典 y=7.02（`SLIDE_FRAME`）。
- **Dataset に `dimensions`（行・列が何を表すか）を追加**：Mekko の注記「高さ：形状の構成比」に必要なため。未入力なら「セグメント」。
- **Mekko の左余白**：揃えた表がある、または左に y_scale で揃えるパネルがない場合は 1.75 in（見本と同じ）。左に合計棒がある p05 で表もない場合は 0.6 in。
- **描画を実装済みのチャートは mekko と stacked_100 のみ**（`IMPLEMENTED_CHARTS`）。他は `ComposeError('not_implemented')` を返す。

## 2026-09-23（プレビュー画面）

- **画面の多言語は自前の小さな仕組みにした**（`src/i18n/ui.tsx` の `useT()`）。next-intl は URL に言語を入れるルーティングが前提で、今の1画面構成には重いため外した。翻訳ファイル（messages/ja.json・en.json）の形は同じなので、必要になれば置き換えられる。日英のキーと差し込みが揃っていることはテストで確認する。
- **空きスロットは詰める**：パネルを置かないスロットは幅0・間隔0にする。Mekko ビルダーは常に p05 を使い、左の合計棒・下の表のオンオフは「そのスロットを空ける」で表す。
- **p05 で左に合計棒があるとき**、Mekko の左余白は下の表の行ラベルが入る幅まで詰め、「形状構成比（2025年）」の見出しは出さない（合計棒の見出しと重複するため）。
- **作業途中のデータはブラウザに保存**（localStorage）。ログインと保存は Supabase で後から入れる。
- **画面の状態 → ViewSpec**：画面は `BuilderState` を編集し、描画のたびに `toViewSpec()` で ViewSpec に変換してレジストリで検証してから描く。レイアウトと置き場所は補完パーツ aligned_table の定義から取る。

## 2026-09-23（PPTX 出力）

- **PPTX は Scene をそのまま置く**（`src/export/pptx/scene-to-pptx.ts`）。チャート固有のルールは持たない。図形・文字の位置と大きさが Scene と ±1 EMU で一致すること、揃えた表の列幅が Mekko の列と一致することを、生成した PPTX の XML を展開してテストする。
- **フォントはスライドの言語で決める**：日本語 Meiryo、英語 Arial（`SLIDE_FONTS`）。社内規定のフォントに変える設定は後から。
- **PptxGenJS はダウンロードボタンを押した時に読み込む**（画面の初回表示を軽くするため）。
- **元データのスライド**（付録）も Scene として配置する（`layoutDataSlide`）。行が多い場合のページ分けは未対応。
- **表の行ラベル列の余白を 0.4in に**：0.2in では PowerPoint／代替フォントで「市場全体 CAGR」が折り返した（LibreOffice で PPTX を画像にして確認）。
- **強調時の凡例は色のまま**（見本と同じ）。強調していない系列の凡例をグレーにするかは要検討。

## 2026-09-23（ログインと保存）

- **テーブル**：projects / datasets / view_specs / view_spec_versions。すべて owner_id = auth.uid() の RLS。anon には権限を与えない。履歴（versions）は追記のみ。
- **保存は RPC `save_chart` 1回**：データ・ViewSpec・履歴をまとめて書き、version を進める（security invoker なので RLS がそのまま効く）。新規保存で最初のプロジェクト「マイプロジェクト」を自動で作る（プロジェクトの画面はまだない）。
- **ViewSpec と画面の状態を両方保存する**：`spec` はレジストリで検証済みの ViewSpec（出力・AI の正本）、`ui` は開き直すための BuilderState。検証に通らない状態は保存しない。
- **削除は datasets を消す**：外部キーの cascade で ViewSpec と履歴も消える。
- **ログインはメールのリンク（PKCE）**：リンクから戻るとブラウザのクライアントが ?code= を自動で交換する。サーバー側で Supabase を使う処理はまだないので、proxy.ts（旧 middleware）とコールバック用のルートは置いていない。サーバー側で読む処理を足す時に入れる。
- **テスト**：migration は PGlite に Supabase の auth を模したスキーマを作って実行し、保存・版の進み・他人の行が見えない／書けない・未ログインで読めない・履歴を書き換えられない、を確かめる。画面の流れは Playwright で Supabase を差し替えて確認した（自動テストには入れていない）。

## 2026-09-24（依存関係の注意）

- **npm audit の high 2件は pptxgenjs → image-size**：画像を読み込む時の不具合（DoS）。このアプリは PPT に画像を入れないので該当しない。`npm audit fix --force` は pptxgenjs を 2.2 に戻して出力が壊れるため実行しない。画像を入れる機能を足す時に、pptxgenjs の更新と合わせて見直す。
- **Node.js は 22 か 24 の LTS**：vitest 5 が 23 を対象外にしている（`engines` に明記）。
