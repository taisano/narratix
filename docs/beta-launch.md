# ベータ版（Slide Story Coach）の運用メモ

## 仕組み
- 入り口（新しく作る）は誰でも使える。「目的から選ぶ」「チャートから選ぶ」は登録なしで②まで進める。
- 「言いたいことから相談」・エディター・マイページは、無料のベータ登録をした人（beta_members.status = 'active'）だけ。
- 登録：メールアドレス（2回）＋パスワード（8文字以上）＋利用条件への同意（必須）＋お知らせメール（任意）→ そのままログインして join_beta。メールは送らない（Supabase の「メール確認」をオフ）。
- パスワードを忘れた時だけ、設定し直すリンクをメールで送る（Supabase 標準の送信は1時間2通まで）。メールのリンクで登録した人は、ヘッダーの「パスワード」から設定できる。
- 先着 1000 人（beta_settings.cap）。それ以降は順番待ち（status = 'waitlist'）。
- 無料：AI 相談 月10回、PPT 出力 月10回（DB の record_ppt_export で数える）。PPT の各スライド右下に「Made with Slide Story Coach (Beta)」。

## 管理者がよく使う SQL（Supabase の SQL Editor）

```sql
-- 登録者数
select status, count(*) from public.beta_members group by status;

-- お知らせメールを受け取る人のメールアドレス（本サイト公開の案内に使う）
select email, joined_at from public.beta_members where email_opt_in order by joined_at;

-- 枠を増やす（例：1500人）
update public.beta_settings set cap = 1500;

-- 順番待ちの人を、古い順に N 人 active にする（例：50人）
update public.beta_members set status = 'active'
 where user_id in (select user_id from public.beta_members where status = 'waitlist' order by joined_at limit 50);

-- 特定の人を上位プランにする（回数の上限なし）
insert into public.user_plans (user_id, plan) select id, 'pro' from auth.users where email = 'someone@example.com'
  on conflict (user_id) do update set plan = excluded.plan, updated_at = now();
```

## 公開前に Supabase でやること
1. SQL：migrations の未実行分（20260926 ai_usage、20260927 consultation_history、20260928 beta）を順に実行
2. Authentication → URL Configuration：Site URL を公開先（例：https://xxxx.vercel.app）に。Redirect URLs に `https://xxxx.vercel.app/**` と `http://localhost:3000/**`
3. Authentication → SMTP：自前のメール送信（Resend など）を設定する。Supabase 既定の送信は1時間に数通までしか送れず、友人に配ると届かなくなる
4. Authentication → Email Templates：件名・本文を Slide Story Coach 向けに（任意）

## 注意
- メール確認をしないので、打ち間違い・他人のメールアドレスでも登録できる（2回入力で打ち間違いは減らしている）。お知らせを送る前に、確認メールを1回送ると確実。
- PPT の回数はブラウザから DB の関数を呼んで数えている。開発者ツールで回避することはできてしまう（ベータでは許容）。
- 利用条件・プライバシーの文は要点だけの簡易版。本公開の前に専門家に見てもらう。
