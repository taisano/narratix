'use client';

import { useState } from 'react';
import { useLocale, useT, type MessageKey } from '@/i18n/ui';
import { EXEC_SUMMARY_ROLE, PROOF_NEEDS, localize, routeDef, routeQuestionRoleIds, routeRoleDef, type ProofNeedId } from '@/registry';
import type { StorySlide, StoryState } from './model';
import {
  activeNeeds, canMergeWithNext, canRemoveNeed, canSplit, groupOf, mergeWithNext, moveQuestion, neighbor, renameQuestion, setCoachingOnly, setSection,
  splitQuestion, toggleNeed, type ViewGroup,
} from './storyOps';
import { examplesOf, questionOf, roleOrdinal, supportLineFor, usesRoleQuestion } from './questionMap';
import css from './story.module.css';

/*
 * 問いの並びと問いの選び直し（② の真ん中と、編集画面の「問いを整える」で共通の部品）。
 * 規則だけで動く（AI は使わない）。中身が入った問いは黙って消さない
 */

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
  // ② の下書きでは Executive Summary は並べ替え・外しの対象にしない（データには残し、編集画面で見せる）
  const shown = (x: StorySlide) => !(draft && x.routeRole === EXEC_SUMMARY_ROLE);
  const hasPersonalization = draft && s.slides.some((x) => groupOf(x) === 'MAIN' && shown(x) && x.personalization);
  const removedQ = removed ? s.slides.find((x) => x.id === removed && x.questionPriority === 'COACHING_ONLY') : null;
  return (
    <>
      {removedQ && (
        <p className={css.toast} role="status">{t('story.removedToast', { q: removedQ.question })} <button type="button" className={css.act} onClick={undo}>{t('story.undo')}</button></p>
      )}
      {groups.map(({ g, label }) => {
        const list = s.slides.filter((x) => groupOf(x) === g && shown(x));
        if (!list.length && g !== 'MAIN') return null;
        const plainHead = draft && g === 'MAIN';
        return (
          <section key={g} className={css.section} aria-label={plainHead ? t('story.flowHead') : t(label, { n: list.length })}>
            {plainHead
              ? hasPersonalization && (
                <div className={`${css.cardGrid} ${css.colHeads}`} aria-hidden="true">
                  <span>{t('story.flowHead')}</span><span>{t('story.confirmHead')}</span>
                </div>
              )
              : <h2 className={css.sectionHead}>{t(label, { n: list.length })}</h2>}
            {g === 'OUT' && <p className={css.note}>{t('story.outLead')}</p>}
            {!list.length && <p className={css.note}>{t('story.noQuestions')}</p>}
            <ol className={css.list}>
              {list.map((q) => <QuestionItem key={q.id} story={s} q={q} n={g === 'MAIN' ? mainNumber(s, q, shown) : null} onChange={onChange} onRemove={remove} draft={draft} />)}
            </ol>
          </section>
        );
      })}
    </>
  );
}

/** ①②③…（20 まで。それ以上は (21) の形） */
const circled = (n: number): string => (n >= 1 && n <= 20 ? String.fromCodePoint(0x2460 + n - 1) : `(${n})`);

/** Main Story の中での番号（外した Question は数えない） */
const mainNumber = (s: StoryState, q: StorySlide, shown: (x: StorySlide) => boolean): number | null => {
  const main = s.slides.filter((x) => groupOf(x) === 'MAIN' && shown(x));
  const k = main.findIndex((x) => x.id === q.id);
  return k < 0 ? null : k + 1;
};

