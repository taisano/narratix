-- 旧view_specs／storiesの現在状態を、新しいdeckとデータ版へ1件ずつ安全に移す。
-- service_roleからだけ実行でき、同じ旧idは再実行時にスキップする。旧表は変更しない。

create function public.import_legacy_user_deck(
  p_owner_id        uuid,
  p_workspace_id    uuid,
  p_deck_id         uuid,
  p_deck_version_id uuid,
  p_kind            text,
  p_name            text,
  p_lang            text,
  p_user_tags       text[],
  p_working         jsonb,
  p_version         integer,
  p_created_at      timestamptz,
  p_updated_at      timestamptz,
  p_datasets        jsonb
) returns text
language plpgsql security definer set search_path = public, auth as $$
declare
  v_existing_owner uuid;
  v_existing_source text;
  v_dataset jsonb;
  v_source jsonb;
  v_source_id uuid;
  v_asset_id uuid;
  v_dataset_version_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_kind not in ('chart', 'story') or p_version < 1 or jsonb_typeof(p_datasets) <> 'array' then
    raise exception 'invalid legacy deck payload' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_owner_id)
    or not exists (
      select 1 from public.workspaces w
      join public.workspace_members m on m.workspace_id = w.id
      where w.id = p_workspace_id and w.created_by = p_owner_id
        and m.user_id = p_owner_id and m.role = 'owner'
    ) then
    raise exception 'legacy owner workspace not found' using errcode = 'P0002';
  end if;

  select d.created_by, d.working -> 'legacyImport' ->> 'sourceId'
    into v_existing_owner, v_existing_source
    from public.decks d where d.id = p_deck_id;
  if found then
    if v_existing_owner = p_owner_id and v_existing_source = p_deck_id::text then return 'skipped'; end if;
    raise exception 'deck id already exists and is not this legacy import' using errcode = '23505';
  end if;

  for v_dataset in select value from jsonb_array_elements(p_datasets) loop
    v_asset_id := (v_dataset ->> 'assetId')::uuid;
    v_dataset_version_id := (v_dataset ->> 'versionId')::uuid;
    v_source := v_dataset -> 'source';
    v_source_id := null;
    if v_source is not null and jsonb_typeof(v_source) = 'object' then
      v_source_id := (v_source ->> 'id')::uuid;
      insert into public.sources
        (id, workspace_id, created_by, kind, title, publisher, url, published_at, retrieved_at, locator, citation_text, created_at, updated_at)
      values
        (v_source_id, p_workspace_id, p_owner_id, v_source ->> 'kind', v_source ->> 'title', nullif(v_source ->> 'publisher', ''),
         nullif(v_source ->> 'url', ''), nullif(v_source ->> 'publishedAt', '')::date,
         nullif(v_source ->> 'retrievedAt', '')::date, nullif(v_source ->> 'locator', ''),
         coalesce(v_source ->> 'citationText', ''), p_updated_at, p_updated_at);
    end if;

    insert into public.dataset_assets
      (id, workspace_id, created_by, name, lang, created_at, updated_at)
    values
      (v_asset_id, p_workspace_id, p_owner_id, left(coalesce(v_dataset ->> 'name', ''), 300), p_lang, p_created_at, p_updated_at);
    insert into public.dataset_versions
      (id, dataset_asset_id, workspace_id, created_by, version, payload, input, source_ids,
       content_hash, semantics_hash, original_table_hash, created_at)
    values
      (v_dataset_version_id, v_asset_id, p_workspace_id, p_owner_id, 1, v_dataset -> 'payload', v_dataset -> 'input',
       case when v_source_id is null then '{}'::uuid[] else array[v_source_id] end,
       v_dataset ->> 'contentHash', v_dataset ->> 'semanticsHash', v_dataset ->> 'originalTableHash', p_updated_at);
    update public.dataset_assets set current_version_id = v_dataset_version_id where id = v_asset_id;
  end loop;

  insert into public.decks
    (id, workspace_id, created_by, kind, name, user_tags, lang, working, created_at, updated_at)
  values
    (p_deck_id, p_workspace_id, p_owner_id, p_kind, left(coalesce(p_name, ''), 300), coalesce(p_user_tags, '{}'),
     p_lang, p_working, p_created_at, p_updated_at);
  insert into public.deck_versions
    (id, deck_id, workspace_id, created_by, version, reason, content, created_at)
  values
    (p_deck_version_id, p_deck_id, p_workspace_id, p_owner_id, p_version, 'save', p_working, p_updated_at);
  update public.decks set current_version_id = p_deck_version_id where id = p_deck_id;
  return 'imported';
end $$;

revoke all on function public.import_legacy_user_deck(uuid, uuid, uuid, uuid, text, text, text, text[], jsonb, integer, timestamptz, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.import_legacy_user_deck(uuid, uuid, uuid, uuid, text, text, text, text[], jsonb, integer, timestamptz, timestamptz, jsonb)
  to service_role;
