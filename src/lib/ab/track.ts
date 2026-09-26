'use client';

import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { EXPERIMENT, storedVariant, visitorId, type Variant } from './variant';

/**
 * A/B の計測（docs/landing-plan.md）。記録先は Supabase の ab_events だけ。
 * 送るのは：イベント名・案・ブラウザごとのランダムな番号・ログイン中か・決まった短い値（目的の識別子など）。
 * 相談文・データ・メールなどは送らない。失敗しても画面は止めない。
 */
export type TrackEvent =
  | 'landing_view' | 'landing_primary_cta_click' | 'landing_examples_click' | 'landing_prebuilt_click'
  | 'start_view' | 'start_consultation_selected' | 'start_purpose_selected' | 'start_chart_library_opened'
  | 'angle_selection_completed' | 'library_opened';

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
  };
  try {
    void createClient().from('ab_events').insert(row).then(() => {}, () => {});
  } catch { /* 記録できなくても続ける */ }
}
