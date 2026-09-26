-- タグ：保存したチャートと Library の見本に。スライドの言語（日本語 / English）は保存のたびに画面側で自動で付ける。
-- Library の「カテゴリ」はタグに移す（category 列は互換のため残すが、もう使わない）。

create function public.valid_tags(t text[]) returns boolean
language sql immutable as $$
  select cardinality(t) <= 20 and not exists (select 1 from unnest(t) x where char_length(x) not between 1 and 30);
$$;

alter table public.view_specs add column tags text[] not null default '{}' check (public.valid_tags(tags));
alter table public.library_items add column tags text[] not null default '{}' check (public.valid_tags(tags));
create index view_specs_tags_idx on public.view_specs using gin (tags);
create index library_items_tags_idx on public.library_items using gin (tags);

-- 今までの分：言語のタグと、見本のカテゴリ
update public.view_specs
  set tags = array[case when ui->>'slideLocale' = 'en' then 'English' else '日本語' end];
update public.library_items
  set tags = array[case when project->>'slideLocale' = 'en' then 'English' else '日本語' end]
           || case when category <> '' and category not in ('日本語', 'English') then array[left(category, 30)] else '{}'::text[] end;
