'use client';

import { useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n/ui';
import css from '../ui.module.css';
import cf from '../shared/confirm.module.css';

export type ExecPosition = 'first' | 'last';

/**
 * 出力の確認（［PPTを出力］［メールで送る］を押した時）。出力の設定はここでまとめて聞く（右の欄に常に出さない）：
 * Executive Summary の位置（ストーリーで、ある時だけ）・元データのスライドを付けるか・出力の枚数
 */
export function OutputDialog({ mode, slides, exec, dataSlide, onCancel, onOk }: {
  mode: 'download' | 'send';
  /** 出す枚数（データのスライドを除く） */
  slides: number;
  /** Executive Summary の位置（無ければ聞かない） */
  exec: ExecPosition | null;
  dataSlide: boolean;
  onCancel: () => void;
  onOk: (o: { exec: ExecPosition | null; dataSlide: boolean }) => void;
}) {
  const t = useT();
  const [pos, setPos] = useState<ExecPosition | null>(exec);
  const [data, setData] = useState(dataSlide);
  const [info, setInfo] = useState(false);
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    okRef.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onCancel(); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onCancel]);
  const title = mode === 'send' ? t('share.button') : t('action.downloadPptx');
  return (
    <div className={cf.overlay} onClick={onCancel}>
      <div className={cf.box} role="dialog" aria-modal="true" aria-labelledby="output-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="output-title" className={cf.title}>{title}</h2>
        {pos && (
          <fieldset className={css.outField}>
            <legend>{t('nav.execPos')}</legend>
            {(['first', 'last'] as const).map((p) => (
              <label key={p} className={css.check}><input type="radio" name="exec-pos" checked={pos === p} onChange={() => setPos(p)} />{t(`out.exec.${p}`)}</label>
            ))}
          </fieldset>
        )}
        <div className={css.outField}>
          <label className={css.check}>
            <input type="checkbox" checked={data} onChange={(e) => setData(e.target.checked)} />{t('field.dataSlide')}
            <button type="button" className={css.infoBtn} aria-label={t('out.dataInfoLabel')} aria-expanded={info} onClick={() => setInfo((v) => !v)}>i</button>
          </label>
          {info && <p className={css.note}>{t('out.dataInfo')}</p>}
        </div>
        <dl className={css.outCount}>
          <dt>{t('out.slides')}</dt><dd>{t('out.n', { n: slides })}</dd>
          {data && <><dt>{t('out.data')}</dt><dd>{t('out.n', { n: 1 })}</dd></>}
          <dt className={css.outTotal}>{t('out.total')}</dt><dd className={css.outTotal}>{t('out.n', { n: slides + (data ? 1 : 0) })}</dd>
        </dl>
        <div className={cf.buttons}>
          <button type="button" className="btn" onClick={onCancel}>{t('confirm.cancel')}</button>
          <button ref={okRef} type="button" className={css.primary} onClick={() => onOk({ exec: pos, dataSlide: data })}>{title}</button>
        </div>
      </div>
    </div>
  );
}
