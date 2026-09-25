-- 提案へのフィードバック（② の 👍／👎・理由・コメント）。正解表を増やす材料にする。
-- 本人は自分の行だけ書ける・読める（RLS）。全体は Supabase のダッシュボード（管理者）で見る。

create table public.recommendation_feedback (
  id                      uuid primary key default gen_random_uuid(),
  owner_id                uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at              timestamptz not null default now(),
  entry_mode              text not null check (entry_mode in ('CONSULTATION', 'PURPOSE', 'CHART')),
  consultation_text       text check (char_length(consultation_text) <= 4000),
  classification          jsonb,
  recommended_recipe_ids  text[] not null default '{}',
  chosen_recipe_ids       text[] not null default '{}',
  rating                  text not null check (rating in ('up', 'down')),
  reasons                 text[] not null default '{}',
  comment                 text check (char_length(comment) <= 2000),
  recommendation_version  text not null,
  classifier              text not null default 'rules'
);
create index recommendation_feedback_owner_idx on public.recommendation_feedback (owner_id);
create index recommendation_feedback_created_idx on public.recommendation_feedback (created_at desc);

alter table public.recommendation_feedback enable row level security;

create policy "feedback: insert own" on public.recommendation_feedback
  for insert to authenticated with check (owner_id = auth.uid());
create policy "feedback: read own" on public.recommendation_feedback
  for select to authenticated using (owner_id = auth.uid());
