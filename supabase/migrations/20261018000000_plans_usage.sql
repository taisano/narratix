-- 料金・プランの段階A（決済なし）。docs/pricing-plan.md
-- ・無料（基本）の枠：1枚スライド 累計10回、Story 累計3回。「1回」＝新しくチャートを保存した／Storyを作った／PPTを書き出した成果物 1件。
--   同じ成果物を直しても、もう一度保存・書き出しても、数え直さない（make_counts は (本人, 種類, 成果物) で1行）。
-- ・Plus（user_plans.plan='pro'）：1枚は公正利用の範囲で無制限、Story は不可。Pro（'team'）：どちらも可。管理者は数えない。
-- ・数えるのは保存の入口（save_deck_state / append_deck_export）の中。上限を超えると 'plan_limit:slide' / 'plan_limit:story' / 'plan_limit:daily' の例外で保存ごと止まる。
-- ・関心と価格感（plan_interest）を集める。管理者には件数だけを返す。
-- 何度流しても同じ結果になる書き方。

create table if not exists public.plan_settings (
  id               boolean primary key default true check (id),
  free_slide_limit int not null default 10 check (free_slide_limit >= 0),
  free_story_limit int not null default 3  check (free_story_limit >= 0),
  daily_slide      int not null default 50 check (daily_slide >= 1),
  daily_story      int not null default 20 check (daily_story >= 1),
  counts_from      timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
insert into public.plan_settings (id) values (true) on conflict (id) do nothing;
alter table public.plan_settings enable row level security;
drop policy if exists "plan settings: read" on public.plan_settings;
create policy "plan settings: read" on public.plan_settings for select to anon, authenticated using (true);
grant select on public.plan_settings to anon, authenticated;

create table if not exists public.make_counts (
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('slide', 'story')),
  ref_id     uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, ref_id)
);
create index if not exists make_counts_user_created_idx on public.make_counts (user_id, kind, created_at desc);
alter table public.make_counts enable row level security;
drop policy if exists "make counts: read own" on public.make_counts;
create policy "make counts: read own" on public.make_counts for select to authenticated using (user_id = auth.uid());
grant select on public.make_counts to authenticated;

create table if not exists public.plan_interest (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan       text not null check (plan in ('pro', 'team')),
  billing    text not null check (billing in ('monthly', 'term')),
  currency   text not null check (currency in ('USD', 'JPY', 'EUR')),
  price_feel text check (price_feel in ('high', 'fair', 'low')),
  source     text not null check (source in ('limit_slide', 'limit_story', 'menu', 'pricing')),
  created_at timestamptz not null default now()
);
create index if not exists plan_interest_user_idx on public.plan_interest (user_id, created_at desc);
alter table public.plan_interest enable row level security;
drop policy if exists "plan interest: read own" on public.plan_interest;
drop policy if exists "plan interest: insert own" on public.plan_interest;
create policy "plan interest: read own" on public.plan_interest for select to authenticated using (user_id = auth.uid());
create policy "plan interest: insert own" on public.plan_interest for insert to authenticated with check (user_id = auth.uid());
grant select, insert on public.plan_interest to authenticated;

