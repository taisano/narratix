'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useT } from '@/i18n/ui';
import { localize, registry } from '@/registry';
import { HISTORY_LIMIT, REUSE_KEY, deleteHistory, listHistory, setStarred, type HistoryItem } from '@/lib/repo/history';
import { useAuth } from '../shell/AppShell';
import { useConfirm } from '../shared/Confirm';
import css from '../ui.module.css';
import my from './my-page.module.css';

/** マイページ：相談の履歴（新しい100件＋☆を付けたもの）。検索・☆・もう一度・削除 */
export function HistoryList() {
  const t = useT();
  const locale = useLocale();
  const auth = useAuth();
  const router = useRouter();
  const [list, setList] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [onlyStar, setOnlyStar] = useState(false);
  const confirm = useConfirm();

  const refresh = useCallback(async () => {
    if (!auth.client) return;
    try { setList(await listHistory(auth.client)); setError(null); }
    catch (e) { setError(t('history.error', { message: (e as Error).message ?? String(e) })); }
  }, [auth.client, t]);
  useEffect(() => { void refresh(); }, [refresh]);

  const shown = useMemo(() => {
    if (!list) return null;
    const q = query.trim().toLowerCase();
    return list.filter((h) => (!onlyStar || h.starred) && (!q || h.text.toLowerCase().includes(q)));
  }, [list, query, onlyStar]);

  const date = (iso: string) => new Date(iso).toLocaleString(locale === 'ja' ? 'ja-JP' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const act = async (fn: () => Promise<void>) => { try { await fn(); await refresh(); } catch (e) { setError(t('history.error', { message: (e as Error).message ?? String(e) })); } };
  const again = (text: string) => {
    try { sessionStorage.setItem(REUSE_KEY, text); } catch { /* 使えない時は入り口だけ開く */ }
    router.push('/start');
  };

  return (
    <div>
      <p className={my.historyNote}>{t('history.note', { n: HISTORY_LIMIT })}</p>
      <div className={my.toolbar}>
        <input className={`${css.input} ${my.search}`} type="search" placeholder={t('history.search')} aria-label={t('history.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className={my.onlyStar}><input type="checkbox" checked={onlyStar} onChange={(e) => setOnlyStar(e.target.checked)} />{t('history.onlyStar')}</label>
      </div>
      {error && <p className={css.error} role="alert">{error}</p>}
      {!shown ? (!error && <p className={css.note}>{t('my.loading')}</p>)
        : list!.length === 0 ? <p className={my.emptyBox}>{t('history.empty')}</p>
        : shown.length === 0 ? <p className={css.note}>{t('my.noMatch')}</p>
        : (
          <ul className={my.history}>
            {shown.map((h) => (
              <li key={h.id} className={my.hItem}>
                <button type="button" className={my.star} aria-pressed={h.starred} aria-label={h.starred ? t('history.unstar') : t('history.star')} title={h.starred ? t('history.unstar') : t('history.star')}
                  onClick={() => act(() => setStarred(auth.client!, h.id, !h.starred))}>{h.starred ? '★' : '☆'}</button>
                <p className={my.hText}>{h.text}</p>
                <p className={my.hMeta}>
                  <span>{date(h.createdAt)}</span>
                  <span className={my.hTag}>{h.classifier === 'ai' ? t('history.byAi') : t('history.byRules')}</span>
                  {h.chartId && <Link href={`/?chart=${h.chartId}`} className={css.linkBtn}>{t('history.openChart')}</Link>}
                </p>
                {h.recommended.length > 0 && (
                  <p className={my.hRecipes}>{t('history.recipes', { names: h.recommended.map((id) => (registry.recipes[id] ? localize(registry.recipes[id].name, locale) : id)).join('、') })}</p>
                )}
                <div className={my.hActions}>
                  <button type="button" className={css.linkBtn} onClick={() => again(h.text)}>{t('history.again')}</button>
                  <button type="button" className={css.linkBtn} onClick={async () => {
                    if (await confirm({ title: t('confirm.historyTitle'), body: t('confirm.historyBody', { text: h.text.slice(0, 80) }), ok: t('confirm.delete'), danger: true })) void act(() => deleteHistory(auth.client!, h.id));
                  }}>{t('save.delete')}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
