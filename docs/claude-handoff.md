# Claude 引き継ぎ書（新しいチャットで続ける時に最初に読む）

作成：2026-10-07（Claude）。前のチャットの続きを、新しいチャットの Claude が始めるための資料。
**新しいチャットでは、まずこのファイル → `CLAUDE.md` → `AGENTS.md` → `docs/data-model-progress.md` → `docs/handoff-log.md`（上の数件）を読む。**

---

## 1. 今の状態（2026-10-07 時点）

- 正本のリポジトリ：Mac の `~/Project/Narratix web app`（git）。**main は `5bc533f`、origin と同じ（push 済み）**。作業ツリーはきれい。
- テスト：全体 1388件通過・1件skip（Codex の報告）。typecheck・build 通過。
- 大きな流れ：**データの持ち方の作り直し**（`docs/data-model-proposal.md`）を Codex が段階0〜6まで実装し、main に入っている。本番 Supabase にも、ユーザーがマイグレーションを当て、テンプレート31件と旧ユーザーデータ（チャート48件・Story 19件）を新しい形へ移し終えている。
  - 新しい表：workspaces・workspace_members・sources・dataset_assets・dataset_versions・decks・deck_versions・deck_exports・templates。
  - 旧表（projects・datasets・view_specs・view_spec_versions・chart_drafts・stories・library_items）は**まだ残っている**（段階7で消す）。

## 2. 次にやること（優先順）

1. **Codex の段階2〜6と旧データ移行のレビュー**（Claude がまだ見ていない）。対象は main の `aa15176..5bc533f`（`42026c0` DB、`802ba44` 保存・読込、`082609c` 文の書き手、`415cfb2` 出典、`4ab445c` テンプレート、`f6a41e3`・`200b215`・`5bc533f` 旧データ移行）。
   - 見る観点：RLS（workspace の境界、版は UPDATE/DELETE 不可、service_role 専用関数の権限）、hash による版の再利用、PPT 出力での版の固定、Story の自動保存と区切り版、論理削除、`basis`（文の根拠）の付け方、出典を変えた時に新しい版を作る決まり、テンプレートの自己完結、旧データ移行の冪等性。
   - 実画面の確認（ログインが要る）：マイチャートのチャート・ストーリー・下書き、複製・削除・見る、テンプレートのコピー、PPT 出力。ローカルでは Supabase の鍵が無くログインできないので、ユーザーに本番で触ってもらうか、確認用の仮ページ（コミットしない）で部品だけ確かめる。
2. **データ提供元の保存先を決める**（`docs/data-model-progress.md`「迷っていること」。Codex が止めている）。
   - 要件：公的統計などを Biz Slide Coach がテンプレートとして提供する時、「出典／発行元：総務省」と「データ提供元：Biz Slide Coach」を別に持つ。PPT には出さない。
   - 決めたら progress の「決めたこと」に理由付きで書き、Codex に戻す（型・DB・保存読込・テンプレート変換・テスト）。
3. **段階7（旧表を消す）**：移行後の安定を確認し、**ユーザーが改めて許可してから**。消す前にバックアップの書き出しを勧める。
4. 後回しにしている小さなもの（6章）。

## 3. 作業の約束（ユーザーと決めたこと。必ず守る）

- やり取りは日本語。**新しい作業は、実装の前に計画（変えるファイル・手順・確かめ方）を出して合意を取る**（`CLAUDE.md`）。設計書と違う判断は `docs/decisions.md` に1〜3行。
- **元のリポジトリで直接開発しない**。クラウド側のコピーで作業・テストし、変えたファイルだけ Mac に書き戻す。
  - Mac の Linux シェルでは node_modules が macOS 用なので、vitest・tsc は動かない。テストはクラウドのコピーで回す。
  - 書き戻す前に、Mac の版の md5 が、クラウドの元にしたコミットの版と同じことを確かめる（自分の変更だけを書き戻すため）。
