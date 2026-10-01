'use client';

import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { EXPERIMENT, storedVariant, visitorId, type Variant } from './variant';
import { deviceType } from './device';

/**
 * A/B の計測（docs/landing-plan.md）。記録先は Supabase の ab_events だけ。
 * 送るのは：イベント名・案・ブラウザごとのランダムな番号・ログイン中か・端末の種類（スマホ・タブレット・パソコン）・決まった短い値（目的の識別子など）。
 * 相談文・データ・メールなどは送らない。失敗しても画面は止めない。
 */
export type TrackEvent =
  | 'landing_view' | 'landing_primary_cta_click' | 'landing_examples_click' | 'landing_prebuilt_click'
  | 'start_view' | 'start_consultation_selected' | 'start_purpose_selected' | 'start_chart_library_opened'
  | 'angle_selection_completed' | 'library_opened'
  // 端末ごとの使われ方（スマホで何をしようとしているか）
  | 'editor_opened' | 'my_page_opened' | 'quick_edit_opened' | 'quick_edit_saved' | 'quick_edit_exported'
  // Coach 型の切り口選定（docs/decisions.md）
  | 'coach_emphasis_shown' | 'coach_emphasis_selected' | 'coach_emphasis_inferred' | 'coach_lead_shown' | 'coach_lead_accepted'
  | 'coach_alternatives_opened' | 'coach_alternative_previewed' | 'coach_lead_replaced' | 'coach_supplement_added' | 'coach_ai_rerun'
  // Story：1枚か Story かの確認への答え・進め方の切り替え・Story を始めた（docs/story-spec.md 5章）
  | 'story_scope_answered' | 'story_scope_switched' | 'story_started'
  // 相談の入口の3つの入口（表示・押下・Pro の説明・入口と最後に選んだ形）。docs/decisions.md「相談入口の3つの入口」
  | 'entry_mode_shown' | 'entry_mode_clicked' | 'entry_mode_outcome'
  // 1枚のスライドを作る画面：問い・形の選び直し、作り始めるまでの秒数、AI に相談し直す確認（開いた・取り消した・実行した）
  | 'one_question_selected' | 'one_presentation_selected' | 'one_started' | 'reconsult_confirm';

/** URL の ?variant= で見ている時（確認用）は数えない */
let previewOnly = false;
export const setPreviewOnly = (v: boolean) => { previewOnly = v; };

const store = (): Storage | null => { try { return window.localStorage; } catch { return null; } };

/** 同じ画面を開くたびに何度も数えないよう、1回の表示で1度だけ（landing_view など） */
const once = new Set<string>();

export function track(event: TrackEvent, opts: { detail?: string; variant?: Variant | null; loggedIn?: boolean; oncePerPage?: boolean } = {}): void {
  if (typeof window === 'undefined' || previewOnly || !isSupabaseConfigured()) return;
  if (opts.oncePerPage) {
    const key = `${event}:${window.location.pathname}`;
    if (once.has(key)) return;
    once.add(key);
  }
  const s = store();
  const detail = opts.detail && /^[a-z0-9_,]{1,80}$/.test(opts.detail) ? opts.detail : null;
  const row = {
    experiment: EXPERIMENT,
    variant: opts.variant ?? storedVariant(s),
    visitor: visitorId(s),
    event,
    detail,
    logged_in: !!opts.loggedIn,
    device: deviceType(),
  };
  try {
    const sb = createClient();
    // 端末の列がまだ無い（SQL を流す前）時は、端末なしで記録し直す
    void sb.from('ab_events').insert(row).then(({ error }) => {
      if (error && /device/.test(error.message ?? '')) {
        const { device: _d, ...old } = row; void _d;
        void sb.from('ab_events').insert(old).then(() => {}, () => {});
      }
    }, () => {});
  } catch { /* 記録できなくても続ける */ }
}
