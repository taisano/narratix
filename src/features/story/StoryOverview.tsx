'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useLocale, useT, type MessageKey } from '@/i18n/ui';
import { PROOF_NEEDS, localize, type ProofNeedId } from '@/registry';
import { loadStory, saveStory } from '@/lib/repo/stories';
import { useAuth } from '../shell/AppShell';
import { storyDisplayTitle, type StorySlide, type StoryState } from './model';
import {
  activeNeeds, canMergeWithNext, canRemoveNeed, canSplit, groupOf, mergeWithNext, moveQuestion, neighbor, renameQuestion, setCoachingOnly, setSection,
  sizeAdvice, splitQuestion, toggleNeed, type ViewGroup,
} from './storyOps';
import { ROLE_OF, examplesOf, type Role } from './questionMap';
import css from './story.module.css';

/**
 * Story の Question Map（docs/story-spec.md 3.3・7章）。Question を Main Story／Supporting Evidence／Appendix に分けて並べ、
 * 並べ替え・置き場所の変更・スライドにしない・統合・分割・名前の変更・追加・外すができる（規則だけ。AI は使わない）。
 * 変えると自動で保存する。スライドの中身（データ・見せ方）は Story の編集画面（準備中）で入れる
 */
export default function StoryOverview() {
  const t = useT();
  const auth = useAuth();
  const [id, setId] = useState<string | null>(null);
  const [doc, setDoc] = useState<{ name: string; story: StoryState } | null>(null);
  const [error, setError] = useState<'not_found' | string | null>(null);
  const [save, setSave] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!auth.client || !auth.session) return;
    const q = new URLSearchParams(window.location.search).get('id');
    if (!q) { setError('not_found'); return; }
    setId(q);
    loadStory(auth.client, q).then(setDoc).catch((e: { code?: string; message?: string }) => setError(e.code === 'not_found' ? 'not_found' : e.message ?? String(e)));
  }, [auth.client, auth.session]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  /** 変えたら少し待って保存する（続けて操作した時は最後の1回だけ） */
  const change = (next: StoryState) => {
    if (!doc || !id || !auth.client) return;
    setDoc({ ...doc, story: next });
    setSave('saving');
    if (timer.current) clearTimeout(timer.current);
    const client = auth.client;
    timer.current = setTimeout(() => {
      // 名前は一覧で付けたものを保つ
      saveStory(client, id, next, doc.name || undefined).then(() => setSave('saved'), () => setSave('error'));
    }, 600);
  };

  const back = <Link href="/charts" className={css.back}>{t('story.back')}</Link>;
  if (auth.session === undefined) return <div className={css.wrap}><p className={css.note}>{t('my.loading')}</p></div>;
  if (!auth.session) return <div className={css.wrap}><p className={css.note}>{t('my.signedOut')}</p></div>;
  if (error) return <div className={css.wrap}>{back}<p className={css.statusErr} role="alert">{error === 'not_found' ? t('story.notFound') : t('story.error', { message: error })}</p></div>;
  if (!doc) return <div className={css.wrap}><p className={css.note}>{t('my.loading')}</p></div>;

  return <div className={css.wrap}>{back}<StoryMapView name={doc.name} story={doc.story} save={save} onChange={change} /></div>;
}

/** Question Map の本体（読み込み・保存は呼ぶ側） */
export function StoryMapView({ name, story: s, save, onChange: change }: { name: string; story: StoryState; save: 'idle' | 'saving' | 'saved' | 'error'; onChange: (s: StoryState) => void }) {
  const t = useT();
  const size = sizeAdvice(s);
  return (
    <>
      <span className={save === 'error' ? css.statusErr : css.status} role="status">{save === 'idle' ? '' : t(`story.save.${save}`)}</span>
      <h1 className={css.title}>{name || storyDisplayTitle(s) || t('story.untitled')}</h1>
      {/* いちばんの壁（primaryBarrier）はデータを見ていない読み取りなので出さない。裏で持ち、AI Story 確認などで使う */}
      {s.decisionQuestion && (
        <dl className={css.context}><dt>{t('scope.decisionLabel')}</dt><dd>{s.decisionQuestion}</dd></dl>
      )}
      <p className={css.note}>{t('story.mapLead')}</p>
      {size.level !== 'ideal' && <p className={size.level === 'over' ? css.adviceOver : css.advice}>{t(`story.size.${size.level}`, { n: size.main })}</p>}

      <QuestionList story={s} onChange={change} />
      <NeedPicker story={s} onChange={change} lead={t('story.pickLead')} />
      <p className={css.note}>{t('story.editorSoon')}</p>
    </>
  );
}

