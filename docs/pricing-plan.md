# 料金・プランの設計（段階A：決済なしで「関心」と「価格感」を集める）

2026-10-11 作成（Claude）。ユーザーと合意した内容を設計に落としたもの。決済（Stripe）は作らない。
税・特定商取引法・利用規約などは、有料化の前に税理士・弁護士へ確認する（私は助言しない）。

## 1. 合意した内容

- プラン名と ID（既存の `PLAN_NAMES` のまま）：`free`＝基本（Free）、`pro`＝Plus、`team`＝Pro。ID は変えない。
- 価格（ドル基準）：Plus $9.99／3か月以上 $7.99、Pro $19.99／3か月以上 $14.99。
- 円：Plus ¥980、Pro ¥1,980（ユーザー指定）。3か月以上は ¥780／¥1,480（案）。
- ユーロ：確定の日のレートでドルから換算し、.99 などに丸める。それまでは `pricing.ts` の定数を未確定とする。
- 無料枠（ベータ）：1枚スライド 累計10回、Story 累計3回。AI 相談は月30回（変更なし）。
- 「1回」の単位：1枚スライドは**新しく保存または書き出した成果物 1 件**、Story も同様。
  同じ成果物の編集・再保存・再書き出しは数えない。
- 数え始め：公開日（`counts_from`）から全員 0 回。すでに使っている人も同じ。

## 2. プランごとの内容

| | 基本（free） | Plus（pro） | Pro（team） |
|---|---|---|---|
| 1枚スライド | 累計10回 | 実質無制限（公正利用） | 実質無制限 |
| Story | 累計3回 | 使えない | 使える |
| コーチにお任せ | 体験の範囲（下の未決） | 使えない | 使える |
| AI 相談 | 30回/月 | 100回/月 | 300回/月 |

`PLAN_LIMITS`（plans.ts）の変更：`pro.ai_consult` 300→100、`team.ai_consult` null→300。
`ai_headline` は今のまま。公正利用の日次上限（`FAIR_USE_PER_DAY`）は据え置き。
`BETA_OPEN_STORY` は、新しい回数制限に置き換える（Story はプランではなく、無料の残り回数または Pro で判定）。
`BETA_OPEN_PLUS`（配色テーマなど）は今回は触らない。

## 3. 数え方と強制（サーバー側）

- 新テーブル `make_counts(user_id, kind, ref_id, created_at)`、主キー `(user_id, kind, ref_id)`。
  `kind` は `slide` か `story`。`ref_id` はデッキまたは Story の ID。本人は自分の行だけ読める。直接の書き込みは不可。
- 新テーブル `plan_settings`（1 行）：`free_slide_limit`（10）、`free_story_limit`（3）、`counts_from`。管理者だけ変更できる。
- RPC `consume_make(p_kind, p_ref)`：security definer。管理者とすでに数えた `ref_id` は常に許可。
  それ以外は、プランと回数を見て、`{allowed, used, limit, plan}` を返す。許可したときだけ行を足す（アドバイザリロックで二重カウントを防ぐ）。
  - free：`kind` ごとの累計が上限未満なら許可。
  - pro：`slide` は公正利用の範囲で許可、`story` は不許可。
  - team：どちらも許可。
- RPC `my_make_usage()`：残り回数の表示用（`slide` と `story` の used／limit／plan）。
- 呼び出す場所：マイチャートへの初回保存、PPT の書き出し（`pptExport.ts` の `recordPptExport` の隣）、Story の初回保存（`saveStory`）。
- **移行時の安全策**：RPC が無い・失敗した場合は、ベータ中なので**通す**（記録して続行）。使えない状態を作らない。
  SQL を先に実行してから、コードをデプロイする順番にする。

## 4. 関心と価格感の記録

- 新テーブル `plan_interest(id, user_id, plan, billing, currency, price_feel, source, created_at)`。
  `plan` は `pro`／`team`、`billing` は `monthly`／`term`、`price_feel` は `high`／`fair`／`low`。
  `source` は `limit_slide`／`limit_story`／`menu`。本人は自分の行を追加・読める。
- 管理者向けの集計は件数のみ（`admin_plan_interest()`）。ユーザーごとに最新の 1 件だけを数える。個別の中身は見えない。
- 画面の文言：「準備中です。まだ課金されません。この料金なら使いたいですか？」。決済済みと誤解させない。

## 5. 画面

- 設定メニューに「プランを見る」を追加し、比較ダイアログ（`PlanCompare`）を開く。
- 上限に達したとき（1枚・Story）にも、同じダイアログを案内つきで開く。
- 通貨：日本語は円、英語はドルを初期値にし、ダイアログ内で USD／JPY／EUR を切り替えられる。
- 残り回数：作る画面と設定メニューに「1枚 残り7/10・Story 残り2/3」を表示する。
- ja／en の i18n を両方入れる。

## 6. 管理画面

- ダッシュボードにプラン別の関心数と、価格感の分布（通貨別）を足す。
- 「プラン」タブ：メールアドレスと `free`／`pro`／`team` を指定して、プランを手動で切り替える（RPC `admin_set_plan`）。
  段階Bの手動入金の運用に使う。
- 上限（10 と 3）は `plan_settings` で変更できるようにし、ベータの枠（`BetaCapPanel`）と同じ操作感にする。

## 7. 実装の順番

1. A1：`pricing.ts`（価格定数）、`plans.ts` の更新、マイグレーション（`make_counts`、`plan_settings`、`plan_interest`、各 RPC）と PGlite のテスト。
2. A2：回数の消費と表示（保存・書き出し・Story の初回保存）、上限のときのガード。
3. A3：比較ダイアログと関心・価格感の記録。
4. A4：管理画面（集計、プラン切り替え、上限の設定）。
5. A5：プライバシーページの追記、`docs/decisions.md` と `handoff-log.md`、typecheck／test／build。

## 8. 決まったこと・残っていること（2026-10-11 実装時）

決まったこと：
- 通貨ごとの価格はこの設計のとおり。ユーロは暫定で €9.49／€7.49（Plus）、€18.99／€13.99（Pro）。`src/lib/pricing.ts` の `EUR_PROVISIONAL` が true の間は、画面に「暫定」と出す。決済を作る時にレートで確定する。
- コーチにおまかせは、Story の無料枠（3回）が残っている間は使える。使い切る、または Plus では使えない（Story と同じ判定 `storyAllowedFor`）。
- 公正利用の上限は、1日あたり 1枚 50件・Story 20件（`plan_settings.daily_slide / daily_story`）。
- ベータの利用者はまだいないので、既存の利用者の数え直しや移行は考えない。数え始めは移行を流した日時（`counts_from`）。
- 数える場所：チャートの最初の版を作った時（`save_deck_state`）、Story を作った時、PPT の書き出し（`append_deck_export`）のうち最初の1回。自動保存の下書きは数えない。

実装した画面：
- `/pricing`（料金ページ。ログイン不要。サイトマップとトップのフッターに追加）
- プラン比較のダイアログ（設定メニューの「プランと料金」、上限に当たった時、Story／コーチを押した時に開く）
- 作る画面に「無料枠の残り」を表示
- 管理画面の「プラン」タブ（関心と価格感の集計、メールでのプラン切り替え、無料枠の回数）

残っていること（有料化の前）：
- 3か月以上の請求方式（前払いか、最低契約期間つきの月払いか）。
- 専門家への確認：特定商取引法の表示、返金・解約、消費税・VAT、規約・プライバシーの改定。
- 段階Cの Stripe 連携（Checkout、Webhook、プランの自動切り替え）。
