# 料金・プランの設計（段階A：決済なしで「関心」と「価格感」を集める）

2026-10-11 作成（Claude）。ユーザーと合意した内容を設計に落としたもの。決済（Stripe）は作らない。
税・特定商取引法・利用規約などは、有料化の前に税理士・弁護士へ確認する（私は助言しない）。

## 1. 合意した内容（2026-10-11 見直し後）

- プラン名と ID（既存の `PLAN_NAMES` のまま）：`free`＝基本（Free）、`pro`＝Plus、`team`＝Pro。ID は変えない。
- 価格（ドル基準）：Plus $9.99／3か月以上 $7.99、Pro $19.99／3か月以上 $14.99。
- 円：Plus ¥980、Pro ¥1,980。3か月以上は ¥780／¥1,480。ユーロはドルと同じ数字（€9.99／€7.99、€19.99／€14.99）。
- 無料（基本）は続ける。ただし利用にはメールアドレスでの登録が必要。ベータの後も、料金ページの基本の列に「無料で登録する」ボタンを置く。
- 数える単位：
  - AI 相談：相談文から AI が切り口を提案する1回（出し直しも1回）。基本は登録してからの**累計**、Plus・Pro は**月ごと**。
  - スライド作成：チャート・目的から新しく作って保存したスライド1件。同じスライドの編集・再保存は数えない。**月ごと**（暦の月、UTC。毎月1日に戻る）。
  - 出力：編集できる PPT の書き出し1回。**月ごと**。

## 2. プランごとの内容（比較表）

| グループ | 項目 | 基本（free） | Plus（pro） | Pro（team） |
|---|---|---|---|---|
| AIコーチ | AI相談（1枚） | 累計5回 | 月100回 | 月300回 |
| | 複数枚 Story | — | — | ✓ |
| | コーチにおまかせ | — | — | ✓ |
| スライド作成 | 目的からのスライド作成 | 月15枚 | 月100枚 | 無制限 |
| | チャートからのスライド作成 | （上と合計） | （上と合計） | （上と合計） |
| 出力 | 編集できるPPT出力 | 月30回 | 月200回 | 無制限 |
| | 透かし | あり | なし | なし |
| その他 | 新機能の優先招待 | — | — | ✓ |

- 表には項目名・ⓘ・値だけを出し、説明はⓘのポップアップに移した（Esc・外側クリック・閉じるボタンで閉じる）。作成の2行は縦結合し、上限を1回だけ「2機能の合計」と表示する。
- 「無制限」でも、誤作動や不正利用の歯止めとして、1日あたりの作成数に上限がある（1枚50件・Story20件。`plan_settings.daily_slide / daily_story`）。
- 画面の比較表の元は `src/lib/pricing.ts` の `PLAN_MATRIX`。AI 相談の回数は `PLAN_LIMITS`（plans.ts）と同じ数字で、`pricing.test.ts` で一致を確かめる。
- 基本の AI 相談だけ累計で数える（`AI_CONSULT_TOTAL_PLANS`）。サーバー（/api/ai/consult）が `ai_usage` の累計を数える。

## 3. 数え方と強制（サーバー側）

実装は `supabase/migrations/20261018000000_plans_usage.sql`（最初の版）と `20261019000000_plans_v2.sql`（見直し後。こちらが最終）。

- `make_counts(user_id, kind, ref_id, created_at)`、主キー `(user_id, kind, ref_id)`。`kind` は `slide` か `story`。本人は自分の行だけ読める。直接の書き込みは不可。
- `plan_settings`（1 行）：`free_slide_limit`（15）、`plus_slide_limit`（100）、`free_export_limit`（30）、`plus_export_limit`（200）、`daily_slide`（50）、`daily_story`（20）。管理者だけ変更できる（`admin_set_plan_limits`）。
- `consume_make(kind, ref)`：security definer。管理者とすでに数えた成果物は許可。Story は Pro だけ。スライド作成は、今月の件数がプランの上限未満なら許可。1日の上限も見る。超えると `plan_limit:slide|story|daily` の例外で保存ごと止まる。
- 数える場所は保存の入口：`save_deck_state`（チャートは最初の版を作る時、Story は作る時）、`append_deck_export`（まだ数えていない成果物の書き出し）。自動保存の下書きは数えない。
- 出力は `record_ppt_export`：登録済みの人と管理者だけ。今月の回数（基本30・Plus200・Pro無制限）を超えたら出せない。返す `plan_id` で、アプリが透かしを入れるか決める（基本だけ）。
- `my_make_usage()`：今月のスライド作成・Story・出力の used／limit（画面の残り回数）。
- 画面の側は、`plan_limit` の例外を受けたら、プランの案内（比較表）を開く。RPC がまだ無い時（SQL を流す前）は残り回数が出ないだけで、使える。

