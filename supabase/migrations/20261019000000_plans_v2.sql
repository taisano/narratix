-- 料金・プランの見直し（20261018 の上書き）。docs/pricing-plan.md
--   基本（無料）：スライド作成 月15枚／出力 月30回（透かしあり）／Story なし／AI 相談 累計5回（AI 相談の回数は TS 側）
--   Plus        ：スライド作成 月100枚／出力 月200回（透かしなし）／Story なし
--   Pro         ：スライド作成・出力 無制限／Story とコーチにおまかせ／新機能の優先招待
-- ・「スライド作成」＝新しく保存したチャート（make_counts の slide）。同じ成果物は数え直さない。数える期間は暦の月（UTC）。
-- ・「出力」＝PPT の書き出し1回（ai_usage の ppt_export）。上限を超えると出せない。透かしは基本プランだけ（アプリ側で、返す plan_id を見て決める）。
-- ・何度流しても同じ結果になる書き方。

alter table public.plan_settings add column if not exists plus_slide_limit int not null default 100 check (plus_slide_limit >= 0);
alter table public.plan_settings add column if not exists free_export_limit int not null default 30 check (free_export_limit >= 0);
alter table public.plan_settings add column if not exists plus_export_limit int not null default 200 check (plus_export_limit >= 0);
alter table public.plan_settings alter column free_slide_limit set default 15;
alter table public.plan_settings drop column if exists free_story_limit;
update public.plan_settings set free_slide_limit = 15, plus_slide_limit = 100, free_export_limit = 30, plus_export_limit = 200 where id;

-- 関心の「どこから」に、出力と AI 相談の上限を足す
alter table public.plan_interest drop constraint if exists plan_interest_source_check;
alter table public.plan_interest add constraint plan_interest_source_check
  check (source in ('limit_slide', 'limit_story', 'limit_export', 'limit_consult', 'menu', 'pricing'));

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
  if p_kind = 'story' then
    if v_plan <> 'team' then raise exception 'plan_limit:story'; end if;
  else
    select count(*) into v_used from public.make_counts where user_id = v_uid and kind = 'slide' and created_at >= date_trunc('month', now());
    v_limit := case v_plan when 'free' then v_set.free_slide_limit when 'pro' then v_set.plus_slide_limit else null end;
    if v_limit is not null and v_used >= v_limit then raise exception 'plan_limit:slide'; end if;
  end if;
  select count(*) into v_day from public.make_counts where user_id = v_uid and kind = p_kind and created_at > now() - interval '1 day';
  v_limit := case when p_kind = 'slide' then v_set.daily_slide else v_set.daily_story end;
  if v_day >= v_limit then raise exception 'plan_limit:daily'; end if;
  insert into public.make_counts (user_id, kind, ref_id) values (v_uid, p_kind, p_ref);
end $$;

-- 画面の「今月の残り」用。limit が null なら無制限、0 なら使えない
create or replace function public.my_make_usage() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_plan text; v_set public.plan_settings; v_sl int; v_st int; v_ex int;
begin
  if v_uid is null then return null; end if;
  select coalesce((select plan from public.user_plans where user_id = v_uid), 'free') into v_plan;
  if exists (select 1 from public.app_admins where user_id = v_uid) then v_plan := 'team'; end if;
  select * into v_set from public.plan_settings where id;
  select count(*) filter (where kind = 'slide'), count(*) filter (where kind = 'story') into v_sl, v_st
    from public.make_counts where user_id = v_uid and created_at >= date_trunc('month', now());
  select count(*) into v_ex from public.ai_usage
   where public.ai_usage.user_id = v_uid and public.ai_usage.feature = 'ppt_export' and public.ai_usage.ok and public.ai_usage.created_at >= date_trunc('month', now());
  return jsonb_build_object('plan', v_plan,
    'slide', jsonb_build_object('used', v_sl, 'limit', case v_plan when 'free' then v_set.free_slide_limit when 'pro' then v_set.plus_slide_limit else null end),
    'story', jsonb_build_object('used', v_st, 'limit', case v_plan when 'team' then null else 0 end),
    'export', jsonb_build_object('used', v_ex, 'limit', case v_plan when 'free' then v_set.free_export_limit when 'pro' then v_set.plus_export_limit else null end));
end $$;

-- PPT の書き出し：登録した（active）人と管理者だけ。月の回数を超えたら出せない。plan_id は透かしの出し分けに使う
drop function if exists public.record_ppt_export(int);
create function public.record_ppt_export(p_limit int)
returns table (allowed boolean, used int, plan_id text, limit_n int)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_used int;
  v_admin boolean;
  v_plan text;
  v_set public.plan_settings;
  v_limit int;
begin
  if v_uid is null then return query select false, 0, 'free'::text, null::int; return; end if;
  v_admin := exists (select 1 from public.app_admins a where a.user_id = v_uid);
  if not v_admin and not exists (select 1 from public.beta_members m where m.user_id = v_uid and m.status = 'active') then
    return query select false, 0, 'free'::text, null::int; return;
  end if;
  perform pg_advisory_xact_lock(hashtext(v_uid::text || ':ppt'));
  v_plan := case when v_admin then 'team' else coalesce((select p.plan from public.user_plans p where p.user_id = v_uid), 'free') end;
  select * into v_set from public.plan_settings s where s.id;
  select count(*) into v_used from public.ai_usage u
   where u.user_id = v_uid and u.feature = 'ppt_export' and u.ok and u.created_at >= date_trunc('month', now());
  v_limit := case v_plan when 'free' then v_set.free_export_limit when 'pro' then v_set.plus_export_limit else null end;
  if v_limit is not null and v_used >= v_limit then return query select false, v_used, v_plan, v_limit; return; end if;
  insert into public.ai_usage (user_id, feature, ok) values (v_uid, 'ppt_export', true);
  return query select true, v_used + 1, v_plan, v_limit;
end $$;
revoke all on function public.record_ppt_export(int) from public;
grant execute on function public.record_ppt_export(int) to authenticated;

-- 管理者：無料枠・Plus の回数を変える（スライド作成は月、出力は月）
drop function if exists public.admin_set_plan_limits(int, int);
create or replace function public.admin_set_plan_limits(p_free_slide int, p_plus_slide int, p_free_export int, p_plus_export int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if least(coalesce(p_free_slide, -1), coalesce(p_plus_slide, -1), coalesce(p_free_export, -1), coalesce(p_plus_export, -1)) < 0
     or greatest(p_free_slide, p_plus_slide, p_free_export, p_plus_export) > 100000 then raise exception 'bad limits'; end if;
  update public.plan_settings set free_slide_limit = p_free_slide, plus_slide_limit = p_plus_slide,
    free_export_limit = p_free_export, plus_export_limit = p_plus_export, updated_at = now() where id;
end $$;
revoke all on function public.admin_set_plan_limits(int, int, int, int) from public, anon;
grant execute on function public.admin_set_plan_limits(int, int, int, int) to authenticated;