- **コミットは Mac で行う。push はユーザーが行う**（頼まれた時を除く。Mac には GitHub の認証が無く、push は失敗する）。
- コミットメッセージの末尾：
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_018UC7vhBDADBr1N7QYqjALJ
  ```
  （新しいチャットでは、その時のシステムの指示にある値を使う）
- `.git/index.lock` などが残ったら消してよい（ユーザーの許可あり）。新しいチャットでは、フォルダーの削除の許可を改めて求める必要がある。
- **秘密情報は扱わない**：Supabase の service_role、OpenAI・Resend のキーをチャットや git に出さない。`.env*` は読まない。本番 Supabase への操作（マイグレーション・データ投入・削除）はユーザーが行う。Claude は SQL や手順を示すだけ。
- `Claude outputs/`（Mac の受け渡し用フォルダー）は `.git/info/exclude` で git から外してある。
- iCloud の「2. Narratix, chart-advisor」は参照用。書き込まない。

## 4. 書き戻しの手順（前のチャットでのやり方）

1. クラウドのコピーを用意する。新しいチャットでは無いので作り直す。
   - Mac で `git archive --format=tar.gz -o "Claude outputs/src.tgz" HEAD` → `device_stage_files` → クラウドで展開。
   - `git init` して1回コミット（変更の差分を取るため）→ `npm ci`。
2. クラウドで変更し、`npx tsc --noEmit`・`npx vitest run`・`rm -rf .next && npx next build` を通す。
3. 変えたファイルを tar にして `/mnt/user-data/outputs/X.tgz` → `device_commit_files` で Mac の `Claude outputs/X.tgz` へ。
4. Mac で次を行う。
   - 書き戻す前に `md5sum` で、元の版が同じことを確かめる。
   - `tar xzf` → `git add <files>`。
   - 置いた版を `git cat-file -p $(git ls-files -s f | awk '{print $2}') | md5sum` で確かめる。
   - `git commit -F -`（上の2行を末尾に）→ `rm -f .git/index.lock`。
5. 画面の確認：クラウドで `nohup npx next dev -p 3311` → Playwright（`executablePath: '/opt/pw-browsers/chromium'`）でスクリーンショット → `pkill -f "next dev -p 3311"`（終了コード144は問題なし）。
   - 仮のページを作った時は、消した後に `.next` も消す（型の検査が古いページを探して失敗するため）。

## 5. Codex との分担（2026-10-07 更新：役割分担から「交代制」へ）

- **2026-10-07 より、Codex は画面・機能・設計の実装を全般に担当してよい**（`AGENTS.md` 2章。以前の A〜E の個別許可は
  参考情報として 2.1 に残すのみで、範囲の制限としては使わない）。
- Codex と Claude は**同時に作業しない**（ユーザーが調整する）。その代わり：
  - 新しいチャットで作業を始める前に、必ず `docs/handoff-log.md` の一番上の記録と `git log -1` を見比べ、
    記録に無い変更（＝記録し忘れ、または作業中のまま終わったもの）が無いか確かめる。ずれがあればユーザーに確認する。
  - 1〜2コミットで終わる小さい〜中くらいの作業は、**Codex も直接 `~/Project/Narratix web app` の main で**進めてよい
    （今までのような作業コピー→レビュー→取り込みを必須にしない）。
  - 設計のやり直しなど、複数コミットにまたがる大きな作業は、今までどおり作業コピー（`~/Project/Narratix web app-<名前>-codex`）
    で進めて、最後にまとめて取り込む形でもよい（`AGENTS.md` 3章8項）。
    - 取り込み：main が作業コピーの元と同じなら `git fetch <作業コピー> HEAD && git merge --ff-only FETCH_HEAD`。ずれていれば `git format-patch` → `git am -k`（`-k` が無いと `[codex]` が消える）。
    - **作業コピーの HEAD は、確認したコミットより先に進んでいることがある**。取り込むのは確認したコミットまで。
  - 作業が終わったら、`docs/handoff-log.md` にタイムスタンプ（開始・終了、JST）・開始時の `main` のコミット・
    変えたファイル・確かめたこと・コミットハッシュを必ず記録する（ひな形は同ファイル冒頭）。
- データの作り直し（旧 E）では、Codex が `docs/data-model-progress.md` を毎回更新する。Claude はこれを読めば続きがわかる。
- Codex への依頼文は、Claude がチャットに「そのまま貼ってください」の形で出す。

## 6. 後回しにしているもの（バックログ）

- テンプレートの「拡大」の画面を、マイチャートの「見る」（`SlideViewer`）にそろえる。
- Mekko の時点別の構成比テーブル（チャートから選ぶ・Mekko の構成の変化で、指示書にあったが表が無いため保留）。
- カードの中で強調する項目を選ぶ（今は編集画面の「強調」）。
- 目的入口の計測（候補の選択率・所要時間）。
- データの意味カード（単位・時間・出典を入力の時に確かめる。提案書4章、P1）。
- スピーカーノートの欄と PPT のノート出力（P1）。
- AI のヘッドライン（`src/lib/ai/headline.ts`）は下準備のまま、画面から呼ばれていない。つなぐ時は、文の書き手（author: ai / ai_edited）と根拠を必ず残す。
- Ask My Data・Check Missing Insight（提案書 3.6・6章 P2）。
- 「スライド形式を変更」で2行に折り返す長いチャート名の短縮（必要なら）。
- ログインが要る画面で、前のチャットで実画面を確認できていないもの：マイチャートのストーリーの絵、編集画面のストーリーの名前の変更（その後、保存の作り直しで実装が変わっているので、レビューの時にまとめて確認する）。

## 7. 前のチャットで入れた主なもの（直近から）

- マイチャート：「見る」（画面いっぱいのビューアー）と「編集」。ストーリーのカードにもスライドの絵。編集画面でストーリーの名前を変える。ヘッダーの並び（新しく作る｜編集｜マイチャート｜テンプレート）。スマホのタブ。
- 編集画面「スライド形式を変更」：選んでも一覧を開いたまま、ボタンに形の線画（`ChartGlyph.tsx`）。
- チャート名「2期間の積み上げ」（旧：2期間の100%積み上げ（カテゴリ別））。
- 目的から選ぶ：単一選択で即遷移、基本の切り口を最初から選ぶ、Mekko 型の切り替えボタン＋大きなプレビュー1つ、候補を「おすすめ／一緒に見せる案／別案／その他のバリエーション」に分ける（`purposeMeta.ts`）。
- チャートから選ぶ：全21チャートで、選んだチャートを第一案にする（`dishes.ts` の chosen・KEEP_CHOSEN・CHART_EMPHASES）。
- 英語の画面で AI 相談の文を英語で返す。編集画面の見本を中立に（AAA・BBB…、「ここにタイトル（伝えたいこと）を入れる」）。ほかのスライドの注意の帯に［直す］［このまま使う］。
- データの持ち方の監査と提案（`docs/data-model-proposal.md`）→ Codex が実装（1章）。

## 8. ユーザーについて

- 開発者本人（Tai）。日本語で、指示書（マークダウン）を貼って依頼することが多い。画面のスクリーンショットでフィードバックをくれる。
- 返事は簡潔に。終わったら、何をしたかを1〜2段落で。確認の質問は選択肢つきで。
- 迷う判断は「おすすめ」を付けて選んでもらうと進みやすい。
- 今の保存データは本人が作ったダミーが中心（ただし移行して残してある）。
