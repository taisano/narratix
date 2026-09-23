-- Chart Advisor 初期スキーマ
-- データは1つ（datasets）、見せ方は複数（view_specs）。保存のたびに view_spec_versions に履歴を残す。
-- すべての行は owner_id = auth.uid() の本人だけが読み書きできる（RLS）。

-- ---------- 共通：updated_at ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- projects ----------
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index projects_owner_idx on public.projects (owner_id);
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

-- ---------- datasets ----------
create table public.datasets (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  schema      text not null check (schema in ('MATRIX_TIME_SERIES', 'MEKKO', 'DRIVER_BRIDGE', 'BUBBLE', 'EVALUATION')),
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index datasets_owner_idx on public.datasets (owner_id);
create index datasets_project_idx on public.datasets (project_id);
create trigger datasets_updated_at before update on public.datasets
  for each row execute function public.set_updated_at();

-- ---------- view_specs ----------
create table public.view_specs (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  dataset_id  uuid not null references public.datasets (id) on delete cascade,
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null default '',
  spec        jsonb not null,   -- ViewSpec（保存・出力の正本。レジストリで検証済みのもの）
  ui          jsonb,            -- 画面の編集状態（開き直すため）
  version     integer not null default 1 check (version >= 1),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index view_specs_owner_updated_idx on public.view_specs (owner_id, updated_at desc);
create index view_specs_dataset_idx on public.view_specs (dataset_id);
create trigger view_specs_updated_at before update on public.view_specs
  for each row execute function public.set_updated_at();

-- ---------- view_spec_versions（履歴。書き換え・削除はしない） ----------
create table public.view_spec_versions (
  id            uuid primary key default gen_random_uuid(),
  view_spec_id  uuid not null references public.view_specs (id) on delete cascade,
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  version       integer not null,
  spec          jsonb not null,
  dataset       jsonb not null,
  ui            jsonb,
  created_at    timestamptz not null default now(),
  unique (view_spec_id, version)
);
create index view_spec_versions_owner_idx on public.view_spec_versions (owner_id);

-- ---------- RLS ----------
alter table public.projects enable row level security;
alter table public.datasets enable row level security;
alter table public.view_specs enable row level security;
alter table public.view_spec_versions enable row level security;

create policy "projects: owner" on public.projects
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "datasets: owner" on public.datasets
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))
  );

create policy "view_specs: owner" on public.view_specs
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))
    and exists (select 1 from public.datasets d where d.id = dataset_id and d.owner_id = (select auth.uid()))
  );

create policy "view_spec_versions: owner reads" on public.view_spec_versions
  for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "view_spec_versions: owner appends" on public.view_spec_versions
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.view_specs v where v.id = view_spec_id and v.owner_id = (select auth.uid()))
  );

-- ログインしていない利用者（anon）には何も見せない
revoke all on public.projects, public.datasets, public.view_specs, public.view_spec_versions from anon;
grant select, insert, update, delete on public.projects, public.datasets, public.view_specs to authenticated;
grant select, insert on public.view_spec_versions to authenticated;

-- ---------- 保存（1回の呼び出しで、データ・ViewSpec・履歴をまとめて書く） ----------
-- p_view_spec_id が null なら新規作成（最初のプロジェクトがなければ作る）、あれば上書きして version を1つ進める。
create or replace function public.save_chart(
  p_view_spec_id uuid,
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
    insert into public.view_specs (project_id, dataset_id, title, spec, ui, version)
      values (v_project, v_dataset, coalesce(p_title, ''), p_spec, p_ui, 1)
      returning view_specs.id, view_specs.version into v_id, v_version;
  else
    update public.view_specs v
      set title = coalesce(p_title, ''), spec = p_spec, ui = p_ui, version = v.version + 1
      where v.id = p_view_spec_id
      returning v.id, v.dataset_id, v.version into v_id, v_dataset, v_version;
    if v_id is null then
      raise exception 'view_spec not found' using errcode = 'P0002';
    end if;
    update public.datasets d set data = p_dataset, schema = p_dataset ->> 'schema' where d.id = v_dataset;
  end if;

  -- 保存した ViewSpec に、自分の id・version・データの id を書き込む
  update public.view_specs v
    set spec = v.spec || jsonb_build_object('id', v_id, 'version', v_version, 'datasetId', v_dataset)
    where v.id = v_id;

  insert into public.view_spec_versions (view_spec_id, version, spec, dataset, ui)
    select v.id, v.version, v.spec, p_dataset, p_ui from public.view_specs v where v.id = v_id;

  return query select v_id, v_version;
end $$;

revoke all on function public.save_chart(uuid, text, jsonb, jsonb, jsonb, text) from public, anon;
grant execute on function public.save_chart(uuid, text, jsonb, jsonb, jsonb, text) to authenticated;
