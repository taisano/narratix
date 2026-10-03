-- データモデル v2 の保存単位。クライアントから複数表を直接組み立てず、
-- データ版とdeck版をそれぞれ1トランザクションで追記する。

create table public.deck_exports (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  deck_id          uuid not null,
  deck_version_id  uuid not null,
  created_by       uuid not null default auth.uid() references auth.users (id) on delete restrict,
  created_at       timestamptz not null default now(),
  foreign key (deck_id, workspace_id) references public.decks (id, workspace_id) on delete no action,
  foreign key (deck_version_id, deck_id) references public.deck_versions (id, deck_id) on delete no action
);
create index deck_exports_deck_created_idx on public.deck_exports (deck_id, created_at desc);
alter table public.deck_exports enable row level security;
create policy "deck exports: members read" on public.deck_exports
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "deck exports: members append" on public.deck_exports
  for insert to authenticated with check (public.is_workspace_member(workspace_id) and created_by = (select auth.uid()));
revoke all on public.deck_exports from anon;
grant select, insert on public.deck_exports to authenticated;

create function public.save_dataset_asset_version(
  p_workspace_id        uuid,
  p_asset_id            uuid,
  p_name                text,
  p_lang                text,
  p_payload             jsonb,
  p_input               jsonb,
  p_content_hash        text,
  p_semantics_hash      text,
  p_original_table_hash text
) returns table (asset_id uuid, version_id uuid, saved_version integer)
language plpgsql security invoker set search_path = public as $$
declare
  v_asset_id uuid := p_asset_id;
  v_version_id uuid;
  v_version integer;
  v_parent uuid;
begin
  if auth.uid() is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'workspace not found' using errcode = 'P0002';
  end if;

  if v_asset_id is null then
    insert into public.dataset_assets (workspace_id, name, lang)
      values (p_workspace_id, left(coalesce(p_name, ''), 300), coalesce(p_lang, 'ja'))
      returning id into v_asset_id;
  else
    select d.current_version_id into v_parent
      from public.dataset_assets d
      where d.id = v_asset_id and d.workspace_id = p_workspace_id and d.deleted_at is null;
    if not found then raise exception 'dataset asset not found' using errcode = 'P0002'; end if;
    update public.dataset_assets set name = left(coalesce(p_name, name), 300), lang = coalesce(p_lang, lang)
      where id = v_asset_id;
  end if;

  select v.id, v.version into v_version_id, v_version
    from public.dataset_versions v
    where v.dataset_asset_id = v_asset_id
      and v.content_hash = p_content_hash and v.semantics_hash = p_semantics_hash
    limit 1;

  if v_version_id is null then
    select coalesce(max(v.version), 0) + 1 into v_version
      from public.dataset_versions v where v.dataset_asset_id = v_asset_id;
    insert into public.dataset_versions
      (dataset_asset_id, workspace_id, version, payload, input, content_hash, semantics_hash, original_table_hash, parent_version_id)
      values (v_asset_id, p_workspace_id, v_version, p_payload, p_input, p_content_hash, p_semantics_hash, p_original_table_hash, v_parent)
      returning id into v_version_id;
  end if;

  update public.dataset_assets set current_version_id = v_version_id where id = v_asset_id;
  return query select v_asset_id, v_version_id, v_version;
end $$;

