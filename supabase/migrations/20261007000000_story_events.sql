-- Story の計測（docs/story-spec.md 5章）：1枚か Story かの確認への答え、進め方の切り替え、Story を始めた。
-- 送るのは決まった短い識別子だけ（fact／reason、to_one／to_story、Question の数）。相談文やデータは送らない。

alter table public.ab_events drop constraint if exists ab_events_event_check;
alter table public.ab_events add constraint ab_events_event_check check (event in (
  'landing_view', 'landing_primary_cta_click', 'landing_examples_click', 'landing_prebuilt_click',
  'start_view', 'start_consultation_selected', 'start_purpose_selected', 'start_chart_library_opened',
  'angle_selection_completed', 'library_opened',
  'editor_opened', 'my_page_opened', 'quick_edit_opened', 'quick_edit_saved', 'quick_edit_exported',
  'coach_emphasis_shown', 'coach_emphasis_selected', 'coach_emphasis_inferred', 'coach_lead_shown', 'coach_lead_accepted',
  'coach_alternatives_opened', 'coach_alternative_previewed', 'coach_lead_replaced', 'coach_supplement_added', 'coach_ai_rerun',
  'story_scope_answered', 'story_scope_switched', 'story_started'
));
