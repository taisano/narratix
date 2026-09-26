-- 端末ごとの使われ方の計測（スマホで何をしようとしているか）。
-- ab_events に端末の種類（phone / tablet / desktop）を足し、エディター・マイページ・かんたん修正のイベントを足す。
-- 送るのは種類だけ（機種・画面の大きさ・ブラウザ名などは送らない）。

alter table public.ab_events
  add column if not exists device text check (device is null or device in ('phone', 'tablet', 'desktop'));

alter table public.ab_events drop constraint if exists ab_events_event_check;
alter table public.ab_events add constraint ab_events_event_check check (event in (
  'landing_view', 'landing_primary_cta_click', 'landing_examples_click', 'landing_prebuilt_click',
  'start_view', 'start_consultation_selected', 'start_purpose_selected', 'start_chart_library_opened',
  'angle_selection_completed', 'library_opened',
  'editor_opened', 'my_page_opened', 'quick_edit_opened', 'quick_edit_saved', 'quick_edit_exported'
));

-- 端末ごとの見方（管理者が SQL Editor で）：
--   select device, event, count(distinct visitor) as people
--   from public.ab_events where created_at > now() - interval '30 days' group by 1, 2 order by 2, 1;
