-- AI 機能のプランと使った回数（docs/ai-foundation.md 6章）。
-- プラン：本人は読めるだけ。書き換えるのは管理者（SQL Editor）か、将来の決済の通知（service role）だけ。行が無ければ free。
-- 回数：本人は読める・足せる。消す・書き換えるはできない（回数を戻せないように）。相談の文や返事の中身は残さない。

create table public.user_plans (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  plan        text not null default 'free' check (plan in ('free', 'pro', 'team')),
  updated_at  timestamptz not null default now()
);
alter table public.user_plans enable row level security;
create policy "plans: read own" on public.user_plans
  for select to authenticated using (user_id = auth.uid());
grant select on public.user_plans to authenticated;

create table public.ai_usage (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  feature        text not null check (feature in ('ai_consult', 'ai_headline')),
  model          text,
  input_tokens   int not null default 0 check (input_tokens >= 0),
  output_tokens  int not null default 0 check (output_tokens >= 0),
  ms             int,
  ok             boolean not null,
  reason         text,
  created_at     timestamptz not null default now()
);
create index ai_usage_user_feature_created_idx on public.ai_usage (user_id, feature, created_at desc);
alter table public.ai_usage enable row level security;
create policy "ai usage: read own" on public.ai_usage
  for select to authenticated using (user_id = auth.uid());
create policy "ai usage: insert own" on public.ai_usage
  for insert to authenticated with check (user_id = auth.uid());
grant select, insert on public.ai_usage to authenticated;
