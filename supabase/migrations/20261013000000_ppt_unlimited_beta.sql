-- ベータ版：編集できる PPT の出力は、回数の上限をなくす（出した回数は ai_usage に記録だけ残す）。
-- 登録した（active）人と管理者だけが出せるのは今までどおり。AI 相談の月10回は変えない。
create or replace function public.record_ppt_export(p_limit int)
returns table (allowed boolean, used int)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_used int;
  v_admin boolean;
begin
  if v_uid is null then return query select false, 0; return; end if;
  v_admin := exists (select 1 from public.app_admins where user_id = v_uid);
  if not v_admin and not exists (select 1 from public.beta_members where user_id = v_uid and status = 'active') then return query select false, 0; return; end if;
  perform pg_advisory_xact_lock(hashtext(v_uid::text || ':ppt'));
  select count(*) into v_used from public.ai_usage
   where public.ai_usage.user_id = v_uid and public.ai_usage.feature = 'ppt_export' and public.ai_usage.ok and public.ai_usage.created_at >= date_trunc('month', now());
  insert into public.ai_usage (user_id, feature, ok) values (v_uid, 'ppt_export', true);
  return query select true, v_used + 1;
end $$;
revoke all on function public.record_ppt_export(int) from public;
grant execute on function public.record_ppt_export(int) to authenticated;
