# AI 機能の土台（AI 相談・ヘッダー提案）

2026-09-25 下準備。実装はこれから。コードの下準備は `src/lib/ai/`。

## 1. 何を作るか

| 機能 | 何をするか | 使えるプラン（仮） |
|---|---|---|
| AI 相談（ai_consult） | 伝えたいことの文から、分類（目的・時間の扱い・比較の意味など）を返す。並べ方はこれまでどおりルール（rankRecipes） | 無料から（回数制限つき） |
| ヘッダー提案（ai_headline） | チャートの数字から、スライドのメッセージ案を3つ作る。書いた文を直す | 上位プランだけ |

どちらも同じ土台（サーバー側の呼び出し口・キー・回数・記録）を使う。先に AI 相談を作り、その上にヘッダー提案を足す。

## 2. 流れ

```
画面 ──(文 / 今のスライド)──▶ /api/ai/<機能>（サーバー）
                                ├ ログイン確認 → プランと今月の回数を確認（plans.ts）
                                ├ 相談：文だけを送る
                                │ ヘッダー：表ではなく「事実」だけを送る（facts.ts）
                                ├ AI を呼ぶ（provider.ts。失敗・キーなし → null）
                                ├ 返事を zod で確認（形が違えば null）
                                ├ ヘッダー：数字を事実と照合（number-check.ts / headline.ts）
                                └ 回数を記録（ai_usage）
画面 ◀── 結果（null ならルール版の結果 /「今は使えません」）
```

## 3. 共通の土台

- **キー**：`OPENAI_API_KEY` は `.env.local` と Vercel の環境変数だけに置く。`NEXT_PUBLIC_` を付けない。画面側のコードから `src/lib/ai/provider.ts` を import しない
- **呼び出し口**：`AiProvider.json()` 1つ。モデル名・返答の上限・タイムアウトは `AI_MODELS` にまとめる（モデル名は実装時に最新の一覧と料金を見て決める）
- **失敗した時**：null を返す。相談はルール版の分類に戻る。ヘッダーは「今は使えません」と出し、回数は数えない
- **記録**：機能・モデル・入出力のトークン数・かかった時間・成功/失敗を残す。相談の文やスライドの数字そのものは残さない（費用と品質を見るのに要らない）

## 4. AI 相談

- 返す形はいまの `ConsultationClassification`（classify.ts と同じ項目）。AI は分類だけ、切り口の選択と並べ方はルールのまま。こうするとルール版と AI 版を同じ正解表で比べられる
- 点の測り方：開発セット（cases.ts）と検証セット（cases-validation.ts）で `scoreCase`。検証セットでルール版（16/25）を上回ることが出す条件
- 分類の中で自信が低い項目は UNKNOWN のまま返させる（ハード除外が効きすぎないように）

## 5. ヘッダー提案

### 送るもの
表そのものではなく、アプリが計算した事実（`slideFacts`）。例：

```
- [cagr:中国] 中国 CAGR：13.8%
- [diff:北米] 北米 増減：+110億円
- [rank:cagr:1] CAGR 順位 1位：東南アジア
```

- 事実はデータの形（MATRIX_TIME_SERIES / MEKKO / DRIVER_BRIDGE / BUBBLE）ごとに作る。表の向きは関係ない
- 画面で絞った項目・系列だけ。強調した項目の事実を先に。最大 60 行（費用と要点のため）
- ほかに、レシピの問い、チャートの名前、相手（経営会議など）、相談の文（あれば）

### 受け取るもの
`{ candidates: [{ style: 結論|事実|示唆, text, fact_ids }], note }`。最大3案。

### 確かめること（validateHeadline）
- **数字**：文の中の数字が、事実のどれかの丸めか。年・順位・「3地域」のような数・項目名の中の数字は除く。「約」付きは 5% まで
- **長さ**：日本語は全角換算 60 字、英語は 120 字まで（超えたら注意付きで残す）
- **出どころ**：fact_ids が本当にある事実か
- 数字が合わない案は出さない

