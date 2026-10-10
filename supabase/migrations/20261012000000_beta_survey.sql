-- ベータ登録のかんたんなアンケート（職種・このサービスを知ったきっかけ）。
-- 選んだ項目の記号（例：planner）か、「その他」の自由記入（例：other:デザイナー）をそのまま入れる。
-- 途中で止まって再実行しても通るように、何度流しても同じ結果になる書き方にしている。
-- 画面側で必須にしている。サーバー側は、古い画面からの呼び出しも通るよう、空でも登録できる。

alter table public.beta_members
  add column if not exists occupation text check (occupation is null or char_length(occupation) <= 120),
  add column if not exists referral   text check (referral   is null or char_length(referral)   <= 120);

drop function if exists public.join_beta(boolean, boolean);
drop function if exists public.join_beta(boolean, boolean, text, text);

create function public.join_beta(p_agree_terms boolean, p_email_opt_in boolean, p_occupation text default null, p_referral text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_status text;
  v_active int;
  v_cap int;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select status into v_status from public.beta_members where user_id = v_uid;
  if v_status is not null then return v_status; end if;
  if not coalesce(p_agree_terms, false) then raise exception 'terms not agreed'; end if;
  select email into v_email from auth.users where id = v_uid;
  perform pg_advisory_xact_lock(hashtext('join_beta'));
  select cap into v_cap from public.beta_settings where id;
  select count(*) into v_active from public.beta_members where status = 'active';
  v_status := case when v_active < coalesce(v_cap, 1000) then 'active' else 'waitlist' end;
  insert into public.beta_members (user_id, email, status, terms_agreed_at, email_opt_in, occupation, referral)
    values (v_uid, coalesce(v_email, ''), v_status, now(), coalesce(p_email_opt_in, false),
            nullif(left(btrim(p_occupation), 120), ''), nullif(left(btrim(p_referral), 120), ''));
  return v_status;
end $$;
revoke all on function public.join_beta(boolean, boolean, text, text) from public;
grant execute on function public.join_beta(boolean, boolean, text, text) to authenticated;
