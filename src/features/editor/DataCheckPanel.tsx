'use client';

import { useT, type MessageKey } from '@/i18n/ui';
import { sortIssues, type CheckOptions, type CheckResult, type DataIssue } from './dataCheck';
import css from './grid.module.css';

/** 並べるセルの数（多い時は「ほか N 件」） */
const MAX_CELLS = 6;

/**
 * 貼り付けの健康診断（Coach の言葉で）。
 * ・何も気になる点が無ければ「このまま入れられます」
 * ・エラー（正しいチャートを作れない）は止めて、直し方を言う
 * ・要確認・確認は、どのセルが・なぜ・どうするか。選べるものはチェック（既定はおすすめの方）
 * ・読み方のメモ（空行を飛ばした・▲をマイナスとして読んだなど）は畳んでおく
 */
export function DataCheckPanel({ check, opts, setOpts }: { check: CheckResult; opts: CheckOptions; setOpts: (o: CheckOptions) => void }) {
  const t = useT();
  const issues = sortIssues(check.issues);
  const errors = issues.filter((i) => i.level === 'error');
  const main = issues.filter((i) => i.level === 'warning' || i.level === 'confirm');
  const notes = issues.filter((i) => i.level === 'info');
  const s = check.summary;
  const head = errors.length
    ? t('check.headError')
    : main.length
      ? t('check.headIssues', { rows: s.rows, cols: s.cols, numbers: s.numbers, n: main.length })
      : t('check.headOk', { rows: s.rows, cols: s.cols, numbers: s.numbers });

  const item = (i: DataIssue, k: number) => (
    <li key={`${i.code}-${k}`} className={css.checkItem} data-level={i.level}>
      <span className={css.checkTag}>{t(`check.level.${i.level}` as MessageKey)}</span>
      <span className={css.checkText}>
        {t(`check.${i.code}` as MessageKey, i.vars)}
        {i.cells && i.cells.length > 0 && (
          <span className={css.checkCells}>
            {t('check.cells', { cells: i.cells.slice(0, MAX_CELLS).join('、') })}
            {i.cells.length > MAX_CELLS ? t('check.more', { n: i.cells.length - MAX_CELLS }) : ''}
          </span>
        )}
        {i.option && (
          <label className={css.checkOpt}>
            <input type="checkbox" checked={opts[i.option]} onChange={(e) => setOpts({ ...opts, [i.option!]: e.target.checked })} />
            {t(`check.opt.${i.option}` as MessageKey, i.vars)}
          </label>
        )}
      </span>
    </li>
  );

  return (
    <div className={css.check} role="status" aria-live="polite">
      <p className={css.checkHead} data-state={errors.length ? 'error' : main.length ? 'issues' : 'ok'}>
        <b className={css.checkBadge} aria-hidden="true">C</b>{head}
      </p>
      {errors.length > 0 && <ul className={css.checkList}>{errors.map(item)}</ul>}
      {!errors.length && main.length > 0 && <ul className={css.checkList}>{main.map(item)}</ul>}
      {!errors.length && notes.length > 0 && (
        <details className={css.checkNotes}>
          <summary>{t('check.notes', { n: notes.length })}</summary>
          <ul className={css.checkList}>{notes.map(item)}</ul>
        </details>
      )}
      {!errors.length && main.length > 0 && <p className={css.checkFoot}>{t('check.foot')}</p>}
    </div>
  );
}
