'use client';

import { useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n/ui';
import fb from '../feedback/feedback.module.css';
import css from '../reviews/reviews.module.css';

const enc = encodeURIComponent;

/** 「このサービスを紹介する」：X・LinkedIn・Facebook・メール・リンクのコピー（スマホは端末の共有も）。送るのはサービスの紹介文とトップのリンクだけ（自分のデータは含まない） */
export function ShareDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const [canNative, setCanNative] = useState(false);
  useEffect(() => { ref.current?.showModal(); setCanNative(typeof navigator !== 'undefined' && typeof navigator.share === 'function'); }, []);

  const text = t('share.service.text');
  const url = (medium: string) => `${window.location.origin}/?utm_source=share&utm_medium=${medium}`;
  const open = (href: string) => window.open(href, '_blank', 'noopener,noreferrer,width=640,height=640');
  const items: { key: string; label: string; run: () => void }[] = [
    { key: 'x', label: 'X', run: () => open(`https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url('x'))}`) },
    { key: 'linkedin', label: 'LinkedIn', run: () => open(`https://www.linkedin.com/sharing/share-offsite/?url=${enc(url('linkedin'))}`) },
    { key: 'facebook', label: 'Facebook', run: () => open(`https://www.facebook.com/sharer/sharer.php?u=${enc(url('facebook'))}`) },
    { key: 'mail', label: t('share.service.mail'), run: () => { window.location.href = `mailto:?subject=${enc(t('app.title'))}&body=${enc(`${text}\n${url('mail')}`)}`; } },
  ];
  async function copy() {
    try { await navigator.clipboard.writeText(`${text}\n${url('copy')}`); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* コピーできなかった時は何もしない */ }
  }
  async function native() {
    try { await navigator.share({ title: t('app.title'), text, url: url('native') }); } catch { /* 取り消した時は何もしない */ }
  }

  return (
    <dialog ref={ref} className={fb.dialog} onClose={onClose} aria-labelledby="sh-title">
      <div className={fb.form}>
        <h2 id="sh-title" className={fb.title}>{t('share.service.title')}</h2>
        <p className={fb.note}>{t('share.service.lead')}</p>
        <blockquote className={css.shareText}>{text}</blockquote>
        <div className={css.shareGrid}>
          {canNative && <button type="button" className={fb.primary} onClick={native}>{t('share.service.native')}</button>}
          {items.map((i) => <button key={i.key} type="button" className={fb.secondary} onClick={i.run}>{i.label}</button>)}
          <button type="button" className={fb.secondary} onClick={copy}>{copied ? t('share.service.copied') : t('share.service.copy')}</button>
        </div>
        <p className={fb.hint}>{t('share.service.note')}</p>
        <div className={fb.buttons}><button type="button" className={fb.secondary} onClick={() => ref.current?.close()}>{t('account.close')}</button></div>
      </div>
    </dialog>
  );
}
