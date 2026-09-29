-- 下書き（マイチャートの「下書き」タブ）。ログイン中の下書きをアカウントに残し、どの PC からでも開けるようにする。
-- 「保存」したチャート（view_specs）は完成品として「チャート」タブに、下書きはこの表に分けて置く。
-- 下書きは検証前の途中の作業（見本のまま・注意が残っていても残せる）なので、ViewSpec にはせず、編集画面の状態をそのまま持つ。
-- 本人だけ読める・足せる・直せる・消せる。1人 50 件まで（古いものから消える）。

create table public.chart_drafts (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null default '' check (char_length(title) <= 300),
  slides      integer not null default 1 check (slides >= 0),
  project     jsonb not null,   -- 編集画面の状態（ProjectState）
  doc         jsonb,            -- 保存済みチャートの続きなら、そのチャートの id・版・名前
  chart_id    uuid references public.view_specs (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (pg_column_size(project) < 2000000)
);
create index chart_drafts_owner_updated_idx on public.chart_drafts (owner_id, updated_at desc);
create trigger chart_drafts_updated_at before update on public.chart_drafts
  for each row execute function public.set_updated_at();

alter table public.chart_drafts enable row level security;
create policy "drafts: owner" on public.chart_drafts
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
revoke all on public.chart_drafts from anon;
grant select, insert, update, delete on public.chart_drafts to authenticated;

-- 足した時に、その人の下書きを新しい 50 件に切り詰める
create function public.trim_chart_drafts() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  delete from public.chart_drafts d
   where d.owner_id = new.owner_id
     and d.id not in (
       select id from public.chart_drafts
        where owner_id = new.owner_id
        order by updated_at desc, id desc limit 50
     );
  return null;
end $$;
create trigger chart_drafts_trim after insert on public.chart_drafts
  for each row execute function public.trim_chart_drafts();
