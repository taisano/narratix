'use client';

import { useState } from 'react';
import { useT } from '@/i18n/ui';
import { parseTable, replaceWithTable } from './edit';
import { yearsInColumns } from './project';
import type { BuilderState } from './state';
import css from '../ui.module.css';

/**
 * ストーリーのグラフで、まだデータが無い（見本のまま）時に、スライドの場所に出す貼り付け欄。
 * 見本のグラフは出さない（見本のまま資料を作る事故を防ぐ）。決めるのはこのスライドを開いた時だけ：
 * 貼り付けてグラフにする／［見本で進める］（そのスライドでは二度と聞かない）
 */
export function DataFirst({ state, needs, wantsTimeRows, onData, onTranspose, onKeep }: {
  state: BuilderState;
  /** 要るデータの形（例：行＝時間（年など）× 列＝項目） */
  needs: string;
  wantsTimeRows: boolean;
  onData: (next: BuilderState) => void;
  onTranspose: () => void;
  onKeep: () => void;
}) {
  const t = useT();
  const [text, setText] = useState('');
  const parsed = text.trim() ? parseTable(text) : null;
  // 数が1つも無い（ただの文）は表として読まない
  const ok = !!parsed && parsed.rows.length > 0 && parsed.cols.length > 0 && parsed.values.some((r) => r.some((v) => v != null));
  return (
    <div className={css.dataFirst}>
      <p className={css.dataFirstHead}>{t('story.dataFirst')}</p>
      <p className={css.dataFirstNeeds}>{t('grid.needs', { needs })}</p>
      <textarea className={css.dataFirstArea} aria-label={t('grid.pasteLabel')} value={text} placeholder={t('grid.pastePlaceholder')} onChange={(e) => setText(e.target.value)} />
      {text.trim() && !ok && <p className={css.dataFirstBad} role="alert">{t('story.dataFirstBad')}</p>}
      {ok && <p className={css.dataFirstNeeds}>{t('story.dataFirstRead', { rows: parsed!.rows.length, cols: parsed!.cols.length })}</p>}
      <div className={css.dataFirstBtns}>
        <button type="button" className={css.primary} disabled={!ok} onClick={() => {
          if (!ok) return;
          const next = replaceWithTable(state, 'current', parsed!);
          onData(next);
          // 年が列に並んでいたら、推移のグラフに合わせて行と列を入れ替える（データの欄と同じ）
          if (wantsTimeRows && yearsInColumns(next.dataset)) onTranspose();
        }}>{t('story.dataFirstGo')}</button>
        <button type="button" className={css.linkBtn} onClick={onKeep}>{t('story.sampleKeep')}</button>
      </div>
    </div>
  );
}
