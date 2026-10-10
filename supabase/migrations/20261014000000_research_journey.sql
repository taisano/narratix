-- 利用の流れの収集（研究・改善用）。同意した人だけ。設計：docs/research-data-collection-design.md
-- ・research_consent：本人の同意（初期は false＝オプトイン）。本人だけが読める。変更は set_research_opt_in 経由。
-- ・research_anon_map：user_id ↔ anon_id の対応表。誰も直接読めない（RLS を有効にして方針を作らない）。
-- ・journey_events：分析用の記録。user_id は持たない。読めるのは管理者（is_admin）だけ。書き込みは log_journey だけ。
-- 何度流しても同じ結果になる書き方にしている。

create table if not exists public.research_consent (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  opted_in   boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.research_consent enable row level security;
drop policy if exists "research_consent: read own" on public.research_consent;
create policy "research_consent: read own" on public.research_consent for select to authenticated using (user_id = auth.uid());
revoke all on public.research_consent from anon, authenticated;
grant select on public.research_consent to authenticated;

create table if not exists public.research_anon_map (
  user_id uuid primary key references auth.users (id) on delete cascade,
  anon_id uuid not null unique default gen_random_uuid()
);
alter table public.research_anon_map enable row level security;
revoke all on public.research_anon_map from anon, authenticated;

create table if not exists public.journey_events (
  id          bigint generated always as identity primary key,
  anon_id     uuid not null,
  occurred_at timestamptz not null default now(),
  session_id  text check (session_id is null or char_length(session_id) <= 64),
  kind        text not null check (char_length(kind) between 1 and 60),
  payload     jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 16000),
  occupation  text,
  referral    text,
  joined_week date
);
create index if not exists journey_events_anon_idx on public.journey_events (anon_id, occurred_at);
create index if not exists journey_events_kind_idx on public.journey_events (kind, occurred_at);
alter table public.journey_events enable row level security;
drop policy if exists "journey_events: admin read" on public.journey_events;
create policy "journey_events: admin read" on public.journey_events for select to authenticated using (public.is_admin());
revoke all on public.journey_events from anon, authenticated;
grant select on public.journey_events to authenticated;

-- 同意の変更。同意したら対応表に anon_id を作る。外した時は、新しい記録を書かなくなるだけ（すでにある分は delete_my_research_data で消せる）
create or replace function public.set_research_opt_in(p_opt_in boolean)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  insert into public.research_consent (user_id, opted_in, updated_at) values (v_uid, coalesce(p_opt_in, false), now())
    on conflict (user_id) do update set opted_in = excluded.opted_in, updated_at = now();
  if coalesce(p_opt_in, false) then
    insert into public.research_anon_map (user_id) values (v_uid) on conflict (user_id) do nothing;
  end if;
  return coalesce(p_opt_in, false);
end $$;
revoke all on function public.set_research_opt_in(boolean) from public;
grant execute on function public.set_research_opt_in(boolean) to authenticated;

-- 流れの記録。同意していない人・未ログインの人は、何も書かずに false を返す
create or replace function public.log_journey(p_kind text, p_payload jsonb default '{}'::jsonb, p_session text default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_anon uuid;
  v_occ text;
  v_ref text;
  v_week date;
begin
  if v_uid is null then return false; end if;
  if not coalesce((select opted_in from public.research_consent where user_id = v_uid), false) then return false; end if;
  select anon_id into v_anon from public.research_anon_map where user_id = v_uid;
  if v_anon is null then return false; end if;
  -- 「その他」の自由記入（other:…）は分析用には持ち込まない
  select split_part(occupation, ':', 1), split_part(referral, ':', 1), date_trunc('week', terms_agreed_at)::date
    into v_occ, v_ref, v_week from public.beta_members where user_id = v_uid;
  insert into public.journey_events (anon_id, session_id, kind, payload, occupation, referral, joined_week)
    values (v_anon, left(p_session, 64), p_kind, coalesce(p_payload, '{}'::jsonb), v_occ, v_ref, v_week);
  return true;
end $$;
revoke all on function public.log_journey(text, jsonb, text) from public;
grant execute on function public.log_journey(text, jsonb, text) to authenticated;

-- 自分の記録を消す（同意も外す）。対応表も消すので、あとで同意し直すと別の anon_id になる
create or replace function public.delete_my_research_data()
returns int
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_anon uuid; v_n int := 0;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select anon_id into v_anon from public.research_anon_map where user_id = v_uid;
  if v_anon is not null then
    delete from public.journey_events where anon_id = v_anon;
    get diagnostics v_n = row_count;
    delete from public.research_anon_map where user_id = v_uid;
  end if;
  insert into public.research_consent (user_id, opted_in, updated_at) values (v_uid, false, now())
    on conflict (user_id) do update set opted_in = false, updated_at = now();
  return v_n;
end $$;
revoke all on function public.delete_my_research_data() from public;
grant execute on function public.delete_my_research_data() to authenticated;