function QuestionItem({ story, q, n, onChange, onRemove, draft }: { story: StoryState; q: StorySlide; n: number | null; onChange: (s: StoryState) => void; onRemove: (id: string) => void; draft: boolean }) {
  const t = useT();
  const locale = useLocale();
  const [editing, setEditing] = useState<string | null>(null);
  const g = groupOf(q);
  const out = g === 'OUT';
  // 問いを書き換えた後は、元の問い向けの具体化を誤って見せない。
  // 従来方式では、問いを書き換えたら元の問い向けの具体化は隠す。専用ロール方式(版2)の具体化は問いの文ではなく proof_needs に付くので、書き換えても残す
  const personalization = q.questionEdited && !usesRoleQuestion(story.questionMapVersion, story.primaryRoute) ? undefined : q.personalization;
  // ② の下書きでは（グラフ）（言葉）などの種類は付けず、見せ方の名前だけを並べる
  const examples = examplesOf(q, locale).map((x) => (draft ? x.label : t(`story.example.${x.mode}`, { name: x.label }))).join(locale === 'ja' ? '／' : ' / ');
  const role = routeRoleDef(story.primaryRoute, q.routeRole);
  const supportLine = supportLineFor(story, q);
  return (
    <li className={`${css.item} ${out ? css.itemOut : ''} ${draft ? css.itemDraft : ''}`}>
      {!draft && <span className={`${css.num} ${out ? css.numOut : ''}`} aria-hidden="true">{n ?? '–'}</span>}
      <div className={css.body}>
        <div className={`${css.cardGrid} ${!personalization || out ? css.cardGridSingle : ''}`}>
          <div className={css.templatePane}>
            {/* ② の下書きでは役割名（全体／差・例外…）は画面に出さない（データには残す） */}
            <div className={css.tags}>
              {!draft && role && <span className={css.tag}>{t(role.labelKey as MessageKey)}</span>}
              {!draft && roleOrdinal(story, q) > 0 && <span className={css.tagMute}>{t('story.roleNth', { n: roleOrdinal(story, q) })}</span>}
              {q.questionPriority === 'CONDITIONAL' && <span className={css.tagMute}>{t('story.priority.CONDITIONAL')}</span>}
            </div>
            {editing != null ? (
              <form className={css.edit} onSubmit={(e) => { e.preventDefault(); if (editing.trim()) onChange(renameQuestion(story, q.id, editing.trim())); setEditing(null); }}>
                <input className={css.input} autoFocus aria-label={t('story.questionLabel')} value={editing} onChange={(e) => setEditing(e.target.value)} />
                <button type="submit" className={css.act} disabled={!editing.trim()}>{t('save.renameConfirm')}</button>
                <button type="button" className={css.act} onClick={() => setEditing(null)}>{t('save.cancel')}</button>
              </form>
            ) : <p className={css.q}>{draft && n != null && !out && <span className={css.qNum} aria-hidden="true">{circled(n)} </span>}{q.question || '—'}</p>}
            {!out && supportLine && !(draft && personalization) && <p className={css.sub}>{t('story.supportLine', { list: supportLine })}</p>}
            {!out && <p className={css.sub}>{t('story.examples', { list: examples })}</p>}
            {!out && role?.userAuthored && <p className={css.sub}>{t(role.id === 'AIMED.DECISION' ? 'scope.decisionRole' : role.noForcedSlide ? 'story.authoredRoleOptional' : 'story.authoredRole')}</p>}
            {!draft && !out && <p className={css.sub}>{q.userAuthoredMessage ? t('story.message', { text: q.userAuthoredMessage }) : t('story.noMessage')}</p>}
            <div className={css.actions}>
              {out ? (
                <button type="button" className={css.act} onClick={() => onChange(setCoachingOnly(story, q.id, false))}>{t('story.restore')}</button>
              ) : (
                draft ? (
                  <>
                    <button type="button" className={css.iconBtn} disabled={neighbor(story, q.id, -1) < 0} aria-label={t('story.upLabel')} title={t('story.upLabel')} onClick={() => onChange(moveQuestion(story, q.id, -1))}>↑</button>
                    <button type="button" className={css.iconBtn} disabled={neighbor(story, q.id, 1) < 0} aria-label={t('story.downLabel')} title={t('story.downLabel')} onClick={() => onChange(moveQuestion(story, q.id, 1))}>↓</button>
                    <button type="button" className={css.iconBtn} aria-label={t('story.editLabel')} title={t('story.editLabel')} onClick={() => setEditing(q.question)}>✎</button>
                    <button type="button" className={css.act} onClick={() => onChange(setSection(story, q.id, g === 'MAIN' ? 'APPENDIX' : 'MAIN'))}>{g === 'MAIN' ? t('story.toAppendix') : t('story.toMain')}</button>
                    {canSplit(q) && <button type="button" className={css.act} onClick={() => onChange(splitQuestion(story, q.id, locale))}>{t('story.split', { n: q.proofNeeds.length })}</button>}
                    {canMergeWithNext(story, q.id) && <button type="button" className={css.act} onClick={() => onChange(mergeWithNext(story, q.id, locale))}>{t('story.merge')}</button>}
                    <button type="button" className={`${css.iconBtn} ${css.iconDanger}`} aria-label={t('story.removeLabel')} title={t('story.removeLabel')} onClick={() => onRemove(q.id)}>×</button>
                  </>
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
                )
              )}
            </div>
          </div>
          {!out && personalization && (
            <aside className={css.personalized} aria-label={draft ? t('story.confirmHead') : t('story.personalization.label')}>
              {/* AI（Coach）が相談文から書いた内容だと分かるように、Coach の印を付ける（② の下書きは列の見出しで示すので繰り返さない） */}
              {!draft && <h3 className={css.personalizedHead}><span className={css.coachDot} aria-label="Coach">C</span>{t('story.personalization.label')}</h3>}
              <p className={css.personalizedText}>{personalization.explanation}</p>
              {draft && personalization.requiredDataHints.length > 0 && (
                <p className={css.dataChips}>
                  <span className={css.dataChipsLabel}>{t('story.requiredData')}</span>
                  {personalization.requiredDataHints.map((hint) => <span key={hint} className={css.dataChip}>{hint}</span>)}
                </p>
              )}
              {!draft && personalization.requiredDataHints.length > 0 && (
                <div>
                  <h4 className={css.personalizedSubhead}>{t('story.personalization.data')}</h4>
                  <ul className={css.dataHints}>{personalization.requiredDataHints.map((hint) => <li key={hint}>{hint}</li>)}</ul>
                </div>
              )}
              {personalization.unresolvedQuestion && (
                <div className={css.coachQuestion}>
                  <h4 className={css.personalizedSubhead}>{t('story.personalization.question')}</h4>
                  <p>{personalization.unresolvedQuestion}</p>
                </div>
              )}
            </aside>
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
export function NeedPicker({ story, onChange, lead, suggested = [], onReset, resetLabel, collapsible = false }: {
  story: StoryState; onChange: (s: StoryState) => void; lead: string; suggested?: readonly ProofNeedId[]; onReset?: () => void; resetLabel?: string;
  /** ② の下書き：「＋ 問いを追加・変更」の開閉にして、初めは閉じておく */
  collapsible?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(!collapsible);
  const locale = useLocale();
  const route = routeDef(story.primaryRoute);
  const order = routeQuestionRoleIds(route.id);
  const used = activeNeeds(story);
  const roleOf = (n: ProofNeedId): string => story.slides.find((x) => x.proofNeeds.includes(n))?.routeRole ?? route.proofNeedRoles[n];
  const list = (Object.keys(route.proofNeedRoles) as ProofNeedId[]).map((need) => ({ need, role: roleOf(need) }));
  return (
    <div className={css.picker}>
      {collapsible ? (
        <button type="button" className={css.pickerToggle} aria-expanded={open} aria-controls="need-picker-body" onClick={() => setOpen(!open)}>
          {open ? '－ ' : '＋ '}{t('story.addTitle')}
        </button>
      ) : (
        <>
          <p className={css.pickerLead}>{lead}</p>
          <p className={css.note}>{t('story.pickNote')}</p>
        </>
      )}
      <div id="need-picker-body" hidden={!open} className={css.pickerBody}>
      {order.map((role) => (
        <div key={role} className={css.addGroup}>
          <p className={css.addHead}>{t(routeRoleDef(route.id, role)!.labelKey as MessageKey)}</p>
          <div className={css.chips}>
            {list.filter((x) => x.role === role).map((x) => {
              const on = used.has(x.need);
              const locked = on && !canRemoveNeed(story, x.need);
              return (
                <button key={x.need} type="button" className={css.chip} aria-pressed={on} disabled={locked} title={locked ? t('story.pickLocked') : undefined}
                  onClick={() => onChange(toggleNeed(story, x.need, locale))}>
                  <b>{questionOf([x.need], locale, { route: story.primaryRoute, outcomeDirection: story.outcomeDirection })}</b>
                  {suggested.includes(x.need) && <small>{t('scope.fromConsult')}</small>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {onReset && <button type="button" className={css.act} onClick={onReset}>{resetLabel}</button>}
      </div>
    </div>
  );
}
