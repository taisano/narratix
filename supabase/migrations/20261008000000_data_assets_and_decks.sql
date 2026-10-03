-- データモデル v2：workspace を境界に、データと資料を「資産＋書き換えない版」で保存する。
-- 旧 projects / datasets / view_specs / view_spec_versions / chart_drafts / stories は段階7まで残す。

-- ---------- workspace ----------
create table public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'personal' check (kind in ('personal', 'team')),
  name        text not null default '' check (char_length(name) <= 200),
  created_by  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, created_by)
);
create index workspaces_created_by_idx on public.workspaces (created_by);
create trigger workspaces_updated_at before update on public.workspaces
  for each row execute function public.set_updated_at();

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'member')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id, workspace_id);

create function public.is_workspace_member(p_workspace_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id and m.user_id = auth.uid()
  );
$$;

create function public.is_workspace_owner(p_workspace_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

create function public.create_personal_workspace() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_workspace_id uuid;
begin
  insert into public.workspaces (kind, name, created_by)
    values ('personal', '', new.id)
    returning id into v_workspace_id;
  insert into public.workspace_members (workspace_id, user_id, role)
    values (v_workspace_id, new.id, 'owner');
  return new;
end $$;

-- このマイグレーションより前からいる利用者にも個人 workspace を1つ作る。
do $$
declare
  v_user record;
  v_workspace_id uuid;
begin
  for v_user in select id from auth.users loop
    if not exists (
      select 1 from public.workspaces w
      where w.created_by = v_user.id and w.kind = 'personal'
    ) then
      insert into public.workspaces (kind, name, created_by)
        values ('personal', '', v_user.id)
        returning id into v_workspace_id;
      insert into public.workspace_members (workspace_id, user_id, role)
        values (v_workspace_id, v_user.id, 'owner');
    end if;
  end loop;
end $$;

create trigger auth_user_personal_workspace
  after insert on auth.users
  for each row execute function public.create_personal_workspace();

-- ---------- 出典 ----------
create table public.sources (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  created_by     uuid not null default auth.uid() references auth.users (id) on delete restrict,
  kind           text not null check (kind in ('external_web', 'external_document', 'internal', 'survey', 'user_estimate', 'sample')),
  title          text not null check (char_length(title) between 1 and 500),
  publisher      text check (publisher is null or char_length(publisher) <= 500),
  url            text check (url is null or char_length(url) <= 2000),
  published_at   date,
  retrieved_at   date,
  locator        text check (locator is null or char_length(locator) <= 500),
  citation_text  text not null default '' check (char_length(citation_text) <= 2000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  unique (id, workspace_id)
);
create index sources_workspace_updated_idx on public.sources (workspace_id, updated_at desc);
create trigger sources_updated_at before update on public.sources
  for each row execute function public.set_updated_at();

-- ---------- データ資産と、その書き換えない版 ----------
create table public.dataset_assets (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces (id) on delete cascade,
  created_by          uuid not null default auth.uid() references auth.users (id) on delete restrict,
  name                text not null default '' check (char_length(name) <= 300),
  user_tags           text[] not null default '{}' check (public.valid_tags(user_tags)),
  auto_tags           text[] not null default '{}' check (public.valid_tags(auto_tags)),
  lang                text not null default 'ja' check (lang in ('ja', 'en')),
  current_version_id  uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  unique (id, workspace_id)
);
create index dataset_assets_workspace_updated_idx on public.dataset_assets (workspace_id, updated_at desc);
create index dataset_assets_user_tags_idx on public.dataset_assets using gin (user_tags);
create index dataset_assets_auto_tags_idx on public.dataset_assets using gin (auto_tags);
create trigger dataset_assets_updated_at before update on public.dataset_assets
  for each row execute function public.set_updated_at();

create table public.dataset_versions (
  id                   uuid primary key default gen_random_uuid(),
  dataset_asset_id     uuid not null,
  workspace_id         uuid not null references public.workspaces (id) on delete cascade,
  created_by           uuid not null default auth.uid() references auth.users (id) on delete restrict,
  version              integer not null check (version >= 1),
  payload              jsonb not null check ((payload ->> 'schemaVersion')::integer = 1),
  input                jsonb not null,
  source_ids           uuid[] not null default '{}',
  content_hash         text not null check (char_length(content_hash) between 1 and 200),
  semantics_hash       text not null check (char_length(semantics_hash) between 1 and 200),
  original_table_hash  text not null check (char_length(original_table_hash) between 1 and 200),
  parent_version_id    uuid,
  created_at           timestamptz not null default now(),
  unique (id, dataset_asset_id),
  unique (id, workspace_id),
  unique (dataset_asset_id, version),
  unique (dataset_asset_id, content_hash, semantics_hash),
  foreign key (dataset_asset_id, workspace_id)
    references public.dataset_assets (id, workspace_id) on delete no action,
  foreign key (parent_version_id, dataset_asset_id)
    references public.dataset_versions (id, dataset_asset_id) on delete no action
);
create index dataset_versions_workspace_created_idx on public.dataset_versions (workspace_id, created_at desc);
create index dataset_versions_asset_created_idx on public.dataset_versions (dataset_asset_id, created_at desc);

alter table public.dataset_assets
  add constraint dataset_assets_current_version_fk
  foreign key (current_version_id, id)
  references public.dataset_versions (id, dataset_asset_id)
  on delete no action;

-- source_ids は配列で持つため、同じ workspace の出典だけを指すことをtriggerで保証する。
create function public.validate_dataset_version_sources() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if exists (
    select 1
    from unnest(new.source_ids) source_id
    left join public.sources s
      on s.id = source_id and s.workspace_id = new.workspace_id and s.deleted_at is null
    where s.id is null
  ) then
    raise exception 'dataset version source must belong to the same workspace';
  end if;
  return new;
end $$;
create trigger dataset_versions_validate_sources before insert on public.dataset_versions
  for each row execute function public.validate_dataset_version_sources();

-- ---------- チャート／ストーリーと、その書き換えない版 ----------
create table public.decks (
  id                      uuid primary key default gen_random_uuid(),
  workspace_id            uuid not null references public.workspaces (id) on delete cascade,
  created_by              uuid not null default auth.uid() references auth.users (id) on delete restrict,
  kind                    text not null check (kind in ('chart', 'story')),
  name                    text not null default '' check (char_length(name) <= 300),
  user_tags               text[] not null default '{}' check (public.valid_tags(user_tags)),
  auto_tags               text[] not null default '{}' check (public.valid_tags(auto_tags)),
  lang                    text not null default 'ja' check (lang in ('ja', 'en')),
  working                 jsonb not null check ((working ->> 'schemaVersion')::integer = 1),
  current_version_id      uuid,
  copied_from_deck_id     uuid,
  copied_from_version_id  uuid,
  template_id             uuid,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  deleted_at              timestamptz,
  unique (id, workspace_id),
  foreign key (copied_from_deck_id, workspace_id)
    references public.decks (id, workspace_id) on delete no action
);
create index decks_workspace_kind_updated_idx on public.decks (workspace_id, kind, updated_at desc);
create index decks_user_tags_idx on public.decks using gin (user_tags);
create index decks_auto_tags_idx on public.decks using gin (auto_tags);
create trigger decks_updated_at before update on public.decks
  for each row execute function public.set_updated_at();

create table public.deck_versions (
  id          uuid primary key default gen_random_uuid(),
  deck_id     uuid not null,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by  uuid not null default auth.uid() references auth.users (id) on delete restrict,
  version     integer not null check (version >= 1),
  reason      text not null default 'save' check (reason in ('save', 'ppt_export', 'rename', 'interval', 'template_import')),
  content     jsonb not null check ((content ->> 'schemaVersion')::integer = 1),
  created_at  timestamptz not null default now(),
  unique (id, deck_id),
  unique (id, workspace_id),
  unique (deck_id, version),
  foreign key (deck_id, workspace_id)
    references public.decks (id, workspace_id) on delete no action
);
create index deck_versions_workspace_created_idx on public.deck_versions (workspace_id, created_at desc);
create index deck_versions_deck_created_idx on public.deck_versions (deck_id, created_at desc);

alter table public.decks
  add constraint decks_current_version_fk
  foreign key (current_version_id, id)
  references public.deck_versions (id, deck_id)
  on delete no action;
alter table public.decks
  add constraint decks_copied_from_version_fk
  foreign key (copied_from_version_id, copied_from_deck_id)
  references public.deck_versions (id, deck_id)
  on delete no action;

-- テンプレートは公開時点の deck とデータ版を自己完結したJSONで持つ。
-- 段階6で旧library_itemsを変換して入れる。書き換えられるのは管理者だけ。
create table public.templates (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces (id) on delete cascade,
  created_by        uuid not null default auth.uid() references auth.users (id) on delete restrict,
  title             text not null check (char_length(title) between 1 and 200),
  description       text not null default '' check (char_length(description) <= 1000),
  category          text not null default '' check (char_length(category) <= 40),
  lang              text not null default 'ja' check (lang in ('ja', 'en')),
  user_tags         text[] not null default '{}' check (public.valid_tags(user_tags)),
  deck_content      jsonb not null check ((deck_content ->> 'schemaVersion')::integer = 1),
  dataset_contents  jsonb not null default '[]' check (jsonb_typeof(dataset_contents) = 'array'),
  published         boolean not null default true,
  sort              integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, workspace_id)
);
create index templates_published_sort_idx on public.templates (published, sort, created_at desc);
create index templates_user_tags_idx on public.templates using gin (user_tags);
create trigger templates_updated_at before update on public.templates
  for each row execute function public.set_updated_at();

alter table public.decks
  add constraint decks_template_fk foreign key (template_id) references public.templates (id) on delete set null;

-- workspace と作成者は資産の同一性なので、作成後には移し替えない。
create function public.protect_asset_identity() returns trigger
language plpgsql as $$
begin
  if new.workspace_id <> old.workspace_id or new.created_by <> old.created_by then
    raise exception 'workspace_id and created_by are immutable';
  end if;
  return new;
end $$;
create trigger sources_identity before update on public.sources
  for each row execute function public.protect_asset_identity();
create trigger dataset_assets_identity before update on public.dataset_assets
  for each row execute function public.protect_asset_identity();
create trigger decks_identity before update on public.decks
  for each row execute function public.protect_asset_identity();
create trigger templates_identity before update on public.templates
  for each row execute function public.protect_asset_identity();

-- ---------- RLS ----------
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.sources enable row level security;
alter table public.dataset_assets enable row level security;
alter table public.dataset_versions enable row level security;
alter table public.decks enable row level security;
alter table public.deck_versions enable row level security;
alter table public.templates enable row level security;

create policy "workspaces: members read" on public.workspaces
  for select to authenticated using (public.is_workspace_member(id));
create policy "workspaces: owners update" on public.workspaces
  for update to authenticated using (public.is_workspace_owner(id)) with check (public.is_workspace_owner(id));
create policy "workspaces: owners delete" on public.workspaces
  for delete to authenticated using (public.is_workspace_owner(id));

create policy "workspace members: members read" on public.workspace_members
  for select to authenticated using (public.is_workspace_member(workspace_id));

create policy "sources: members read" on public.sources
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "sources: members insert" on public.sources
  for insert to authenticated with check (public.is_workspace_member(workspace_id) and created_by = (select auth.uid()));
create policy "sources: members update" on public.sources
  for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

create policy "dataset assets: members read" on public.dataset_assets
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "dataset assets: members insert" on public.dataset_assets
  for insert to authenticated with check (public.is_workspace_member(workspace_id) and created_by = (select auth.uid()));
create policy "dataset assets: members update" on public.dataset_assets
  for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

create policy "dataset versions: members read" on public.dataset_versions
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "dataset versions: members append" on public.dataset_versions
  for insert to authenticated with check (public.is_workspace_member(workspace_id) and created_by = (select auth.uid()));

create policy "decks: members read" on public.decks
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "decks: members insert" on public.decks
  for insert to authenticated with check (public.is_workspace_member(workspace_id) and created_by = (select auth.uid()));
create policy "decks: members update" on public.decks
  for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

create policy "deck versions: members read" on public.deck_versions
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "deck versions: members append" on public.deck_versions
  for insert to authenticated with check (public.is_workspace_member(workspace_id) and created_by = (select auth.uid()));

create policy "templates: published read" on public.templates
  for select to anon, authenticated using (published or public.is_admin());
create policy "templates: admin insert" on public.templates
  for insert to authenticated with check (public.is_admin() and public.is_workspace_member(workspace_id) and created_by = (select auth.uid()));
create policy "templates: admin update" on public.templates
  for update to authenticated using (public.is_admin()) with check (public.is_admin() and public.is_workspace_member(workspace_id));
create policy "templates: admin delete" on public.templates
  for delete to authenticated using (public.is_admin());

revoke all on public.workspaces, public.workspace_members, public.sources, public.dataset_assets,
  public.dataset_versions, public.decks, public.deck_versions, public.templates from anon;
grant select on public.templates to anon;

grant select, update, delete on public.workspaces to authenticated;
grant select on public.workspace_members to authenticated;
grant select, insert, update on public.sources, public.dataset_assets, public.decks to authenticated;
grant select, insert on public.dataset_versions, public.deck_versions to authenticated;
grant select, insert, update, delete on public.templates to authenticated;

revoke all on function public.is_workspace_member(uuid), public.is_workspace_owner(uuid) from public, anon;
grant execute on function public.is_workspace_member(uuid), public.is_workspace_owner(uuid) to authenticated;