/**
 * Question の並び（② と Story の画面で共通）。Main Story／Appendix／外した Question（スライドにしない確認事項）に分けて見せる。
 * 外すと下の「外した Question」へ移り、「戻す」で元の位置に戻る（黙って消さない）
 * draft＝② の下書き（まだ Message を入れる段階ではないので、Message の行を出さない）
 */
export function QuestionList({ story: s, onChange, draft = false }: { story: StoryState; onChange: (s: StoryState) => void; draft?: boolean }) {
  const t = useT();
  const [removed, setRemoved] = useState<string | null>(null);
  const groups: { g: ViewGroup; label: MessageKey }[] = [
    { g: 'MAIN', label: 'story.section.MAIN' }, { g: 'APPENDIX', label: 'story.section.APPENDIX' }, { g: 'OUT', label: 'story.outHead' },
  ];
  const remove = (id: string) => { onChange(setCoachingOnly(s, id, true)); setRemoved(id); };
  const undo = () => { if (removed) onChange(setCoachingOnly(s, removed, false)); setRemoved(null); };
  const removedQ = removed ? s.slides.find((x) => x.id === removed && x.questionPriority === 'COACHING_ONLY') : null;
  return (
    <>
      {removedQ && (
        <p className={css.toast} role="status">{t('story.removedToast', { q: removedQ.question })} <button type="button" className={css.act} onClick={undo}>{t('story.undo')}</button></p>
      )}
      {groups.map(({ g, label }) => {
        const list = s.slides.filter((x) => groupOf(x) === g);
        if (!list.length && g !== 'MAIN') return null;
        return (
          <section key={g} className={css.section} aria-label={t(label, { n: list.length })}>
            <h2 className={css.sectionHead}>{t(label, { n: list.length })}</h2>
            {g === 'OUT' && <p className={css.note}>{t('story.outLead')}</p>}
            {!list.length && <p className={css.note}>{t('story.noQuestions')}</p>}
            <ol className={css.list}>
              {list.map((q) => <QuestionItem key={q.id} story={s} q={q} n={g === 'MAIN' ? mainNumber(s, q) : null} onChange={onChange} onRemove={remove} draft={draft} />)}
            </ol>
          </section>
        );
      })}
    </>
  );
}

/** Main Story の中での番号（外した Question は数えない） */
const mainNumber = (s: StoryState, q: StorySlide): number | null => {
  const main = s.slides.filter((x) => groupOf(x) === 'MAIN');
  const k = main.findIndex((x) => x.id === q.id);
  return k < 0 ? null : k + 1;
};

const ROLE_KEY: Record<string, MessageKey> = {
  'AIMED.IMPACT': 'story.role.impact', 'AIMED.MISMATCH': 'story.role.mismatch', 'AIMED.EXPLANATION': 'story.role.explanation', 'AIMED.DECISION': 'story.role.decision',
};

