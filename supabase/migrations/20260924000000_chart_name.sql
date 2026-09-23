-- チャート名（name）：スライドのタイトル（title）とは別に、一覧で見分けるための名前
alter table public.view_specs add column name text not null default '';
update public.view_specs set name = title where name = '';
create index view_specs_owner_name_idx on public.view_specs (owner_id, name);

-- save_chart に p_name を追加（引数が変わるので作り直す）
drop function if exists public.save_chart(uuid, text, jsonb, jsonb, jsonb, text);

-- p_name が null なら、新規ではタイトル、上書きでは今の名前のまま
create or replace function public.save_chart(
  p_view_spec_id uuid,
  p_name         text,
  p_title        text,
  p_dataset      jsonb,
  p_spec         jsonb,
  p_ui           jsonb,
  p_project_name text default 'マイプロジェクト'
) returns table (saved_id uuid, saved_version integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_project uuid;
  v_dataset uuid;
  v_id      uuid;
  v_version integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_view_spec_id is null then
    select p.id into v_project from public.projects p where p.owner_id = v_uid order by p.created_at limit 1;
    if v_project is null then
      insert into public.projects (name) values (p_project_name) returning projects.id into v_project;
    end if;
    insert into public.datasets (project_id, schema, data)
      values (v_project, p_dataset ->> 'schema', p_dataset)
      returning datasets.id into v_dataset;
    insert into public.view_specs (project_id, dataset_id, name, title, spec, ui, version)
      values (v_project, v_dataset, coalesce(nullif(trim(p_name), ''), coalesce(p_title, '')), coalesce(p_title, ''), p_spec, p_ui, 1)
      returning view_specs.id, view_specs.version into v_id, v_version;
  else
    update public.view_specs v
      set name = coalesce(nullif(trim(p_name), ''), v.name),
          title = coalesce(p_title, ''), spec = p_spec, ui = p_ui, version = v.version + 1
      where v.id = p_view_spec_id
      returning v.id, v.dataset_id, v.version into v_id, v_dataset, v_version;
    if v_id is null then
      raise exception 'view_spec not found' using errcode = 'P0002';
    end if;
    update public.datasets d set data = p_dataset, schema = p_dataset ->> 'schema' where d.id = v_dataset;
  end if;

  update public.view_specs v
    set spec = v.spec || jsonb_build_object('id', v_id, 'version', v_version, 'datasetId', v_dataset)
    where v.id = v_id;

  insert into public.view_spec_versions (view_spec_id, version, spec, dataset, ui)
    select v.id, v.version, v.spec, p_dataset, p_ui from public.view_specs v where v.id = v_id;

  return query select v_id, v_version;
end $$;

revoke all on function public.save_chart(uuid, text, text, jsonb, jsonb, jsonb, text) from public, anon;
grant execute on function public.save_chart(uuid, text, text, jsonb, jsonb, jsonb, text) to authenticated;
