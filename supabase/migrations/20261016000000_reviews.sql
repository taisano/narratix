-- ユーザーのレビュー（星＋コメント）。1人1件（書き直せる）。
-- ・本人だけが読み書きできる（書き込みは submit_review 経由）。管理者は全件を読める。
-- ・公開されるのは「本人が公開に同意（publish_consent）」かつ「管理者が公開（published）にした」ものだけ。
--   公開用の public_reviews() は、ユーザー ID・メールなどを返さず、表示名（ニックネーム、無ければ職種）だけを返す。
-- ・本人が内容を直す／公開同意を外した時は、いったん非公開に戻る（管理者が見直してから出す）。
-- 何度流しても同じ結果になる書き方。

create table if not exists public.reviews (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null unique references auth.users (id) on delete cascade,
  rating          smallint not null check (rating between 1 and 5),
  comment         text not null default '' check (char_length(comment) <= 400),
  nickname        text not null default '' check (char_length(nickname) <= 40),
  occupation      text,
  publish_consent boolean not null default false,
  published       boolean not null default false,
  sort            int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (not published or publish_consent)
);
alter table public.reviews enable row level security;
drop policy if exists "reviews: read own" on public.reviews;
create policy "reviews: read own" on public.reviews for select to authenticated using (user_id = auth.uid());
drop policy if exists "reviews: admin read" on public.reviews;
create policy "reviews: admin read" on public.reviews for select to authenticated using (public.is_admin());
revoke all on public.reviews from anon, authenticated;
grant select on public.reviews to authenticated;

create or replace function public.submit_review(p_rating int, p_comment text, p_nickname text, p_publish_consent boolean)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_occ text;
  v_id uuid;
  v_comment text := btrim(coalesce(p_comment, ''));
  v_nick text := btrim(coalesce(p_nickname, ''));
  v_consent boolean := coalesce(p_publish_consent, false);
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'bad rating'; end if;
  if not exists (select 1 from public.beta_members where user_id = v_uid) then raise exception 'not a member'; end if;
  select nullif(split_part(occupation, ':', 1), '') into v_occ from public.beta_members where user_id = v_uid;
  insert into public.reviews (user_id, rating, comment, nickname, occupation, publish_consent)
    values (v_uid, p_rating, left(v_comment, 400), left(v_nick, 40), v_occ, v_consent)
  on conflict (user_id) do update set
    rating = excluded.rating, comment = excluded.comment, nickname = excluded.nickname, occupation = excluded.occupation,
    publish_consent = excluded.publish_consent, updated_at = now(),
    -- 内容を直した・同意を外した時は、いったん非公開に戻す（直した内容を管理者が見直してから出す）
    published = public.reviews.published and excluded.publish_consent
                and public.reviews.rating = excluded.rating and public.reviews.comment = excluded.comment and public.reviews.nickname = excluded.nickname
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.submit_review(int, text, text, boolean) from public;
grant execute on function public.submit_review(int, text, text, boolean) to authenticated;

create or replace function public.delete_my_review() returns void
language sql security definer set search_path = public as $$
  delete from public.reviews where user_id = auth.uid();
$$;
revoke all on function public.delete_my_review() from public;
grant execute on function public.delete_my_review() to authenticated;

-- 管理者：公開／非公開と表示順。公開できるのは、本人が公開に同意しているものだけ
create or replace function public.admin_set_review(p_id uuid, p_published boolean, p_sort int default 0)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_published and not exists (select 1 from public.reviews where id = p_id and publish_consent) then raise exception 'no publish consent'; end if;
  update public.reviews set published = p_published, sort = coalesce(p_sort, 0) where id = p_id;
end $$;
revoke all on function public.admin_set_review(uuid, boolean, int) from public;
grant execute on function public.admin_set_review(uuid, boolean, int) to authenticated;

-- 公開用（だれでも）：ユーザー ID・メールは返さない。表示名はニックネーム、無ければ職種
create or replace function public.public_reviews(p_limit int default 12)
returns table (id uuid, rating smallint, comment text, name text, occupation text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.rating, r.comment, nullif(r.nickname, ''), r.occupation, r.created_at
    from public.reviews r
   where r.published and r.publish_consent
   order by r.sort, r.created_at desc
   limit least(greatest(coalesce(p_limit, 12), 1), 50);
$$;
revoke all on function public.public_reviews(int) from public;
grant execute on function public.public_reviews(int) to anon, authenticated;

-- レビューを聞いてよいか（出力・保存の直後に画面が呼ぶ）：まだ書いていない人で、PPT 出力 2 回以上か チャート保存 3 回以上
create or replace function public.review_prompt_state()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_exports int; v_saves int;
begin
  if v_uid is null then return jsonb_build_object('eligible', false, 'has_review', false); end if;
  select count(*) into v_exports from public.ai_usage where user_id = v_uid and feature = 'ppt_export' and ok;
  select count(*) into v_saves from public.deck_versions where created_by = v_uid;
  return jsonb_build_object(
    'has_review', exists (select 1 from public.reviews where user_id = v_uid),
    'eligible', (v_exports >= 2 or v_saves >= 3) and not exists (select 1 from public.reviews where user_id = v_uid),
    'exports', v_exports, 'saves', v_saves);
end $$;
revoke all on function public.review_prompt_state() from public;
grant execute on function public.review_prompt_state() to authenticated;