function QuestionItem({ story, q, n, onChange, onRemove, draft }: { story: StoryState; q: StorySlide; n: number | null; onChange: (s: StoryState) => void; onRemove: (id: string) => void; draft: boolean }) {
  const t = useT();
  const locale = useLocale();
  const [editing, setEditing] = useState<string | null>(null);
  const g = groupOf(q);
  const out = g === 'OUT';
  const examples = examplesOf(q, locale).map((x) => t(`story.example.${x.mode}`, { name: x.label })).join(locale === 'ja' ? '／' : ' / ');
  return (
    <li className={`${css.item} ${out ? css.itemOut : ''}`}>
      <span className={`${css.num} ${out ? css.numOut : ''}`} aria-hidden="true">{n ?? '–'}</span>
      <div className={css.body}>
        <div className={css.tags}>
          {q.routeRole && ROLE_KEY[q.routeRole] && <span className={css.tag}>{t(ROLE_KEY[q.routeRole]!)}</span>}
          {q.questionPriority === 'CONDITIONAL' && <span className={css.tagMute}>{t('story.priority.CONDITIONAL')}</span>}
        </div>
        {editing != null ? (
          <form className={css.edit} onSubmit={(e) => { e.preventDefault(); if (editing.trim()) onChange(renameQuestion(story, q.id, editing.trim())); setEditing(null); }}>
            <input className={css.input} autoFocus aria-label={t('story.questionLabel')} value={editing} onChange={(e) => setEditing(e.target.value)} />
            <button type="submit" className={css.act} disabled={!editing.trim()}>{t('save.renameConfirm')}</button>
            <button type="button" className={css.act} onClick={() => setEditing(null)}>{t('save.cancel')}</button>
          </form>
        ) : <p className={css.q}>{q.question || '—'}</p>}
        {!out && <p className={css.sub}>{t('story.examples', { list: examples })}</p>}
        {!out && q.routeRole === 'AIMED.DECISION' && <p className={css.sub}>{t('scope.decisionRole')}</p>}
        {!draft && !out && <p className={css.sub}>{q.userAuthoredMessage ? t('story.message', { text: q.userAuthoredMessage }) : t('story.noMessage')}</p>}
        <div className={css.actions}>
          {out ? (
            <button type="button" className={css.act} onClick={() => onChange(setCoachingOnly(story, q.id, false))}>{t('story.restore')}</button>
          ) : (
            <>
              <button type="button" className={css.act} disabled={neighbor(story, q.id, -1) < 0} aria-label={t('story.upLabel')} onClick={() => onChange(moveQuestion(story, q.id, -1))}>{t('story.up')}</button>
              <button type="button" className={css.act} disabled={neighbor(story, q.id, 1) < 0} aria-label={t('story.downLabel')} onClick={() => onChange(moveQuestion(story, q.id, 1))}>{t('story.down')}</button>
              <button type="button" className={css.act} onClick={() => setEditing(q.question)}>{t('story.rename')}</button>
              <button type="button" className={css.act} onClick={() => onChange(setSection(story, q.id, g === 'MAIN' ? 'APPENDIX' : 'MAIN'))}>{g === 'MAIN' ? t('story.toAppendix') : t('story.toMain')}</button>
              {canSplit(q) && <button type="button" className={css.act} onClick={() => onChange(splitQuestion(story, q.id, locale))}>{t('story.split', { n: q.proofNeeds.length })}</button>}
              {canMergeWithNext(story, q.id) && <button type="button" className={css.act} onClick={() => onChange(mergeWithNext(story, q.id, locale))}>{t('story.merge')}</button>}
              <button type="button" className={css.actDanger} onClick={() => onRemove(q.id)}>{t('story.remove')}</button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * 問いを選ぶ：14の問いを役割ごとに並べ、入っているものは選択中。押すと足す・外す（すぐ上の並びが変わる）。
 * suggested＝相談から読み取った問い（「相談から」と出す）。中身が入った Question の問いは外せない
 */
export function NeedPicker({ story, onChange, lead, suggested = [], onReset, resetLabel }: {
  story: StoryState; onChange: (s: StoryState) => void; lead: string; suggested?: readonly ProofNeedId[]; onReset?: () => void; resetLabel?: string;
}) {
  const t = useT();
  const locale = useLocale();
  const order: Role[] = ['AIMED.IMPACT', 'AIMED.MISMATCH', 'AIMED.EXPLANATION'];
  const used = activeNeeds(story);
  const roleOf = (n: ProofNeedId): Role => (story.slides.find((x) => x.proofNeeds.includes(n))?.routeRole as Role | null) ?? ROLE_OF[n];
  const list = (Object.keys(ROLE_OF) as ProofNeedId[]).map((need) => ({ need, role: roleOf(need) }));
  return (
    <div className={css.picker}>
      <p className={css.pickerLead}>{lead}</p>
      {order.map((role) => (
        <div key={role} className={css.addGroup}>
          <p className={css.addHead}>{t(ROLE_KEY[role]!)}</p>
          <div className={css.chips}>
            {list.filter((x) => x.role === role).map((x) => {
              const on = used.has(x.need);
              const locked = on && !canRemoveNeed(story, x.need);
              return (
                <button key={x.need} type="button" className={css.chip} aria-pressed={on} disabled={locked} title={locked ? t('story.pickLocked') : undefined}
                  onClick={() => onChange(toggleNeed(story, x.need, locale))}>
                  <b>{localize(PROOF_NEEDS[x.need].question, locale)}</b>
                  {suggested.includes(x.need) && <small>{t('scope.fromConsult')}</small>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {onReset && <button type="button" className={css.act} onClick={onReset}>{resetLabel}</button>}
    </div>
  );
}
