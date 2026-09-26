-- 紹介トップの A/B テストの計測と、ベータ版のフィードバック。
-- 計測：だれでも（未ログインでも）記録だけできる。読めるのは管理者だけ。相談文・データ・メールなどは入れない（列を持たない）。
-- フィードバック：だれでも送れる（画面の API 経由）。読めるのは管理者だけ。メールでの通知は API 側（Resend）で行う。

create table public.ab_events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  experiment  text not null default 'landing_v1' check (char_length(experiment) <= 40),
  variant     text check (variant in ('a', 'b')),
  -- ブラウザごとのランダムな番号（個人は特定しない。同じ人の重複を数えないため）
  visitor     uuid not null,
  event       text not null check (event in (
    'landing_view', 'landing_primary_cta_click', 'landing_examples_click', 'landing_prebuilt_click',
    'start_view', 'start_consultation_selected', 'start_purpose_selected', 'start_chart_library_opened',
    'angle_selection_completed', 'library_opened'
  )),
  -- 目的の識別子など、決まった短い値だけ（trend / comparison …）
  detail      text check (detail is null or detail ~ '^[a-z0-9_,]{1,80}$'),
  logged_in   boolean not null default false
);
create index ab_events_exp_idx on public.ab_events (experiment, event, variant);
alter table public.ab_events enable row level security;
create policy "ab_events: anyone inserts" on public.ab_events for insert to anon, authenticated with check (true);
create policy "ab_events: admin reads" on public.ab_events for select to authenticated using (public.is_admin());
grant insert on public.ab_events to anon, authenticated;
grant select on public.ab_events to authenticated;

create table public.beta_feedback (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  user_id     uuid default auth.uid() references auth.users (id) on delete set null,
  category    text not null check (category in ('bug', 'hard_to_use', 'request', 'other')),
  message     text not null check (char_length(message) between 1 and 4000),
  -- 返信してよい時だけ（任意）
  reply_email text check (reply_email is null or (char_length(reply_email) <= 254 and reply_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  page        text check (page is null or char_length(page) <= 300),
  locale      text check (locale in ('ja', 'en')),
  notified    boolean not null default false
);
create index beta_feedback_created_idx on public.beta_feedback (created_at desc);
alter table public.beta_feedback enable row level security;
-- 送れるのは本人として（未ログインは user_id なし）。他人のふりはできない
create policy "feedback: anyone inserts" on public.beta_feedback for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
create policy "feedback: admin reads" on public.beta_feedback for select to authenticated using (public.is_admin());
create policy "feedback: admin updates" on public.beta_feedback for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant insert on public.beta_feedback to anon, authenticated;
grant select, update on public.beta_feedback to authenticated;

-- A/B の比べ方（管理者が SQL Editor で）：
--   select variant, event, count(distinct visitor) as people
--   from public.ab_events where experiment = 'landing_v1' group by 1, 2 order by 2, 1;