create function public.save_deck_state(
  p_deck_id                uuid,
  p_kind                   text,
  p_name                   text,
  p_lang                   text,
  p_user_tags              text[],
  p_working                jsonb,
  p_content                jsonb,
  p_create_version         boolean,
  p_reason                 text,
  p_copied_from_deck_id    uuid default null,
  p_copied_from_version_id uuid default null
) returns table (saved_id uuid, saved_version integer, saved_version_id uuid)
language plpgsql security invoker set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_workspace uuid;
  v_id uuid := p_deck_id;
  v_current uuid;
  v_version integer := 0;
  v_version_id uuid;
  v_make_version boolean := coalesce(p_create_version, false);
  v_reason text := coalesce(p_reason, 'save');
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  if v_id is null then
    select w.id into v_workspace from public.workspaces w
      where w.kind = 'personal' and public.is_workspace_member(w.id)
      order by w.created_at limit 1;
    if v_workspace is null then raise exception 'personal workspace not found' using errcode = 'P0002'; end if;
    insert into public.decks
      (workspace_id, kind, name, lang, user_tags, working, copied_from_deck_id, copied_from_version_id)
      values (v_workspace, p_kind, left(coalesce(p_name, ''), 300), coalesce(p_lang, 'ja'), coalesce(p_user_tags, '{}'), p_working,
        p_copied_from_deck_id, p_copied_from_version_id)
      returning id, current_version_id into v_id, v_current;
  else
    select d.workspace_id, d.current_version_id into v_workspace, v_current
      from public.decks d where d.id = v_id and d.kind = p_kind and d.deleted_at is null;
    if v_workspace is null then raise exception 'deck not found' using errcode = 'P0002'; end if;
    update public.decks set
      name = case when p_name is null then name else left(p_name, 300) end,
      lang = coalesce(p_lang, lang), user_tags = coalesce(p_user_tags, user_tags), working = p_working
      where id = v_id;
  end if;

  -- Storyは最初と30分ごとにも版を作る。それ以外の自動保存はworkingだけを書き換える。
  if p_kind = 'story' and not v_make_version then
    if v_current is null or not exists (
      select 1 from public.deck_versions v
      where v.id = v_current and v.created_at > now() - interval '30 minutes'
    ) then
      v_make_version := true;
      v_reason := case when v_current is null then 'save' else 'interval' end;
    end if;
  end if;

  if v_make_version then
    select coalesce(max(v.version), 0) + 1 into v_version
      from public.deck_versions v where v.deck_id = v_id;
    insert into public.deck_versions (deck_id, workspace_id, version, reason, content)
      values (v_id, v_workspace, v_version, v_reason, p_content)
      returning id into v_version_id;
    update public.decks set current_version_id = v_version_id where id = v_id;
  elsif v_current is not null then
    select v.version into v_version from public.deck_versions v where v.id = v_current;
    v_version_id := v_current;
  end if;

  return query select v_id, v_version, v_version_id;
end $$;

create function public.append_deck_export(p_deck_id uuid, p_content jsonb)
returns table (saved_version integer, saved_version_id uuid)
language plpgsql security invoker set search_path = public as $$
declare
  v_workspace uuid;
  v_version integer;
  v_version_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select d.workspace_id into v_workspace from public.decks d
    where d.id = p_deck_id and d.deleted_at is null;
  if v_workspace is null then raise exception 'deck not found' using errcode = 'P0002'; end if;
  select coalesce(max(v.version), 0) + 1 into v_version from public.deck_versions v where v.deck_id = p_deck_id;
  insert into public.deck_versions (deck_id, workspace_id, version, reason, content)
    values (p_deck_id, v_workspace, v_version, 'ppt_export', p_content)
    returning id into v_version_id;
  update public.decks set current_version_id = v_version_id where id = p_deck_id;
  insert into public.deck_exports (workspace_id, deck_id, deck_version_id)
    values (v_workspace, p_deck_id, v_version_id);
  return query select v_version, v_version_id;
end $$;

revoke all on function public.save_dataset_asset_version(uuid, uuid, text, text, jsonb, jsonb, text, text, text) from public, anon;
revoke all on function public.save_deck_state(uuid, text, text, text, text[], jsonb, jsonb, boolean, text, uuid, uuid) from public, anon;
revoke all on function public.append_deck_export(uuid, jsonb) from public, anon;
grant execute on function public.save_dataset_asset_version(uuid, uuid, text, text, jsonb, jsonb, text, text, text) to authenticated;
grant execute on function public.save_deck_state(uuid, text, text, text, text[], jsonb, jsonb, boolean, text, uuid, uuid) to authenticated;
grant execute on function public.append_deck_export(uuid, jsonb) to authenticated;
