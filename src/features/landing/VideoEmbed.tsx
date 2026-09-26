'use client';

import { useState } from 'react';
import { useT } from '@/i18n/ui';
import { INTRO_VIDEO_PLACEHOLDER, INTRO_VIDEO_URL, youtubeId } from './config';
import css from './landing.module.css';

/**
 * 紹介動画。押すまでは画像だけを出し、押したら YouTube を読み込む（ページを軽く保ち、押す前は YouTube に通信しない）。
 * 動画の URL は config.ts。仮の URL のうちは「準備中」と出す。
 */
export function VideoEmbed({ poster }: { poster: string }) {
  const t = useT();
  const [play, setPlay] = useState(false);
  const id = youtubeId(INTRO_VIDEO_URL);
  return (
    <div className={css.videoBox}>
      {play && id ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={t('landing.video.title')}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button type="button" className={css.videoPoster} onClick={() => setPlay(true)} aria-label={t('landing.video.play')}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={poster} alt="" loading="lazy" decoding="async" />
          <span className={css.videoPlay} aria-hidden="true">▶</span>
          {INTRO_VIDEO_PLACEHOLDER && <span className={css.videoSoon}>{t('landing.video.soon')}</span>}
        </button>
      )}
    </div>
  );
}