**分かっている限界**：数字が事実の「どれか」と合うかしか見ていない。「利益は35億円増えた」のように、別の事実の数字（販売数量の +35）を取り違えても通ってしまう。画面では fact_ids を「根拠」として数字の横に出し、ユーザーが確かめられるようにする。

### 画面（案）
- 「設定」のタイトル欄の横に「AI に提案」ボタン。文が入っている時は「AI に直してもらう」も
- 3案をカードで。型（結論・事実・示唆）のラベル、根拠の事実、「使う」ボタン。使ったあとも自分で直せる。元に戻す（⌘Z）も効く
- 無料プランではボタンに「上位プラン」の印。押すと説明を出す（押しても AI は呼ばない）

### 評価
- サンプル4種（推移・構成・要因・関係）＋ Tai さんの実データ数件で、案を作って点を付ける
  - 機械で見る：数字の合う率、長さ、3つの型がそろうか
  - 人が見る：そのまま使えるか（◎ / 少し直せば使える / 使えない）
- 人が書いたサンプルの見出しは、数字の確認をすべて通ることをテストで確かめ済み（ai.test.ts）

## 6. プランと回数

`src/lib/ai/plans.ts`（回数は仮）：

| | AI 相談 / 月 | ヘッダー / 月 |
|---|---|---|
| free | 20 | 使えない |
| pro | 300 | 200 |
| team | 上限なし | 上限なし |

どのプランでも 1日 200 回で止める（誤作動・不正利用の歯止め）。判定は必ずサーバー側。

### Supabase（実装する時に migration にする。今は実行しない）

```sql
-- プラン：本人は読めるだけ。書き換えるのは管理者か、将来の決済（Stripe）の通知だけ（service role）
create table public.user_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro', 'team')),
  updated_at timestamptz not null default now()
);
alter table public.user_plans enable row level security;
create policy "read own plan" on public.user_plans for select using (auth.uid() = user_id);

-- 回数：本人は読める・足せる。消す・書き換えるはできない（回数を戻せないように）
create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null check (feature in ('ai_consult', 'ai_headline')),
  model text,
  input_tokens int,
  output_tokens int,
  ms int,
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index ai_usage_user_month on public.ai_usage (user_id, feature, created_at);
alter table public.ai_usage enable row level security;
create policy "read own usage" on public.ai_usage for select using (auth.uid() = user_id);
create policy "insert own usage" on public.ai_usage for insert with check (auth.uid() = user_id);
```

- 決済ができるまでは、友人テストの人に `user_plans` を手で付ける（SQL Editor で1行）
- 回数は「今月の ok = true の行数」で数える。失敗は数えない

## 7. 費用の見方

- 1回の量の目安：ヘッダーは入力 1,500〜2,500 トークン（事実 60 行まで）、出力 500 トークンまで。相談は入力 1,000 前後、出力 600 まで
- 実装する時に、選んだモデルの料金でこの量を掛け算して、1回あたり・1人の月あたりを出す（上の回数の上限はそれで決め直す）
- ai_usage に実際のトークン数が残るので、公開後は実績で見直せる

## 8. 実装の順番

1. provider.ts に OpenAI の呼び出しを書く（fetch、タイムアウト、zod での確認）
2. `/api/ai/consult`：ログイン・回数・呼び出し・記録。失敗時はルール版
3. 正解表で AI 版の点を測る（開発・検証の両方）。ルール版を上回ったら画面で使う
4. Supabase に user_plans / ai_usage を追加
5. `/api/ai/headline` と画面（ボタン・3案カード・根拠）
6. ヘッダーの評価（サンプル＋実データ）
7. Vercel に公開して友人テスト（Vercel の環境変数にキー）

## 9. 守ること

- キーは画面・GitHub・チャットに出さない
- 送るのは文と計算済みの事実だけ。ユーザーの表をまるごと送らない
- AI が返したものは、zod と数字の確認を通るまで信用しない
- AI が使えない時も、ルール版だけでアプリが最後まで使えること
