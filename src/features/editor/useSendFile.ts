'use client';

import { useState } from 'react';
import type { MessageKey } from '@/i18n/ui';
import { sendFile } from './pptExport';

type T = (k: MessageKey, v?: Record<string, string | number>) => string;
type Result = Awaited<ReturnType<typeof sendFile>>;

/**
 * PPT を送る（端末の共有の画面、無ければメールソフト）。
 * 作るのに時間がかかって共有の画面が開けなかった時は pending に残し、「送信の画面を開く」をもう一度押してもらう
 */
export function useSendFile() {
  const [pending, setPending] = useState<{ file: File; subject: string; body: string } | null>(null);
  async function send(file: File, subject: string, body: string): Promise<Result> {
    const r = await sendFile(file, subject, body);
    setPending(r === 'retry' ? { file, subject, body } : null);
    return r;
  }
  async function retry(): Promise<Result | null> {
    if (!pending) return null;
    const r = await sendFile(pending.file, pending.subject, pending.body);
    setPending(r === 'retry' ? pending : null);
    return r;
  }
  return { pending, send, retry };
}

/** 送った後の一言 */
export function sendNote(r: Result, t: T): string {
  if (r === 'mailto') return t('share.mailto');
  if (r === 'retry') return t('share.retryNote');
  return '';
}
