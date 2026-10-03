-- データ版を出典へつなぐ。出典を直した時に過去版を書き換えないよう、
-- 内容が同じ時だけ既存行を再利用し、違う時は新しい行を作る。

create function public.save_source(
  p_workspace_id uuid,
  p_source_id uuid,
  p_kind text,
  p_title text,
  p_publisher text,
  p_url text,
  p_published_at date,
  p_retrieved_at date,
  p_locator text,
  p_citation_text text
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'workspace not found' using errcode = 'P0002';
  end if;
  if nullif(btrim(coalesce(p_title, '')), '') is null then
    raise exception 'source title is required' using errcode = '22023';
  end if;

  select s.id into v_id from public.sources s
    where s.id = p_source_id and s.workspace_id = p_workspace_id and s.deleted_at is null
      and s.kind = p_kind and s.title = p_title
      and s.publisher is not distinct from nullif(p_publisher, '')
      and s.url is not distinct from nullif(p_url, '')
      and s.published_at is not distinct from p_published_at
      and s.retrieved_at is not distinct from coalesce(p_retrieved_at, current_date)
      and s.locator is not distinct from nullif(p_locator, '')
      and s.citation_text = coalesce(p_citation_text, '');
  if v_id is not null then return v_id; end if;

  insert into public.sources (workspace_id, kind, title, publisher, url, published_at, retrieved_at, locator, citation_text)
    values (p_workspace_id, p_kind, p_title, nullif(p_publisher, ''), nullif(p_url, ''), p_published_at,
      coalesce(p_retrieved_at, current_date), nullif(p_locator, ''), coalesce(p_citation_text, ''))
    returning id into v_id;
  return v_id;
end $$;

drop function public.save_dataset_asset_version(uuid, uuid, text, text, jsonb, jsonb, text, text, text);

create function public.save_dataset_asset_version(
  p_workspace_id        uuid,
  p_asset_id            uuid,
  p_name                text,
  p_lang                text,
  p_payload             jsonb,
  p_input               jsonb,
  p_content_hash        text,
  p_semantics_hash      text,
  p_original_table_hash text,
  p_source_ids          uuid[] default '{}'
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
    select d.current_version_id into v_parent from public.dataset_assets d
      where d.id = v_asset_id and d.workspace_id = p_workspace_id and d.deleted_at is null;
    if not found then raise exception 'dataset asset not found' using errcode = 'P0002'; end if;
    update public.dataset_assets set name = left(coalesce(p_name, name), 300), lang = coalesce(p_lang, lang)
      where id = v_asset_id;
  end if;

  select v.id, v.version into v_version_id, v_version from public.dataset_versions v
    where v.dataset_asset_id = v_asset_id
      and v.content_hash = p_content_hash and v.semantics_hash = p_semantics_hash
      and v.source_ids = coalesce(p_source_ids, '{}')
    limit 1;

  if v_version_id is null then
    select coalesce(max(v.version), 0) + 1 into v_version
      from public.dataset_versions v where v.dataset_asset_id = v_asset_id;
    insert into public.dataset_versions
      (dataset_asset_id, workspace_id, version, payload, input, source_ids, content_hash, semantics_hash, original_table_hash, parent_version_id)
      values (v_asset_id, p_workspace_id, v_version, p_payload, p_input, coalesce(p_source_ids, '{}'),
        p_content_hash, p_semantics_hash, p_original_table_hash, v_parent)
      returning id into v_version_id;
  end if;

  update public.dataset_assets set current_version_id = v_version_id where id = v_asset_id;
  return query select v_asset_id, v_version_id, v_version;
end $$;

revoke all on function public.save_source(uuid, uuid, text, text, text, text, date, date, text, text) from public, anon;
revoke all on function public.save_dataset_asset_version(uuid, uuid, text, text, jsonb, jsonb, text, text, text, uuid[]) from public, anon;
grant execute on function public.save_source(uuid, uuid, text, text, text, text, date, date, text, text) to authenticated;
grant execute on function public.save_dataset_asset_version(uuid, uuid, text, text, jsonb, jsonb, text, text, text, uuid[]) to authenticated;
