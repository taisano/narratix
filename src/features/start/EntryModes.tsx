'use client';

import { useEffect, useState } from 'react';
import { useLocale, useT } from '@/i18n/ui';
import { STORY_TEMPLATES, localize, type CreationMode } from '@/registry';
import { track } from '@/lib/ab/track';
import { readOutline, type OutlineKind } from '../story/outline';
import e from './entry.module.css';

/**
 * 相談の入口の3つの実行ボタン（docs/decisions.md「相談入口の3つの入口」）。押すとその形で相談を送る（選んでから「次へ」の二段にしない）。
 * Story と Coach は Pro。使えないプランでは隠さず、押すと相談を送らずに、すぐ下で Pro でできることを説明する（相談文は消さない）
 */

const MODES: readonly CreationMode[] = ['ONE_SLIDE', 'STORY', 'COACH_RECOMMEND'];
const PRO: ReadonlySet<CreationMode> = new Set(['STORY', 'COACH_RECOMMEND']);
const KEY: Record<CreationMode, 'one' | 'story' | 'coach'> = { ONE_SLIDE: 'one', STORY: 'story', COACH_RECOMMEND: 'coach' };

// ──────────── 入れた相談文と、最後に押した入口（このタブの間だけ残す） ────────────

const DRAFT_KEY = 'chart-advisor:entry-draft';
export interface EntryDraft { text: string; mode: CreationMode | null }
export function readEntryDraft(): EntryDraft | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null') as EntryDraft | null;
    if (!v || typeof v.text !== 'string') return null;
    return { text: v.text, mode: MODES.includes(v.mode as CreationMode) ? v.mode : null };
  } catch { return null; }
}
export function writeEntryDraft(d: EntryDraft) {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* 残せなくても相談はできる */ }
}

/** 相談文に書かれた見せ方の名前（Pro の説明を、この相談に合わせて具体的にする。規則で読める範囲だけ） */
export function outlineNames(text: string, locale: 'ja' | 'en'): string[] {
  const o = readOutline(text);
  if (!o) return [];
  const name = (k: OutlineKind) => (k === 'GRAPH_TREND' ? (locale === 'ja' ? '推移グラフ' : 'Trend chart') : localize(STORY_TEMPLATES[k].label, locale));
  return o.map(name);
}

export function EntryModes({ text, disabled, thinking, storyAllowed, lastMode, onRun }: {
  text: string; disabled: boolean; thinking: boolean; storyAllowed: boolean; lastMode: CreationMode | null; onRun: (m: CreationMode) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [running, setRunning] = useState<CreationMode | null>(null);
  const [proInfo, setProInfo] = useState<CreationMode | null>(null);
  useEffect(() => { track('entry_mode_shown', { detail: storyAllowed ? 'pro' : 'plus', oncePerPage: true }); }, [storyAllowed]);
  useEffect(() => { if (!thinking) setRunning(null); }, [thinking]);
  const locked = (m: CreationMode) => PRO.has(m) && !storyAllowed;
  const names = proInfo === 'STORY' ? outlineNames(text, locale) : [];
  const q = (s: string) => (locale === 'ja' ? `「${s}」` : `“${s}”`);
  return (
    <div className={e.modes}>
      <p className={e.modesHead} id="modes-head">{t('entry.mode.head')}</p>
      <div className={e.modeRow} role="group" aria-labelledby="modes-head">
        {MODES.map((m) => {
          const k = KEY[m];
          const lock = locked(m);
          return (
            <span key={m} className={e.modeCell}>
              <button type="button" className={e.modeBtn} data-locked={lock || undefined} data-last={!lock && lastMode === m ? true : undefined}
                disabled={!lock && (disabled || thinking)} aria-busy={running === m}
                aria-describedby={`mode-tip-${k}`} {...(lock ? { 'aria-expanded': proInfo === m, 'aria-controls': 'mode-pro' } : {})}
                onClick={() => {
                  if (lock) { const open = proInfo !== m; setProInfo(open ? m : null); if (open) track('entry_mode_clicked', { detail: `${k}:locked` }); return; }
                  setProInfo(null); setRunning(m); track('entry_mode_clicked', { detail: `${k}:${storyAllowed ? 'pro' : 'plus'}` }); onRun(m);
                }}>
                {lock && <svg className={e.lock} viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>}
                <span className={e.modeLabel}>{running === m ? t('entry.ai.thinking') : t(`entry.mode.${k}`)}</span>
                {PRO.has(m) && <span className={e.proBadge}>{t('entry.mode.pro')}</span>}
              </button>
              <span id={`mode-tip-${k}`} role="tooltip" className={e.modeTip}>{t(`entry.mode.${k}Tip`)}{lock ? t('entry.mode.proOnly') : ''}</span>
            </span>
          );
        })}
      </div>
      {proInfo && (
        <div id="mode-pro" className={e.proInfo} role="region" aria-label={t('entry.mode.proInfoLabel')}>
          <p>
            {proInfo === 'STORY'
              ? (names.length >= 2 ? t('entry.mode.proOutline', { list: names.map(q).join(locale === 'ja' ? '' : ', '), n: names.length }) : t('entry.mode.proStory'))
              : t('entry.mode.proCoach')}
          </p>
          <p className={e.proNote}>{t('entry.mode.proKeep')}</p>
          <button type="button" className={e.linkBtn} onClick={() => setProInfo(null)}>{t('entry.mode.proClose')}</button>
        </div>
      )}
    </div>
  );
}