## 4. 関心と価格感の記録

- 新テーブル `plan_interest(id, user_id, plan, billing, currency, price_feel, source, created_at)`。
  `plan` は `pro`／`team`、`billing` は `monthly`／`term`、`price_feel` は `high`／`fair`／`low`。
  `source` は `limit_slide`／`limit_story`／`menu`。本人は自分の行を追加・読める。
- 管理者向けの集計は件数のみ（`admin_plan_interest()`）。ユーザーごとに最新の 1 件だけを数える。個別の中身は見えない。
- 画面の文言：「準備中です。まだ課金されません。この料金なら使いたいですか？」。決済済みと誤解させない。

## 5. 画面

- `/pricing`（公開）とプラン比較のダイアログは、同じ比較表（`PlanCards`）。行は AI 相談、スライド作成、Story、コーチにおまかせ、出力、透かし、新機能の優先招待。各行に短い説明を付け、AI 相談が「相談文から AI が切り口を提案する機能」であることを明記する。
- 通貨は USD／JPY／EUR（日本語は円、英語はドルが初期値）。月払いと3か月以上を切り替える。
- 基本の列に「無料で登録する」（ログインしていない時）。有料の列は「この料金なら使いたい」＝関心の記録。
- ヘッダーに「料金」を表示（トップの専用ヘッダー、アプリのヘッダー、フッター）。
- ダイアログが開く時：上限に当たった時（作成・出力・AI 相談・1日の上限）、Story などを押した時、設定メニューの「プランと料金」。

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

## 9. Stripe 連携（段階C・実装済み・テストモードで確認する段階）

方針：課金の「正」は Stripe の購読の状態。アプリは Checkout へ送り、Webhook で届いた状態を `user_plans` に写すだけ。
カード情報はアプリで扱わない。SDK は使わず、`fetch` と署名検証（HMAC）だけで書いた。

商品と価格（テストモードで作成済み。ID は `src/lib/billing/prices.ts`）：
- 商品は Plus と Pro の2つ。価格は プラン × 通貨（USD／EUR／JPY）× 期間（1か月・3か月ごと・12か月ごと）の18個。すべて定期支払い。
- 3か月以上は月額換算の割引価格をまとめて前払い（Plus USD の3か月＝$23.97、12か月＝$95.88。円は ¥2,340／¥9,360。Pro は $44.97／$179.88、¥4,440／¥17,760）。期間ごとに自動更新、解約は期間末。
- 画面で選べるのは通貨と「月払い／3か月以上」だけ。「3か月以上」は3か月ごとの前払い（m3）に一本化した（2026-10-19）。12か月ごとの価格（m12）は Stripe とコードに残してあるが、画面には出していない。
- 本番（live）を作ったら Price ID は別になる。`STRIPE_PRICE_IDS_JSON` で18個を丸ごと差し替える。本番鍵なのに本番の Price ID が無い時は、課金の API が止まる（`prices_not_configured`）。

流れ：
1. 料金表の「このプランで申し込む」→ `POST /api/billing/checkout`（ログイン必須。プラン・通貨・期間を検証し、すでに有効な購読があれば 409）→ Stripe Checkout。誰の購読かは `client_reference_id` と `metadata.user_id`。
2. 支払い後は `/pricing?checkout=success` に戻る。プランの反映は Webhook なので、画面は数回読み直す。
3. `POST /api/stripe/webhook`：署名を検証 → `customer.subscription.created／updated／deleted` と `checkout.session.completed` を処理 → RPC `apply_stripe_subscription`（service_role だけが実行できる）で `billing_subscriptions` と `user_plans` を更新。
4. 契約の管理（解約・支払い方法・請求書）は `POST /api/billing/portal` → Stripe カスタマーポータル。

