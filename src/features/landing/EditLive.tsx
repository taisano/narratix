'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useT, type MessageKey } from '@/i18n/ui';
import type { EditLive as EditLiveData } from './slides';
import css from './landing.module.css';

/** 操作の順番：何を替えたか（見出し）、どの機能か（左の一覧の何番目）、どの絵か */
const STEPS: { cap: MessageKey; feature: number | null; frame: number }[] = [
  { cap: 'landing.edit.cap.once', feature: null, frame: 0 },
  { cap: 'landing.edit.cap.switch', feature: 0, frame: 1 },
  { cap: 'landing.edit.cap.swap', feature: 1, frame: 2 },
  { cap: 'landing.edit.cap.highlight', feature: 2, frame: 3 },
  { cap: 'landing.edit.cap.cagr', feature: 3, frame: 4 },
  { cap: 'landing.edit.cap.filter', feature: 4, frame: 5 },
  { cap: 'landing.edit.cap.same', feature: null, frame: 5 },
];
const FEATURES: MessageKey[] = ['landing.edit.f.switch', 'landing.edit.f.swap', 'landing.edit.f.highlight', 'landing.edit.f.add', 'landing.edit.f.filter'];
const STEP_MS = 1150;

/**
 * 04 EDIT LIVE：左にメッセージと機能の一覧、右に編集画面の見本。
 * 右の左側の表（データ）は動かさず、スライドだけが操作に合わせて替わる（本物のエンジンで描いた見本）。
 * 画面に見えている間だけ自動で進む。動きを減らす設定の人には自動で進めない（機能を押すと、その場面を出す）
 */
export function EditLive({ data, onCta }: { data: EditLiveData; onCta: () => void }) {
  const t = useT();
  const [step, setStep] = useState(0);
  const [auto, setAuto] = useState(true);
  const [visible, setVisible] = useState(false);
  // マウスを載せている間は止める（離すと続きから）
  const [hover, setHover] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) setAuto(false);
    const el = root.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!auto || !visible || hover) return;
    const id = window.setInterval(() => setStep((s) => (s + 1) % STEPS.length), STEP_MS);
    return () => window.clearInterval(id);
  }, [auto, visible, hover]);

  const cur = STEPS[step]!;
  const highlight = step >= 3;
  const filtered = step >= 5;
  return (
    <div className={css.editLive} ref={root}>
      <div className={css.editCopy}>
        <p className={css.index}>04 / EDIT LIVE</p>
        <h2 id="edit-title" className={css.h2}>{t('landing.edit.title')}</h2>
        <p className={css.body}>{t('landing.edit.body')}</p>
        <ul className={css.editFeatures}>
          {FEATURES.map((k, i) => (
            <li key={k}>
              <button type="button" className={css.editFeature} aria-pressed={cur.feature === i} onClick={() => { setAuto(false); setStep(STEPS.findIndex((s) => s.feature === i)); }}>
                <span className={css.editDot} aria-hidden="true" />{t(k)}
              </button>
            </li>
          ))}
        </ul>
        <Link href="/editor?new=1" className={css.textLink} onClick={onCta}>{t('landing.edit.cta')} →</Link>
      </div>

      <div className={css.editStage} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} aria-label={t('landing.edit.stageLabel')} role="group">
        <div className={css.editBar}>
          <span className={css.editDots} aria-hidden="true"><i /><i /><i /></span>
          <span className={css.editCap} aria-live="polite">{t(cur.cap)}</span>
          {!auto && <button type="button" className={css.editPlay} onClick={() => setAuto(true)}>{t('landing.edit.play')}</button>}
        </div>
        <div className={css.editBody}>
          {/* データ（動かない） */}
          <div className={css.editData}>
            <p className={css.editDataHead}>{t('landing.edit.data')}<span className={css.editLock}>{t('landing.edit.fixed')}</span></p>
            <table className={css.editTable}>
              <thead>
                <tr><th />{data.table.cols.map((c) => (
                  <th key={c} className={`${highlight && c === data.focus ? css.editFocus : ''} ${filtered && c === data.hidden ? css.editHidden : ''}`}>{c}</th>
                ))}</tr>
              </thead>
              <tbody>
                {data.table.rows.map((r, i) => (
                  <tr key={r}><th>{r}</th>{data.table.cols.map((c, k) => (
                    <td key={c} className={`${highlight && c === data.focus ? css.editFocus : ''} ${filtered && c === data.hidden ? css.editHidden : ''}`}>{data.table.values[i]?.[k] ?? ''}</td>
                  ))}</tr>
                ))}
              </tbody>
            </table>
            {data.table.unit && <p className={css.editUnit}>{t('landing.edit.unit', { unit: data.table.unit })}</p>}
          </div>
          {/* スライド（操作に合わせて替わる） */}
          <div className={css.editPreview}>
            {data.frames.map((svg, i) => (
              <div key={i} className={css.editFrame} data-on={cur.frame === i} aria-hidden={cur.frame !== i} dangerouslySetInnerHTML={{ __html: svg }} />
            ))}
          </div>
        </div>
        <p className={css.dummy}>{t('landing.dummy')}</p>
      </div>
    </div>
  );
}
