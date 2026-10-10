'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/i18n/ui';
import { REVIEW_EVENTS, snooze, snoozed } from '@/lib/reviewEvents';
import { reviewEligible } from '@/lib/repo/reviews';
import { useAuth, useBetaAccess } from '../shell/AppShell';
import { ReviewDialog, StarPicker } from './ReviewDialog';
import { ShareDialog } from '../shell/ShareDialog';
import css from './reviews.module.css';

/**
 * レビューの依頼カードと入力画面の受け皿（AppShell に1つ）。
 * ・出力・保存の直後（askForReview）：まだ書いていない人で、PPT 出力 2 回以上／保存 3 回以上の人にだけ、小さなカードを出す。「あとで」で30日は出さない。
 * ・設定メニューなど（openReview）：入力画面をそのまま開く。
 */
export function ReviewHost() {
  const t = useT();
  const auth = useAuth();
  const beta = useBetaAccess();
  const member = beta.state.kind === 'active';
  const [card, setCard] = useState(false);
  const [share, setShare] = useState(false);
  const [dialog, setDialog] = useState<{ rating?: number } | null>(null);
  const client = auth.client;

  useEffect(() => {
    const ask = () => {
      if (!client || !member || snoozed()) return;
      void reviewEligible(client).then((ok) => { if (ok) setCard(true); });
    };
    const open = (e: Event) => { setCard(false); setDialog({ rating: (e as CustomEvent<{ rating?: number }>).detail?.rating }); };
    window.addEventListener(REVIEW_EVENTS.ASK, ask);
    const openShare = () => setShare(true);
    window.addEventListener(REVIEW_EVENTS.OPEN, open);
    window.addEventListener(REVIEW_EVENTS.SHARE, openShare);
    return () => { window.removeEventListener(REVIEW_EVENTS.ASK, ask); window.removeEventListener(REVIEW_EVENTS.OPEN, open); window.removeEventListener(REVIEW_EVENTS.SHARE, openShare); };
  }, [client, member]);

  return (
    <>
      {card && !dialog && (
        <section className={css.card} role="status" aria-label={t('review.cardTitle')}>
          <p className={css.cardTitle}>{t('review.cardTitle')}</p>
          <StarPicker value={0} onChange={(n) => { setCard(false); setDialog({ rating: n }); }} label={t('review.rating')} />
          <div className={css.cardRow}>
            <small>{t('review.cardNote')}</small>
            <button type="button" className={css.later} onClick={() => { snooze(); setCard(false); }}>{t('review.later')}</button>
          </div>
        </section>
      )}
      {share && <ShareDialog onClose={() => setShare(false)} />}
      {dialog && <ReviewDialog initialRating={dialog.rating} onClose={() => { setDialog(null); snooze(); }} />}
    </>
  );
}