-- 1件数える。上限を超えるなら例外（呼んだ側の保存ごと取り消される）。同じ成果物は数え直さない
create or replace function public.consume_make(p_kind text, p_ref uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_plan text;
  v_set public.plan_settings;
  v_used int;
  v_day int;
  v_limit int;
begin
  if v_uid is null then return; end if;
  if p_kind not in ('slide', 'story') then raise exception 'bad kind'; end if;
  if exists (select 1 from public.app_admins where user_id = v_uid) then return; end if;
  perform pg_advisory_xact_lock(hashtext(v_uid::text || ':make'));
  if exists (select 1 from public.make_counts where user_id = v_uid and kind = p_kind and ref_id = p_ref) then return; end if;
  select coalesce((select plan from public.user_plans where user_id = v_uid), 'free') into v_plan;
  select * into v_set from public.plan_settings where id;
  select count(*) into v_used from public.make_counts where user_id = v_uid and kind = p_kind and created_at >= v_set.counts_from;
  select count(*) into v_day from public.make_counts where user_id = v_uid and kind = p_kind and created_at > now() - interval '1 day';
  if v_plan = 'free' then
    v_limit := case when p_kind = 'slide' then v_set.free_slide_limit else v_set.free_story_limit end;
    if v_used >= v_limit then raise exception 'plan_limit:%', p_kind; end if;
  elsif v_plan = 'pro' and p_kind = 'story' then
    raise exception 'plan_limit:story';
  end if;
  v_limit := case when p_kind = 'slide' then v_set.daily_slide else v_set.daily_story end;
  if v_day >= v_limit then raise exception 'plan_limit:daily'; end if;
  insert into public.make_counts (user_id, kind, ref_id) values (v_uid, p_kind, p_ref);
end $$;
revoke all on function public.consume_make(text, uuid) from public, anon;
grant execute on function public.consume_make(text, uuid) to authenticated;

-- 画面の「残り n/10」用。limit が null なら無制限、0 なら使えない
create or replace function public.my_make_usage() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_plan text; v_set public.plan_settings; v_admin boolean; v_sl int; v_st int;
begin
  if v_uid is null then return null; end if;
  v_admin := exists (select 1 from public.app_admins where user_id = v_uid);
  select coalesce((select plan from public.user_plans where user_id = v_uid), 'free') into v_plan;
  if v_admin then v_plan := 'team'; end if;
  select * into v_set from public.plan_settings where id;
  select count(*) filter (where kind = 'slide'), count(*) filter (where kind = 'story') into v_sl, v_st
    from public.make_counts where user_id = v_uid and created_at >= v_set.counts_from;
  return jsonb_build_object('plan', v_plan,
    'slide', jsonb_build_object('used', v_sl, 'limit', case when v_plan = 'free' then v_set.free_slide_limit else null end),
    'story', jsonb_build_object('used', v_st, 'limit', case v_plan when 'free' then v_set.free_story_limit when 'pro' then 0 else null end));
end $$;
revoke all on function public.my_make_usage() from public, anon;
grant execute on function public.my_make_usage() to authenticated;

-- 保存の入口：新しいStory／チャートの版を作る時に数える（自動保存の下書きは数えない）
create or replace function public.save_deck_state(
  p_deck_id                uuid,
  p_kind                   text,
  p_name                   text,
  p_lang                   text,
  p_user_tags              text[],
  p_working                jsonb,
  p_content                jsonb,
  p_create_version         boolean,
  p_reason                 text,
  p_copied_from_deck_id    uuid default null,
  p_copied_from_version_id uuid default null
) returns table (saved_id uuid, saved_version integer, saved_version_id uuid)
language plpgsql security invoker set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_workspace uuid;
  v_id uuid := p_deck_id;
  v_current uuid;
  v_version integer := 0;
  v_version_id uuid;
  v_make_version boolean := coalesce(p_create_version, false);
  v_reason text := coalesce(p_reason, 'save');
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  if v_id is null then
    select w.id into v_workspace from public.workspaces w
      where w.kind = 'personal' and public.is_workspace_member(w.id)
      order by w.created_at limit 1;
    if v_workspace is null then raise exception 'personal workspace not found' using errcode = 'P0002'; end if;
    insert into public.decks
      (workspace_id, kind, name, lang, user_tags, working, copied_from_deck_id, copied_from_version_id)
      values (v_workspace, p_kind, left(coalesce(p_name, ''), 300), coalesce(p_lang, 'ja'), coalesce(p_user_tags, '{}'), p_working,
        p_copied_from_deck_id, p_copied_from_version_id)
      returning id, current_version_id into v_id, v_current;
    if p_kind = 'story' then perform public.consume_make('story', v_id); end if;
  else
    select d.workspace_id, d.current_version_id into v_workspace, v_current
      from public.decks d where d.id = v_id and d.kind = p_kind and d.deleted_at is null;
    if v_workspace is null then raise exception 'deck not found' using errcode = 'P0002'; end if;
    update public.decks set
      name = case when p_name is null then name else left(p_name, 300) end,
      lang = coalesce(p_lang, lang), user_tags = coalesce(p_user_tags, user_tags), working = p_working
      where id = v_id;
  end if;

  -- Storyは最初と30分ごとにも版を作る。それ以外の自動保存はworkingだけを書き換える。
  if p_kind = 'story' and not v_make_version then
    if v_current is null or not exists (
      select 1 from public.deck_versions v
      where v.id = v_current and v.created_at > now() - interval '30 minutes'
    ) then
      v_make_version := true;
      v_reason := case when v_current is null then 'save' else 'interval' end;
    end if;
  end if;

  if v_make_version then
    if p_kind = 'chart' then perform public.consume_make('slide', v_id); end if;
    select coalesce(max(v.version), 0) + 1 into v_version
      from public.deck_versions v where v.deck_id = v_id;
    insert into public.deck_versions (deck_id, workspace_id, version, reason, content)
      values (v_id, v_workspace, v_version, v_reason, p_content)
      returning id into v_version_id;
    update public.decks set current_version_id = v_version_id where id = v_id;
  elsif v_current is not null then
    select v.version into v_version from public.deck_versions v where v.id = v_current;
    v_version_id := v_current;
  end if;

  return query select v_id, v_version, v_version_id;
end $$;

-- PPT の書き出し：まだ数えていない成果物ならここで数える
create or replace function public.append_deck_export(p_deck_id uuid, p_content jsonb)
returns table (saved_version integer, saved_version_id uuid)
language plpgsql security invoker set search_path = public as $$
declare
  v_workspace uuid;
  v_kind text;
  v_version integer;
  v_version_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select d.workspace_id, d.kind into v_workspace, v_kind from public.decks d
    where d.id = p_deck_id and d.deleted_at is null;
  if v_workspace is null then raise exception 'deck not found' using errcode = 'P0002'; end if;
  perform public.consume_make(case when v_kind = 'story' then 'story' else 'slide' end, p_deck_id);
  select coalesce(max(v.version), 0) + 1 into v_version from public.deck_versions v where v.deck_id = p_deck_id;
  insert into public.deck_versions (deck_id, workspace_id, version, reason, content)
    values (p_deck_id, v_workspace, v_version, 'ppt_export', p_content)
    returning id into v_version_id;
  update public.decks set current_version_id = v_version_id where id = p_deck_id;
  insert into public.deck_exports (workspace_id, deck_id, deck_version_id)
    values (v_workspace, p_deck_id, v_version_id);
  return query select v_version, v_version_id;
end $$;

-- 関心と価格感（本人が送る。決済はまだない）
create or replace function public.record_plan_interest(p_plan text, p_billing text, p_currency text, p_price_feel text, p_source text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  insert into public.plan_interest (user_id, plan, billing, currency, price_feel, source)
    values (auth.uid(), p_plan, p_billing, p_currency, nullif(p_price_feel, ''), p_source);
end $$;
revoke all on function public.record_plan_interest(text, text, text, text, text) from public, anon;
grant execute on function public.record_plan_interest(text, text, text, text, text) to authenticated;

-- 管理者向けの集計（件数だけ。ユーザーごとに最新の1件を数える）
create or replace function public.admin_plan_interest() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  with latest as (
    select distinct on (user_id) * from public.plan_interest order by user_id, created_at desc)
  select jsonb_build_object(
    'users', (select count(*) from latest),
    'byPlan', (select coalesce(jsonb_object_agg(plan, n), '{}') from (select plan, count(*) n from latest group by plan) x),
    'byFeel', (select coalesce(jsonb_agg(jsonb_build_object('plan', plan, 'feel', coalesce(price_feel, 'none'), 'currency', currency, 'n', n) order by plan, currency, price_feel), '[]')
      from (select plan, price_feel, currency, count(*) n from latest group by plan, price_feel, currency) x),
    'bySource', (select coalesce(jsonb_object_agg(source, n), '{}') from (select source, count(*) n from latest group by source) x),
    'byBilling', (select coalesce(jsonb_object_agg(billing, n), '{}') from (select billing, count(*) n from latest group by billing) x))
  into v;
  return v;
end $$;
revoke all on function public.admin_plan_interest() from public, anon;
grant execute on function public.admin_plan_interest() to authenticated;

-- 管理者：プランの手動切り替え（段階B：手動入金の運用）。メールで探す。見つからなければ false
create or replace function public.admin_set_plan(p_email text, p_plan text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_plan not in ('free', 'pro', 'team') then raise exception 'bad plan'; end if;
  select id into v_uid from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_uid is null then return false; end if;
  insert into public.user_plans (user_id, plan, updated_at) values (v_uid, p_plan, now())
    on conflict (user_id) do update set plan = excluded.plan, updated_at = now();
  return true;
end $$;
revoke all on function public.admin_set_plan(text, text) from public, anon;
grant execute on function public.admin_set_plan(text, text) to authenticated;

-- 管理者：有料プランの人の一覧（切り替えの確認用）と、プランごとの人数
create or replace function public.admin_list_plans() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  return jsonb_build_object(
    'paid', (select coalesce(jsonb_agg(jsonb_build_object('email', u.email, 'plan', p.plan, 'at', p.updated_at) order by p.updated_at desc), '[]')
      from public.user_plans p join auth.users u on u.id = p.user_id where p.plan <> 'free'),
    'settings', (select to_jsonb(s) - 'id' from public.plan_settings s where s.id));
end $$;
revoke all on function public.admin_list_plans() from public, anon;
grant execute on function public.admin_list_plans() to authenticated;

-- 管理者：無料枠の回数を変える
create or replace function public.admin_set_plan_limits(p_slide int, p_story int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_slide is null or p_story is null or p_slide < 0 or p_story < 0 or p_slide > 100000 or p_story > 100000 then raise exception 'bad limits'; end if;
  update public.plan_settings set free_slide_limit = p_slide, free_story_limit = p_story, updated_at = now() where id;
end $$;
revoke all on function public.admin_set_plan_limits(int, int) from public, anon;
grant execute on function public.admin_set_plan_limits(int, int) to authenticated;

-- 計測できるイベントの一覧を、アプリ側（src/lib/ab/track.ts の TrackEvent）に合わせ直す。
-- 一覧に無いイベントは DB が受け付けないため、追加したイベント（入口の3つの入口・1枚スライド・料金）も含めて入れ直す。
alter table public.ab_events drop constraint if exists ab_events_event_check;
alter table public.ab_events add constraint ab_events_event_check check (event in (
  'landing_view', 'landing_primary_cta_click', 'landing_examples_click', 'landing_prebuilt_click',
  'start_view', 'start_consultation_selected', 'start_purpose_selected', 'start_chart_library_opened',
  'angle_selection_completed', 'library_opened', 'editor_opened', 'my_page_opened',
  'quick_edit_opened', 'quick_edit_saved', 'quick_edit_exported', 'coach_emphasis_shown',
  'coach_emphasis_selected', 'coach_emphasis_inferred', 'coach_lead_shown', 'coach_lead_accepted',
  'coach_alternatives_opened', 'coach_alternative_previewed', 'coach_lead_replaced', 'coach_supplement_added',
  'coach_ai_rerun', 'story_scope_answered', 'story_scope_switched', 'story_started',
  'entry_mode_shown', 'entry_mode_clicked', 'entry_mode_outcome', 'plans_open',
  'pricing_view', 'one_question_selected', 'one_presentation_selected', 'one_started',
  'reconsult_confirm'
));
