-- 相談の履歴（マイページの「相談の履歴」）。ログイン中に相談すると1件ずつ残る。
-- ☆を付けていない履歴は、新しい100件だけ残す（古いものから消える）。☆を付けたものは消えない。
-- 本人だけ読める・足せる・消せる。書き換えられるのは ☆ と、作ったチャートへのリンクだけ。

create table public.consultation_history (
  id                      uuid primary key default gen_random_uuid(),
  owner_id                uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at              timestamptz not null default now(),
  text                    text not null check (char_length(text) between 1 and 4000),
  classifier              text not null default 'rules' check (classifier in ('ai', 'rules')),
  classification          jsonb,
  recommended_recipe_ids  text[] not null default '{}',
  recommendation_version  text,
  starred                 boolean not null default false,
  chart_id                uuid references public.view_specs (id) on delete set null
);
create index consultation_history_owner_created_idx on public.consultation_history (owner_id, created_at desc);

alter table public.consultation_history enable row level security;
create policy "history: read own" on public.consultation_history
  for select to authenticated using (owner_id = auth.uid());
create policy "history: insert own" on public.consultation_history
  for insert to authenticated with check (owner_id = auth.uid());
create policy "history: update own" on public.consultation_history
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "history: delete own" on public.consultation_history
  for delete to authenticated using (owner_id = auth.uid());
grant select, insert, delete on public.consultation_history to authenticated;
grant update (starred, chart_id) on public.consultation_history to authenticated;

-- 足した時に、その人の ☆ なしの履歴を新しい100件に切り詰める
create function public.trim_consultation_history() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  delete from public.consultation_history h
   where h.owner_id = new.owner_id and not h.starred
     and h.id not in (
       select id from public.consultation_history
        where owner_id = new.owner_id and not starred
        order by created_at desc, id desc limit 100
     );
  return null;
end $$;
create trigger consultation_history_trim after insert on public.consultation_history
  for each row execute function public.trim_consultation_history();
