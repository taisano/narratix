-- ベータ版の枠を、まず先着 100 名に。超えた人は順番待ち（waitlist）として登録できる（join_beta は変更なし）。
-- ・枠の変更は管理画面から：admin_set_beta_cap(n)。枠を増やすと、順番待ちを登録の早い順に自動で繰り上げる。
-- ・admin_beta_overview()：枠・利用中・順番待ちの人数と、順番待ちの一覧（メールは含めない）。
-- ・beta_capacity()：だれでも（未ログインでも）枠と満員かを見られる。人数だけで、個人は返さない。
-- ・my_waitlist_position()：本人の順番待ちの順位。
-- 何度流しても同じ結果になる書き方。

alter table public.beta_settings alter column cap set default 100;
update public.beta_settings set cap = 100 where id;

create or replace function public.beta_capacity() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'cap', coalesce((select cap from public.beta_settings where id), 100),
    'full', (select count(*) from public.beta_members where status = 'active') >= coalesce((select cap from public.beta_settings where id), 100));
$$;
revoke all on function public.beta_capacity() from public;
grant execute on function public.beta_capacity() to anon, authenticated;

create or replace function public.my_waitlist_position() returns int
language sql stable security definer set search_path = public as $$
  select case when m.status = 'waitlist'
    then (select count(*) from public.beta_members w where w.status = 'waitlist' and (w.joined_at, w.user_id) <= (m.joined_at, m.user_id))::int
    else null end
  from public.beta_members m where m.user_id = auth.uid();
$$;
revoke all on function public.my_waitlist_position() from public;
grant execute on function public.my_waitlist_position() to authenticated;

create or replace function public.admin_beta_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  return jsonb_build_object(
    'cap', coalesce((select cap from public.beta_settings where id), 100),
    'active', (select count(*) from public.beta_members where status = 'active'),
    'waitlist', (select count(*) from public.beta_members where status = 'waitlist'),
    'queue', (select coalesce(jsonb_agg(jsonb_build_object(
        'pos', q.pos, 'joined_at', q.joined_at,
        'occupation', coalesce(nullif(split_part(q.occupation, ':', 1), ''), 'unknown'),
        'referral', coalesce(nullif(split_part(q.referral, ':', 1), ''), 'unknown')) order by q.pos), '[]')
      from (select row_number() over (order by joined_at, user_id) as pos, joined_at, occupation, referral
              from public.beta_members where status = 'waitlist') q));
end $$;
revoke all on function public.admin_beta_overview() from public;
grant execute on function public.admin_beta_overview() to authenticated;

-- 枠を変える。空きができた分、順番待ちを登録の早い順に利用中へ繰り上げる。繰り上げた人のメールを返す（ご案内用。管理者だけ）
create or replace function public.admin_set_beta_cap(p_cap int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_active int; v_room int; v_emails jsonb;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_cap is null or p_cap < 0 or p_cap > 100000 then raise exception 'bad cap'; end if;
  perform pg_advisory_xact_lock(hashtext('join_beta'));
  update public.beta_settings set cap = p_cap where id;
  select count(*) into v_active from public.beta_members where status = 'active';
  v_room := greatest(p_cap - v_active, 0);
  with promoted as (
    update public.beta_members set status = 'active'
     where user_id in (select user_id from public.beta_members where status = 'waitlist' order by joined_at, user_id limit v_room)
    returning email, joined_at)
  select coalesce(jsonb_agg(email order by joined_at), '[]') into v_emails from promoted;
  return jsonb_build_object('cap', p_cap, 'promoted', v_emails);
end $$;
revoke all on function public.admin_set_beta_cap(int) from public;
grant execute on function public.admin_set_beta_cap(int) to authenticated;

-- 「このサービスを紹介する」経由の来訪（ab_events の landing_view で、detail が share_…）。人数（ブラウザ単位）だけ
create or replace function public.admin_share_visits() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc, k), '[]')
    from (select detail as k, count(distinct visitor) n from public.ab_events
           where event = 'landing_view' and left(detail, 6) = 'share_' group by detail) x);
end $$;
revoke all on function public.admin_share_visits() from public;
grant execute on function public.admin_share_visits() to authenticated;
