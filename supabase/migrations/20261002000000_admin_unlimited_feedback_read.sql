-- 管理者（app_admins）は、PPT の出力の回数を無制限にする（AI 相談の回数は /api/ai/consult 側で無制限にする）。
-- 管理者は、提案へのフィードバック（相談文・提案・選んだ切り口・コメント）を読める（改善のため。画面は /admin）。

create or replace function public.record_ppt_export(p_limit int)
returns table (allowed boolean, used int)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_used int;
  v_limit int;
  v_plan text;
  v_admin boolean;
begin
  if v_uid is null then return query select false, 0; return; end if;
  v_admin := exists (select 1 from public.app_admins where user_id = v_uid);
  if not v_admin and not exists (select 1 from public.beta_members where user_id = v_uid and status = 'active') then return query select false, 0; return; end if;
  select plan into v_plan from public.user_plans where user_id = v_uid;
  -- 管理者と上位プランは上限なし。無料は p_limit と 10 の小さい方（画面から大きな数を渡されても 10 まで）
  v_limit := case when v_admin or v_plan in ('pro', 'team') then null else least(coalesce(p_limit, 10), 10) end;
  perform pg_advisory_xact_lock(hashtext(v_uid::text || ':ppt'));
  select count(*) into v_used from public.ai_usage
   where public.ai_usage.user_id = v_uid and public.ai_usage.feature = 'ppt_export' and public.ai_usage.ok and public.ai_usage.created_at >= date_trunc('month', now());
  if v_limit is not null and v_used >= v_limit then return query select false, v_used; return; end if;
  insert into public.ai_usage (user_id, feature, ok) values (v_uid, 'ppt_export', true);
  return query select true, v_used + 1;
end $$;
revoke all on function public.record_ppt_export(int) from public;
grant execute on function public.record_ppt_export(int) to authenticated;

create policy "feedback: admin reads" on public.recommendation_feedback
  for select to authenticated using (public.is_admin());
-- 読み書きの権限をはっきりさせる（Supabase の既定の権限に頼らない）
grant select, insert on public.recommendation_feedback to authenticated;
