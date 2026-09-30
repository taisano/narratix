-- Story（マイチャートの「Story」タブ）。1つの Story を1行として保存する（docs/story-spec.md 15.4）。
-- 中身（Route・Question Map・Dataset・スライド・Executive Summary）は編集画面の状態をそのまま jsonb で持つ。
-- 一覧に出す名前・枚数・Route は列にも持つ（jsonb を開かずに一覧を出すため）。
-- 本人だけ読める・足せる・直せる・消せる。

create table public.stories (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null default '' check (char_length(name) <= 300),
  slides      integer not null default 0 check (slides >= 0),
  route       text not null default 'AIMED' check (char_length(route) <= 40),
  story       jsonb not null,   -- Story の状態（StoryState）
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (pg_column_size(story) < 5000000)
);
create index stories_owner_updated_idx on public.stories (owner_id, updated_at desc);
create trigger stories_updated_at before update on public.stories
  for each row execute function public.set_updated_at();

alter table public.stories enable row level security;
create policy "stories: owner" on public.stories
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
revoke all on public.stories from anon;
grant select, insert, update, delete on public.stories to authenticated;
