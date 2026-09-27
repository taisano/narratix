-- Coach 型の切り口選定の計測（docs/decisions.md）。
-- 重視点の質問・推定、リード案の表示・採用、別の見せ方の表示・差し替え、補助スライドの追加、AI の再実行。
-- 送るのは決まった短い識別子だけ（重視点・レシピの ID）。相談文やデータは送らない。

alter table public.ab_events drop constraint if exists ab_events_event_check;
alter table public.ab_events add constraint ab_events_event_check check (event in (
  'landing_view', 'landing_primary_cta_click', 'landing_examples_click', 'landing_prebuilt_click',
  'start_view', 'start_consultation_selected', 'start_purpose_selected', 'start_chart_library_opened',
  'angle_selection_completed', 'library_opened',
  'editor_opened', 'my_page_opened', 'quick_edit_opened', 'quick_edit_saved', 'quick_edit_exported',
  'coach_emphasis_shown', 'coach_emphasis_selected', 'coach_emphasis_inferred', 'coach_lead_shown', 'coach_lead_accepted',
  'coach_alternatives_opened', 'coach_alternative_previewed', 'coach_lead_replaced', 'coach_supplement_added', 'coach_ai_rerun'
));

-- 見方（管理者が SQL Editor で）：
--   select event, detail, count(distinct visitor) as people
--   from public.ab_events where event like 'coach_%' and created_at > now() - interval '30 days'
--   group by 1, 2 order by 1, 3 desc;
