'use client';

import { useState } from 'react';
import { useT } from '@/i18n/ui';
import { datasetKey, type ProjectState } from './project';
import { tableToTsv } from './long';
import css from './guide.module.css';

const MAX_ROWS = 4;
const MAX_COLS = 4;

/**
 * テンプレート（Library）を複製した直後の案内：いまの表はテンプレートの見本。
 * どんな形の表を貼ればよいか（見本の表の形）と、貼る・見本をコピーする、の2つの操作を、データ欄のすぐ上に出す。
 * 自分のデータに替わったら（表の指紋が複製した時と変わったら）出さない
 */
export function TemplateDataGuide({ project, needs, onPaste }: { project: ProjectState; needs: string; onPaste: () => void }) {
  const t = useT();
  const [closed, setClosed] = useState(false);
  const [copied, setCopied] = useState<'ok' | 'ng' | null>(null);
  const o = project.origin;
  if (!o || o.kind !== 'library' || !o.dataKey || closed || datasetKey(project.dataset) !== o.dataKey) return null;
  const d = project.dataset;
  const cols = d.cols.slice(0, MAX_COLS);
  const rows = d.rows.slice(0, MAX_ROWS);
  const vals = d.periods.current.values;
  const num = (r: number, c: number) => { const v = vals[r]?.[c]; return v == null ? '' : v.toLocaleString(); };
  async function copy() {
    try { await navigator.clipboard.writeText(tableToTsv(d)); setCopied('ok'); } catch { setCopied('ng'); }
  }
  return (
    <section className={css.guide} aria-label={t('guide.title')} data-testid="template-data-guide">
      <div className={css.head}>
        <h3 className={css.title}>{t('guide.title')}</h3>
        <button type="button" className={css.close} aria-label={t('guide.close')} onClick={() => setClosed(true)}>×</button>
      </div>
      <p className={css.lead}>{t('guide.lead', { title: o.title })}</p>
      <div className={css.shape} role="img" aria-label={t('guide.shapeLabel')}>
        <table className={css.mini}>
          <thead>
            <tr><th>{d.dimensions?.rows || ''}</th>{cols.map((c) => <th key={c}>{c}</th>)}{d.cols.length > MAX_COLS && <th>…</th>}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => <tr key={r}><th>{r}</th>{cols.map((c, k) => <td key={c}>{num(i, k)}</td>)}{d.cols.length > MAX_COLS && <td>…</td>}</tr>)}
            {d.rows.length > MAX_ROWS && <tr><th>…</th>{cols.map((c) => <td key={c}>…</td>)}</tr>}
          </tbody>
        </table>
        <p className={css.shapeNote}>{t('guide.shape', { rows: d.rows.length, cols: d.cols.length })}</p>
      </div>
      <p className={css.needs}>{t('grid.needs', { needs })}</p>
      <ol className={css.steps}>
        <li>{t('guide.step1')}</li>
        <li>{t('guide.step2')}</li>
        <li>{t('guide.step3')}</li>
      </ol>
      <div className={css.actions}>
        <button type="button" className={css.primary} onClick={onPaste}>{t('guide.paste')}</button>
        <button type="button" className={css.secondary} onClick={() => void copy()}>{t('guide.copy')}</button>
        {copied && <span className={css.copied} role="status">{t(copied === 'ok' ? 'guide.copied' : 'guide.copyFailed')}</span>}
      </div>
    </section>
  );
}
