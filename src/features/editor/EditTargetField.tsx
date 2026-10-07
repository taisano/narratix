'use client';

import { useT } from '@/i18n/ui';
import css from '../ui.module.css';

export type EditTarget = 'slide' | 'chart' | 'complement';

/**
 * 「編集対象」セレクター（編集画面UI/UX再設計レビュー §5 対応・第2段階）。
 * スライド全体／チャート／補足情報のどれを編集しているかを選ぶ。選ぶと、対応する欄が開いてそこへスクロールする
 * （Builder 側で処理）。プレビュー上の該当パーツをクリックした時も、ここが連動して変わる
 */
export function EditTargetField({ value, onChange, hasComplement }: {
  value: EditTarget;
  onChange: (v: EditTarget) => void;
  /** 「補足情報」を選べるようにするか（右側パネル。表・CAGR表などが使えるチャートの時だけ） */
  hasComplement: boolean;
}) {
  const t = useT();
  const options: EditTarget[] = hasComplement ? ['slide', 'chart', 'complement'] : ['slide', 'chart'];
  return (
    <div className={css.field}>
      <span className={css.labelRow}>{t('editTarget.head')}</span>
      <div className={css.seg} role="radiogroup" aria-label={t('editTarget.head')}>
        {options.map((o) => (
          <button key={o} type="button" aria-pressed={value === o} onClick={() => onChange(o)}>
            {t(o === 'slide' ? 'editTarget.slide' : o === 'chart' ? 'editTarget.chart' : 'editTarget.complement')}
          </button>
        ))}
      </div>
    </div>
  );
}
