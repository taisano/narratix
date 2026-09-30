'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/i18n/ui';

/** 前の「ストーリーの画面」（/story?id=…）は、編集画面のストーリーの形へ移した（docs/decisions.md）。古いリンクはそちらへ */
export default function StoryRedirect() {
  const t = useT();
  const router = useRouter();
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    router.replace(id ? `/editor?story=${encodeURIComponent(id)}` : '/charts');
  }, [router]);
  return <p style={{ padding: 24 }}>{t('my.loading')}</p>;
}
