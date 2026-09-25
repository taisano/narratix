-- ベータ版の登録（Slide Story Coach）。
-- ログイン（メールのリンク＝メールアドレスの確認）したあと、利用条件に同意して join_beta を呼ぶと登録される。
-- 登録できるのは先着 cap 人（既定 1000）まで。それ以降は順番待ち（waitlist）。枠は beta_settings.cap で増やせる。
-- 本人は自分の行を読めるだけ。書き込みは join_beta / set_beta_email_opt_in からだけ。

create table public.beta_settings (
  id   boolean primary key default true check (id),
  cap  int not null default 1000 check (cap >= 0)
);
insert into public.beta_settings (id, cap) values (true, 1000);
alter table public.beta_settings enable row level security;

create table public.beta_members (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  email            text not null,
  status           text not null check (status in ('active', 'waitlist')),
  terms_agreed_at  timestamptz not null,
  -- 本サイトの公開などのお知らせメールを受け取るか（任意）
  email_opt_in     boolean not null default false,
  joined_at        timestamptz not null default now()
);
create index beta_members_status_joined_idx on public.beta_members (status, joined_at);
alter table public.beta_members enable row level security;
create policy "beta: read own" on public.beta_members for select to authenticated using (user_id = auth.uid());
grant select on public.beta_members to authenticated;

-- 登録する（すでに登録していれば今の状態を返す）。同意がなければ登録しない
create function public.join_beta(p_agree_terms boolean, p_email_opt_in boolean)
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
  -- 同時に登録されても上限を超えないように
  perform pg_advisory_xact_lock(hashtext('join_beta'));
  select cap into v_cap from public.beta_settings where id;
  select count(*) into v_active from public.beta_members where status = 'active';
  v_status := case when v_active < coalesce(v_cap, 1000) then 'active' else 'waitlist' end;
  insert into public.beta_members (user_id, email, status, terms_agreed_at, email_opt_in)
    values (v_uid, coalesce(v_email, ''), v_status, now(), coalesce(p_email_opt_in, false));
  return v_status;
end $$;
revoke all on function public.join_beta(boolean, boolean) from public;
grant execute on function public.join_beta(boolean, boolean) to authenticated;

-- お知らせメールの受け取りを変える
create function public.set_beta_email_opt_in(p_opt_in boolean)
returns void
language sql security definer set search_path = public as $$
  update public.beta_members set email_opt_in = coalesce(p_opt_in, false) where user_id = auth.uid();
$$;
revoke all on function public.set_beta_email_opt_in(boolean) from public;
grant execute on function public.set_beta_email_opt_in(boolean) to authenticated;

-- PPT の出力も回数を数える（AI の回数と同じ表）
alter table public.ai_usage drop constraint ai_usage_feature_check;
alter table public.ai_usage add constraint ai_usage_feature_check check (feature in ('ai_consult', 'ai_headline', 'ppt_export'));

-- PPT を出力する前に呼ぶ：登録済み（active）で、今月の回数が上限未満なら1回数えて true
create function public.record_ppt_export(p_limit int)
returns table (allowed boolean, used int)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_used int;
  v_limit int;
  v_plan text;
begin
  if v_uid is null then return query select false, 0; return; end if;
  if not exists (select 1 from public.beta_members where user_id = v_uid and status = 'active') then return query select false, 0; return; end if;
  select plan into v_plan from public.user_plans where user_id = v_uid;
  -- 上位プランは上限なし。無料は p_limit と 10 の小さい方（画面から大きな数を渡されても 10 まで）
  v_limit := case when v_plan in ('pro', 'team') then null else least(coalesce(p_limit, 10), 10) end;
  perform pg_advisory_xact_lock(hashtext(v_uid::text || ':ppt'));
  select count(*) into v_used from public.ai_usage
   where public.ai_usage.user_id = v_uid and public.ai_usage.feature = 'ppt_export' and public.ai_usage.ok and public.ai_usage.created_at >= date_trunc('month', now());
  if v_limit is not null and v_used >= v_limit then return query select false, v_used; return; end if;
  insert into public.ai_usage (user_id, feature, ok) values (v_uid, 'ppt_export', true);
  return query select true, v_used + 1;
end $$;
revoke all on function public.record_ppt_export(int) from public;
grant execute on function public.record_ppt_export(int) to authenticated;
