-- Library：運営者が作ったスライドの見本。登録前の人も見られる（anon）。登録した人は複製して自分で作れる（複製は画面側でエディターに読み込むだけ）。
-- 公開・編集・削除できるのは管理者（app_admins）だけ。管理者は SQL Editor で足す：
--   insert into public.app_admins (user_id) select id from auth.users where email = 'you@example.com';

create table public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.app_admins enable row level security;
create policy "admins: read own" on public.app_admins for select to authenticated using (user_id = auth.uid());
grant select on public.app_admins to authenticated;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;
grant execute on function public.is_admin() to anon, authenticated;

create table public.library_items (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 200),
  description  text not null default '' check (char_length(description) <= 1000),
  category     text not null default '' check (char_length(category) <= 40),
  project      jsonb not null,
  published    boolean not null default true,
  sort         int not null default 0,
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index library_items_published_sort_idx on public.library_items (published, sort, created_at desc);
alter table public.library_items enable row level security;
create policy "library: read published" on public.library_items for select to anon, authenticated using (published or public.is_admin());
create policy "library: admin insert" on public.library_items for insert to authenticated with check (public.is_admin());
create policy "library: admin update" on public.library_items for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "library: admin delete" on public.library_items for delete to authenticated using (public.is_admin());
grant select on public.library_items to anon, authenticated;
grant insert, update, delete on public.library_items to authenticated;
