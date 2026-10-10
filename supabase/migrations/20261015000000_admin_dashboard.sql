-- 管理画面のダッシュボード用の集計。管理者（is_admin）だけが呼べる。返すのは件数だけ（タイトル・表の中身・相談文・メールは読まない）。
-- 日付は日本時間。「使った人」は、ログイン中の操作の記録（AI 利用・相談・チャートの保存・PPT の出力・チャートの作成）がある人。
-- 何度流しても同じ結果になる書き方（create or replace）。

create or replace function public.admin_dashboard()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v jsonb;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;

  with
  act as (
    select user_id as u, (created_at at time zone 'Asia/Tokyo')::date as d from public.ai_usage
    union all select owner_id, (created_at at time zone 'Asia/Tokyo')::date from public.consultation_history
    union all select created_by, (created_at at time zone 'Asia/Tokyo')::date from public.deck_versions
    union all select created_by, (created_at at time zone 'Asia/Tokyo')::date from public.deck_exports
    union all select created_by, (created_at at time zone 'Asia/Tokyo')::date from public.decks
  ),
  days as (select generate_series(v_today - 29, v_today, interval '1 day')::date as d),
  months as (select (date_trunc('month', v_today::timestamp) - (i || ' months')::interval)::date as m from generate_series(0, 5) i),
  live_decks as (select working from public.decks where deleted_at is null),
  occ as (select coalesce(nullif(split_part(occupation, ':', 1), ''), 'unknown') as k from public.beta_members),
  ref as (select coalesce(nullif(split_part(referral, ':', 1), ''), 'unknown') as k from public.beta_members)
  select jsonb_build_object(
    'generated_at', now(),
    'members', jsonb_build_object(
      'total', (select count(*) from public.beta_members),
      'active', (select count(*) from public.beta_members where status = 'active'),
      'waitlist', (select count(*) from public.beta_members where status = 'waitlist')),
    'signups_daily', (select coalesce(jsonb_agg(jsonb_build_object('d', days.d, 'n', (select count(*) from public.beta_members b where (b.joined_at at time zone 'Asia/Tokyo')::date = days.d)) order by days.d), '[]') from days),
    'dau', (select coalesce(jsonb_agg(jsonb_build_object('d', days.d, 'n', (select count(distinct u) from act where act.d = days.d)) order by days.d), '[]') from days),
    'mau', (select coalesce(jsonb_agg(jsonb_build_object('m', months.m, 'n', (select count(distinct u) from act where act.d >= months.m and act.d < (months.m + interval '1 month')::date)) order by months.m), '[]') from months),
    'active_30d', (select count(distinct u) from act where d > v_today - 30),
    'active_7d', (select count(distinct u) from act where d > v_today - 7),
    'by_occupation', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc, k), '[]') from (select k, count(*) n from occ group by k) x),
    'by_referral', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc, k), '[]') from (select k, count(*) n from ref group by k) x),
    'decks', jsonb_build_object(
      'charts', (select count(*) from public.decks where deleted_at is null and kind = 'chart'),
      'stories', (select count(*) from public.decks where deleted_at is null and kind = 'story')),
    'slides_by_chart', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc, k), '[]')
      from (select s -> 'view' ->> 'chart' as k, count(*) n from live_decks, jsonb_array_elements(case when jsonb_typeof(working -> 'slides') = 'array' then working -> 'slides' else '[]'::jsonb end) s
            where s -> 'view' ->> 'chart' is not null group by 1) x),
    -- 入口で選んだ作り方（1枚／Story／コーチにお任せ）。ab_events の件数（ログイン前後どちらも）
    'creation_modes', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc, k), '[]')
      from (select detail as k, count(*) n from public.ab_events where event = 'start_consultation_selected' and detail is not null group by 1) x),
    'usage', jsonb_build_object(
      'consults', (select count(*) from public.consultation_history),
      'ai_consults', (select count(*) from public.ai_usage where feature = 'ai_consult' and ok),
      'ppt_exports', (select count(*) from public.ai_usage where feature = 'ppt_export' and ok))
  ) into v;
  return v;
end $$;
revoke all on function public.admin_dashboard() from public;
grant execute on function public.admin_dashboard() to authenticated;