プランへの反映のルール（DB、`20261020000000_billing.sql`）：
- 有効（`active`／`trialing`／`past_due`）の間は有料プラン。`past_due`（支払いの再試行中）は猶予として維持する。解約・失効（`canceled`／`unpaid`／`incomplete_expired` など）で free に戻る。
- 同じ通知（イベント ID）の二重処理はしない。時刻が古い通知は無視。別の購読の終了通知は、今有効な購読に影響させない。
- 管理画面のメールでのプラン切り替え（`admin_set_plan`）は残る。ただし購読のある人は、次の Webhook で上書きされる。

切り替えのスイッチ：
- `NEXT_PUBLIC_BILLING_ENABLED=1`（画面）と `STRIPE_SECRET_KEY`（サーバー）の両方を入れた時だけ課金が動く。片方だけなら、誤って課金されない（画面は従来の「関心の記録」、API は 503）。

あなたの設定が要るもの（Vercel の環境変数と Stripe のダッシュボード）：
- `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、`SUPABASE_SERVICE_ROLE_KEY`（値はチャットに貼らない）。
- Stripe の Webhook のエンドポイント `https://www.scoach.wonderjapan.studio/api/stripe/webhook` に、`checkout.session.completed`、`customer.subscription.created`、`customer.subscription.updated`、`customer.subscription.deleted` の4つを登録する（`invoice.payment_failed` は不要。支払いの失敗は購読の状態 `past_due` として届く）。
- カスタマーポータルの有効化（解約は期間末）。プランの変更（Plus⇄Pro）はポータルで許す（2026-10-19 に決定）。契約中の人が別のプランのボタンを押すと、「プランを変更する」でポータルへ案内する。変更後は Webhook（`customer.subscription.updated`）が新しい価格からプランを写す。日割りの扱いはポータルの設定に従う（専門家の確認事項）。

残っていること（本番の前）：
- 専門家への確認：特定商取引法の表記ページ、返金・日割り、自動更新の表示、消費税・VAT（商品の税区分は Stripe 上で「Downloadable Software - personal use」のまま。SaaS 系の区分が適切かも含めて確認）、規約・プライバシーの改定。
- Managed Payments の利用可否と、本番アカウントの有効化（事業者情報・本人確認・銀行口座は本人が入力）。
- 本番の商品・価格・Webhook の作り直しと、`STRIPE_PRICE_IDS_JSON` の登録。

## 9. 2026-10-31：Plus 1本にして、Story・コーチにおまかせを隠す
- 価格：Plus は 4.9 USD / 4.9 EUR / 790円（月払い1本。期間割引なし。`PRICES`、`HAS_TERM_DISCOUNT`＝false）。基本（無料）は残す。Pro（team）は料金表・購入に出さない（`OFFERED_PAID_PLANS`）。Pro の値は残してある。
- 隠す：`STORY_COACH_ENABLED`（`lib/ai/plans.ts`。環境変数 `NEXT_PUBLIC_STORY_COACH=1` の時だけ true）。false の間は、入口の「複数枚のStory」「Coachにおまかせ」、Pro の案内、マイページの「ストーリー」タブ、料金表の Story・Coach・新機能の優先招待の行を出さない。コード・データ・保存した Story は消さない。
- 戻す：`git tag story-v1`（隠す直前）。画面に戻すだけなら、Vercel の環境変数 `NEXT_PUBLIC_STORY_COACH=1` を入れて再デプロイ。料金表に Pro を戻す時は、あわせて Pro の価格・期間割引を見直す。
- Stripe：Plus の新しい金額（4.9 USD・4.9 EUR・790円）の月払い Price を3つ作り、`STRIPE_PRICE_IDS_JSON` に `{"pro:USD:m1":"price_…","pro:EUR:m1":"price_…","pro:JPY:m1":"price_…"}` を入れる（ほかのキーは無くてよい）。
