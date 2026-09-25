'use client';

import { useState } from 'react';
import { useLocale, useT, type MessageKey } from '@/i18n/ui';
import { IMPLEMENTED_COMPLEMENTS } from '@/engine/layout/charts';
import { recipeRenderable } from '@/engine/recipes';
import {
  PURPOSE_IDS, localize, primaryChart, recipeAspects, recipeParts, recipeRemedies, recipesForPurpose, registry,
  type LocalizedText, type RecipeDef, type RecipeId,
} from '@/registry';
import { CLARIFY_QUESTIONS } from '@/lib/advisor/clarify';
import { FEEDBACK_REASONS, sendFeedback, type FeedbackReason } from '@/lib/repo/feedback';
import { useAuth } from '../shell/AppShell';
import type { MissingInfo, PurposeId } from '@/registry';
import {
  addPurposeAngle, answerClarify, chooseAll, chooseRecipe, chosenRecipes, unchoose, otherPurposeSuggestions, pendingRecipeCount,
  purposeHasRecipes, setFocus, toggleAngle, toggleChosen, type Angle, type Plan, type PlanItem,
} from './plan';
import { needsText } from '../shared/needs';
import { RecipeThumb } from './RecipeThumb';
import { shortPurpose } from './StartFlow';
import css from './start.module.css';

type SetPlan = (p: Plan) => void;

/** ② 切り口を選ぶ。相談から入った時は「推薦1＋他のアングル」、目的・チャートからは切り口ごとの一覧 */
export function RecipeScreen({ plan, setPlan, onNext }: { plan: Plan; setPlan: SetPlan; onNext: (p?: Plan) => void }) {
  return plan.entry === 'CONSULTATION'
    ? <ConsultView plan={plan} setPlan={setPlan} onNext={onNext} />
    : <ListView plan={plan} setPlan={setPlan} onNext={onNext} />;
}

function useL() {
  const locale = useLocale();
  return (x: LocalizedText) => localize(x, locale);
}

// ──────────── 相談から ────────────

function ConsultView({ plan, setPlan, onNext }: { plan: Plan; setPlan: SetPlan; onNext: (p?: Plan) => void }) {
  const t = useT();
  const L = useL();
  const c = plan.consultation!;
  const cls = c.classification;
  const need = (v: boolean | 'unknown') => t(v === true ? 'need.true' : v === false ? 'need.false' : 'need.unknown');
  const goalLabel = shortPurpose(L(registry.purposes[{ TREND: 'trend', COMPARISON: 'comparison', COMPOSITION: 'composition', CONTRIBUTION: 'contribution', RELATIONSHIP: 'relationship', EVALUATION: 'evaluate' }[cls.primary_goal] as 'trend'].label));
  const fields: [MessageKey, string | null][] = [
    ['cls.goal', goalLabel], ['cls.dimension', cls.comparison_dimension], ['cls.measure', cls.measure],
    ['cls.time', cls.time_scope?.replace(/^(\d+)y$/, '$1') ?? null], ['cls.audience', cls.audience === 'UNKNOWN' ? null : t(`audience.${cls.audience}` as MessageKey)],
    ['cls.rate', need(cls.needs_rate_context)], ['cls.size', need(cls.needs_size_context)], ['cls.exact', need(cls.needs_exact_values)],
  ];
  const cards = plan.angles.map((a) => ({ angle: a, item: a.items[0]! }));
  const chosen = chosenRecipes(plan);
  const [rechoose, setRechoose] = useState(false);

  return (
    <div className={css.work}>
      <aside className={css.left}>
        <h2 className={css.colHead}>{t('recipes.understanding')}</h2>
        <blockquote className={css.quote}>{c.text}</blockquote>
        <p className={css.summary}>{c.summary}</p>
        <dl className={css.fields}>
          {fields.map(([k, v]) => (
            <div key={k}><dt>{t(k)}</dt><dd className={v == null || v === t('need.unknown') ? css.unknown : undefined}>{v ?? t('need.unknown')}</dd></div>
          ))}
        </dl>
        <p className={css.small}>{t('recipes.unknownNote')}</p>
      </aside>

      <main className={css.center}>
        {cls.expected_action === 'CLARIFY' ? (
          <Clarify plan={plan} setPlan={setPlan} />
        ) : (
        <>
        <div className={css.centerHead}>
          <h2 className={css.colHead}>{t('recipes.aiHeading')}</h2>
          <p>{c.question}</p>
        </div>
        {!cards.length && (cls.expected_action === 'UNSUPPORTED' || ['CONTRIBUTION', 'RELATIONSHIP', 'EVALUATION'].includes(cls.primary_goal)
          ? <div className={css.empty}><b>{t('unsupported.heading')}</b><p>{t('unsupported.body', { goal: goalLabel })}</p><p>{t('rechoose.fromUnsupported')}</p></div>
          : <p className={css.empty}>{t('recipes.none')}</p>)}
        {cards.slice(0, 1).map(({ angle, item }) => (
          <ConsultCard key={angle.id} rank={0} recipe={registry.recipes[item.recipe]} item={item} top onToggle={() => setPlan(toggleChosen(plan, angle.id, item.recipe))} />
        ))}
        {cards.length > 1 && <h3 className={css.subHead}>{t('recipes.otherAngles')}</h3>}
        <div className={css.twoCol}>
          {cards.slice(1).map(({ angle, item }, i) => (
            <ConsultCard key={angle.id} rank={i + 1} recipe={registry.recipes[item.recipe]} item={item} onToggle={() => setPlan(toggleChosen(plan, angle.id, item.recipe))} />
          ))}
        </div>
        <p className={css.small}>{t('recipes.abstractNote')}</p>
        <Feedback plan={plan} onBetter={() => setRechoose(true)} />
        <Rechoose plan={plan} setPlan={setPlan} open={rechoose} setOpen={setRechoose} />
        <Pending />
        </>
        )}
      </main>

      <aside className={css.right}>
        <h2 className={css.colHead}>{t('recipes.chosenList')}</h2>
        {!chosen.length && <p className={css.small}>{t('recipes.noneChosen')}</p>}
        <ul className={css.chosenList}>
          {chosen.map((x) => (
            <li key={x.recipe.id}>
              <span>{L(x.recipe.name)}</span>
              <button type="button" className={css.unchoose} aria-label={t('recipes.unchooseLabel', { name: L(x.recipe.name) })} onClick={() => setPlan(unchoose(plan, x.recipe.id))}>{t('recipes.unchoose')}</button>
            </li>
          ))}
        </ul>
        <div className={css.rightFoot}>
          <button type="button" className={css.primary} disabled={!chosen.length} onClick={() => onNext()}>{t('recipes.goN', { n: chosen.length })}</button>
          {cards.length > 1 && (
            <button type="button" className={css.secondary} onClick={() => { const all = chooseAll(plan); setPlan(all); onNext(all); }}>
              {t('recipes.buildAll', { n: cards.length })}
            </button>
          )}
          <p className={css.small}>{t('recipes.sharedData')}</p>
        </div>
        <ExtraData chosen={chosen.map((c) => c.recipe)} />
      </aside>
    </div>
  );
}

/**
 * 「どれも違う？」：相談をやり直さずに、見せたいこと（目的）から切り口を選び直す。AI は使わない（回数を消費しない）
 */
function Rechoose({ plan, setPlan, open, setOpen }: { plan: Plan; setPlan: SetPlan; open: boolean; setOpen: (v: boolean) => void }) {
  const t = useT();
  const L = useL();
  const [purpose, setPurpose] = useState<PurposeId | null>(null);
  const chosenIds = new Set(chosenRecipes(plan).map((c) => c.recipe.id));
  const list = purpose ? recipesForPurpose(purpose).filter((r) => recipeRenderable(r) && r.goals[0] === purpose) : [];
  return (
    <section className={css.rechoose} aria-labelledby="rechoose-head">
      <button type="button" id="rechoose-head" className={css.rechooseHead} aria-expanded={open} onClick={() => setOpen(!open)}>
        <b>{t('rechoose.title')}</b><span>{t('rechoose.lead')}</span>
      </button>
      {open && (
        <>
          <div className={css.rechooseChips} role="group" aria-label={t('rechoose.title')}>
            {PURPOSE_IDS.filter(purposeHasRecipes).map((p) => (
              <button key={p} type="button" className={css.option} aria-pressed={purpose === p} onClick={() => setPurpose(p)}>
                <b>{shortPurpose(L(registry.purposes[p].label))}</b><small>{L(registry.purposes[p].question)}</small>
              </button>
            ))}
          </div>
          {list.length > 0 && (
            <div className={css.rechooseGrid}>
              {list.map((r) => {
                const on = chosenIds.has(r.id);
                return (
                  <article key={r.id} className={`${css.rechooseCard} ${on ? css.cardOn : ''}`}>
                    <RecipeThumb recipe={r} className={css.rechooseThumb} />
                    <h4 className={css.name}>{L(r.name)}</h4>
                    <p className={css.small}><b>{L(r.question)}</b></p>
                    <p className={css.small}>{L(r.strength)}</p>
                    <p className={css.small}>{recipeParts(r, L)}</p>
                    <button type="button" className={on ? css.chooseOn : css.choose} aria-pressed={on} onClick={() => setPlan(on ? unchoose(plan, r.id) : chooseRecipe(plan, r.id))}>
                      {on ? t('recipes.chosen') : t('recipes.choose')}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** 提案へのフィードバック（👍／👎＋理由＋コメント）。ログインしている時に保存する */
function Feedback({ plan, onBetter }: { plan: Plan; onBetter: () => void }) {
  const t = useT();
  const auth = useAuth();
  const [rating, setRating] = useState<'up' | 'down' | null>(null);
  const [reasons, setReasons] = useState<FeedbackReason[]>([]);
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const c = plan.consultation;
  const send = async (r: 'up' | 'down') => {
    if (!auth.client || !auth.session) return;
    setStatus('sending');
    try {
      await sendFeedback(auth.client, {
        entryMode: plan.entry, consultationText: c?.text, classification: c?.classification,
        recommended: (c?.ranked ?? []).map((x) => x.recipe), chosen: chosenRecipes(plan).map((x) => x.recipe.id),
        rating: r, reasons: r === 'down' ? reasons : [], comment,
      });
      setStatus('sent');
    } catch { setStatus('error'); }
  };
  if (status === 'sent') return <p className={css.feedbackDone}>{t('feedback.thanks')}</p>;
  const loggedIn = !!auth.session;
  return (
    <section className={css.feedback} aria-label={t('feedback.question')}>
      <div className={css.feedbackRow}>
        <span>{t('feedback.question')}</span>
        <button type="button" className={css.fbBtn} aria-pressed={rating === 'up'} disabled={!loggedIn || status === 'sending'} onClick={() => { setRating('up'); void send('up'); }}>👍 {t('feedback.up')}</button>
        <button type="button" className={css.fbBtn} aria-pressed={rating === 'down'} disabled={!loggedIn} onClick={() => setRating('down')}>👎 {t('feedback.down')}</button>
        {!loggedIn && <small>{t('feedback.needLogin')}</small>}
      </div>
      {rating === 'down' && (
        <div className={css.feedbackBody}>
          <div className={css.rechooseChips} role="group" aria-label={t('feedback.reasonsLabel')}>
            {FEEDBACK_REASONS.map((k) => {
              const on = reasons.includes(k);
              return (
                <button key={k} type="button" className={css.chip} aria-pressed={on} onClick={() => {
                  setReasons((x) => (on ? x.filter((y) => y !== k) : [...x, k]));
                  if (!on && k === 'better_chart') onBetter();
                }}>{on ? '✓ ' : ''}{t(`feedback.reason.${k}` as MessageKey)}</button>
              );
            })}
          </div>
          <label className={css.small} htmlFor="fb-comment">{t('feedback.commentLabel')}</label>
          <textarea id="fb-comment" className={css.feedbackText} value={comment} maxLength={2000} placeholder={t('feedback.commentPlaceholder')} onChange={(e) => setComment(e.target.value)} />
          <div className={css.clarifyFoot}>
            <button type="button" className={css.primary} disabled={status === 'sending'} onClick={() => void send('down')}>{t('feedback.send')}</button>
            {status === 'error' && <small role="alert">{t('feedback.error')}</small>}
          </div>
          <p className={css.small}>{t('feedback.privacy')}</p>
        </div>
      )}
    </section>
  );
}

/** 確認：相談文だけでは決められない時、決まった質問と選択肢で聞く（AI は使わない） */
function Clarify({ plan, setPlan }: { plan: Plan; setPlan: SetPlan }) {
  const t = useT();
  const L = useL();
  const missing = plan.consultation!.classification.missing_info;
  const [answers, setAnswers] = useState<Partial<Record<MissingInfo, number>>>({});
  const notes = missing.map((id) => (answers[id] == null ? null : CLARIFY_QUESTIONS[id].options[answers[id]!]?.note)).filter(Boolean);
  return (
    <section className={css.clarify} aria-labelledby="clarify-head">
      <div className={css.centerHead}>
        <h2 id="clarify-head" className={css.colHead}>{t('clarify.heading')}</h2>
        <p>{t('clarify.lead')}</p>
      </div>
      {missing.map((id) => {
        const q = CLARIFY_QUESTIONS[id];
        return (
          <fieldset key={id} className={css.clarifyQ}>
            <legend>{L(q.text)}</legend>
            <div className={css.clarifyOpts}>
              {q.options.map((o, i) => (
                <button key={i} type="button" className={css.option} aria-pressed={answers[id] === i} onClick={() => setAnswers((a) => ({ ...a, [id]: i }))}>
                  <b>{answers[id] === i ? '✓ ' : ''}{L(o.label)}</b>
                </button>
              ))}
            </div>
          </fieldset>
        );
      })}
      {notes.map((n, i) => <p key={i} className={css.small}>{L(n!)}</p>)}
      <div className={css.clarifyFoot}>
        <button type="button" className={css.primary} disabled={!missing.every((id) => answers[id] != null)} onClick={() => setPlan(answerClarify(plan, answers))}>{t('clarify.submit')}</button>
        <button type="button" className={css.secondary} onClick={() => setPlan(answerClarify(plan, answers))}>{t('clarify.skip')}</button>
      </div>
    </section>
  );
}

function ConsultCard({ recipe, item, rank, top, onToggle }: { recipe: RecipeDef; item: PlanItem; rank: number; top?: boolean; onToggle: () => void }) {
  const t = useT();
  const L = useL();
  return (
    <article className={`${css.card} ${top ? css.cardTop1 : ''} ${item.chosen ? css.cardOn : ''}`}>
      <div className={top ? css.cardRow : css.cardCol}>
        <RecipeThumb recipe={recipe} className={top ? css.thumbBig : css.thumb} />
        <div className={css.cardBody}>
          <div className={css.tags}>
            <span className={top ? css.rankTop : css.rank}>{top ? t('recipes.rank1') : t('recipes.angleN', { n: rank + 1 })}</span>
            <span className={css.comp}>{t(`comp.${recipe.composition}` as MessageKey)}</span>
          </div>
          <h3 className={css.name}>{L(recipe.name)}</h3>
          <p className={css.q}><span>{t('recipes.question')}</span>{L(recipe.question)}</p>
          <p className={css.q}><span>{t('recipes.parts')}</span>{recipeParts(recipe, L)}</p>
          <p className={css.reason}>{L(recipe.reason)}</p>
          <div className={css.proscons}>
            <div className={css.pro}><b>{t('recipes.strength')}</b>{L(recipe.strength)}</div>
            <div className={css.con}><b>{t('recipes.limitation')}</b>{L(recipe.limitation)}{remedyLine(recipe, t, L) && <span className={css.remedy}>{t('recipes.remedyHead')}：{remedyLine(recipe, t, L)}</span>}</div>
          </div>
          <Needs recipe={recipe} />
          <button type="button" className={item.chosen ? css.chooseOn : css.choose} aria-pressed={item.chosen} onClick={onToggle}>
            {item.chosen ? t('recipes.chosen') : t('recipes.chooseThis')}
          </button>
        </div>
      </div>
    </article>
  );
}

function Needs({ recipe }: { recipe: RecipeDef }) {
  const t = useT();
  const needs = needsText(t, recipe, recipe.schema);
  const derived = recipe.derived.map((d) => t(`derived.${d}` as MessageKey)).join('・');
  return (
    <p className={css.needs}>
      {t('recipes.needs')}：<b>{needs}</b>
      {derived && <>　／　{t('recipes.derived')}：<b>{derived}</b></>}
    </p>
  );
}

function Pending() {
  const t = useT();
  const n = pendingRecipeCount();
  return n > 0 ? <p className={css.small}>{t('recipes.pending', { n })}</p> : null;
}

// ──────────── 目的・チャートから ────────────

function ListView({ plan, setPlan, onNext }: { plan: Plan; setPlan: SetPlan; onNext: (p?: Plan) => void }) {
  const t = useT();
  const L = useL();
  const [adding, setAdding] = useState(false);
  const chosen = chosenRecipes(plan);
  const suggestions = plan.entry === 'CHART' ? otherPurposeSuggestions(plan) : [];
  const focus = plan.focus ? registry.recipes[plan.focus] : null;

  return (
    <div className={css.work}>
      <aside className={css.left}>
        <h2 className={css.colHead}>{t(plan.entry === 'CHART' ? 'recipes.anglesFromChart' : 'recipes.anglesFromPurpose')}</h2>
        {plan.angles.map((a, i) => (
          <a key={a.id} href={`#angle-${a.id}`} className={`${css.angleCard} ${css.angleOn}`}>
            <span>
              <span className={css.tag} data-purpose={a.purpose}>{num(i)}　{shortPurpose(L(registry.purposes[a.purpose].label))}</span>
              <span className={css.angleTitle}>{angleTitle(a, L)}</span>
              <span className={css.small}>{t('recipes.chosenCount', { n: a.items.filter((x) => x.chosen).length })}</span>
            </span>
          </a>
        ))}
      </aside>

      <main className={css.center}>
        {plan.angles.map((a, i) => a.included && (
          <AngleSection key={a.id} angle={a} index={i} plan={plan} setPlan={setPlan} />
        ))}
        {suggestions.length > 0 && (
          <div className={css.suggest}>
            <span>{t('recipes.otherPurposes')}</span>
            {suggestions.map((r) => (
              <button key={r} type="button" className={css.chip} onClick={() => setPlan(chooseRecipe(plan, r))}>
                ＋ {L(registry.recipes[r].name)}<small>{shortPurpose(L(registry.purposes[registry.recipes[r].goals[0]!].label))}</small>
              </button>
            ))}
          </div>
        )}
        <p className={css.small}>{t('recipes.abstractNote')}</p>
        <Pending />
      </main>

      <aside className={css.right}>
        <h2 className={css.colHead}>{t('recipes.chosenList')}</h2>
        {!chosen.length && <p className={css.small}>{t('recipes.noneChosen')}</p>}
        <ul className={css.chosenList}>
          {chosen.map((x) => (
            <li key={x.recipe.id}>
              <button type="button" className={css.chosenName} onClick={() => setPlan(setFocus(plan, x.recipe.id))}>{L(x.recipe.name)}</button>
              <button type="button" className={css.unchoose} aria-label={t('recipes.unchooseLabel', { name: L(x.recipe.name) })} onClick={() => setPlan(unchoose(plan, x.recipe.id))}>{t('recipes.unchoose')}</button>
            </li>
          ))}
        </ul>
        <div className={css.rightFoot}>
          <button type="button" className={css.primary} disabled={!chosen.length} onClick={() => onNext()}>{t('recipes.goN', { n: chosen.length })}</button>
          <p className={css.small}>{t('recipes.sharedData')}</p>
        </div>
        {!adding ? (
          <>
            <button type="button" className={css.addBtn} onClick={() => setAdding(true)}>{t('recipes.addAngle')}</button>
            <p className={css.small}>{t('recipes.addAngleNote')}</p>
          </>
        ) : (
          <div className={css.addBox}>
            <b className={css.small}>{t('recipes.addWhich')}</b>
            {PURPOSE_IDS.map((p) => (
              <button key={p} type="button" className={css.miniOption} disabled={!purposeHasRecipes(p)}
                onClick={() => { setPlan(addPurposeAngle(plan, p)); setAdding(false); }}>
                {shortPurpose(L(registry.purposes[p].label))}
                <small>{purposeHasRecipes(p) ? L(registry.purposes[p].question) : t('common.soon')}</small>
              </button>
            ))}
            <button type="button" className={css.linkBtn} onClick={() => setAdding(false)}>{t('recipes.close')}</button>
          </div>
        )}
        <ExtraData chosen={chosen.map((c) => c.recipe)} />
        <h2 className={css.colHead}>{t('recipes.detail')}</h2>
        {focus ? <Detail recipe={focus} plan={plan} setPlan={setPlan} /> : <p className={css.small}>{t('recipes.focusHint')}</p>}
      </aside>
    </div>
  );
}

const num = (i: number) => ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'][i] ?? String(i + 1);

/** 切り口の見出し：目的の問い（チャートから入った時は、そのチャートの単品レシピの問い） */
function angleTitle(a: Angle, L: (x: LocalizedText) => string) {
  const lead = a.items.find((i) => i.role === 'lead');
  return lead ? L(registry.recipes[lead.recipe].question) : L(registry.purposes[a.purpose].question);
}

function AngleSection({ angle, index, plan, setPlan }: { angle: Angle; index: number; plan: Plan; setPlan: SetPlan }) {
  const t = useT();
  const L = useL();
  const recs = angle.items.filter((i) => i.role !== 'other');
  const others = angle.items.filter((i) => i.role === 'other');
  const cols = recs.length === 1 ? css.grid1 : recs.length === 2 ? css.grid2 : css.grid3;
  return (
    <section id={`angle-${angle.id}`} className={css.angle}>
      <div className={css.angleHead}>
        <span className={css.tag} data-purpose={angle.purpose}>{num(index)}　{shortPurpose(L(registry.purposes[angle.purpose].label))}</span>
        <h2>{angleTitle(angle, L)}</h2>
      </div>
      <h3 className={css.subHead}>{t('recipes.recommendedHead')}</h3>
      <div className={cols}>
        {recs.map((it) => (
          <ItemCard key={it.recipe} it={it} lead={it.role === 'lead'} entry={plan.entry} focused={plan.focus === it.recipe}
            onFocus={() => setPlan(setFocus(plan, it.recipe))} onToggle={() => setPlan(toggleChosen(plan, angle.id, it.recipe))} />
        ))}
      </div>
      {others.length > 0 && (
        <button type="button" className={css.linkBtn} aria-expanded={angle.showOthers} onClick={() => setPlan(toggleAngle(plan, angle.id, 'showOthers'))}>
          {angle.showOthers ? t('recipes.hideOthers') : t('recipes.showOthers', { n: others.length })}
        </button>
      )}
      {angle.showOthers && (
        <div className={css.others}>
          {others.map((it) => {
            const r = registry.recipes[it.recipe];
            return (
              <div key={it.recipe} className={`${css.mini} ${plan.focus === it.recipe ? css.miniFocus : ''}`}>
                <button type="button" className={css.miniThumb} aria-label={L(r.name)} onClick={() => setPlan(setFocus(plan, it.recipe))}><RecipeThumb recipe={r} extra={it.addComplements} /></button>
                <span className={css.miniText}><b>{L(r.name)}</b><small>{L(r.strength)}</small></span>
                <button type="button" className={it.chosen ? css.chooseOnSm : css.chooseSm} aria-pressed={it.chosen} onClick={() => setPlan(toggleChosen(plan, angle.id, it.recipe))}>
                  {it.chosen ? t('recipes.chosen') : t('recipes.choose')}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ItemCard({ it, lead, entry, focused, onFocus, onToggle }: { it: PlanItem; lead: boolean; entry: Plan['entry']; focused: boolean; onFocus: () => void; onToggle: () => void }) {
  const t = useT();
  const L = useL();
  const r = registry.recipes[it.recipe];
  return (
    <article className={`${css.card} ${focused ? css.cardFocus : ''} ${it.chosen ? css.cardOn : ''}`}>
      <button type="button" className={css.thumbBtn} aria-label={L(r.name)} onClick={onFocus}>
        <RecipeThumb recipe={r} extra={it.addComplements} className={lead ? css.thumbLead : css.thumb} />
      </button>
      <div className={css.cardBody}>
        <div className={css.tags}>
          <span className={lead ? css.rankTop : css.rank}>{lead ? t(entry === 'CHART' ? 'recipes.yourChart' : 'recipes.lead') : t('recipes.sub')}</span>
          <span className={css.comp}>{t(`comp.${r.composition}` as MessageKey)}</span>
        </div>
        <h3 className={css.name}>{L(r.name)}</h3>
        <p className={css.small}>{L(r.strength)}</p>
        <button type="button" className={it.chosen ? css.chooseOn : css.choose} aria-pressed={it.chosen} onClick={onToggle}>
          {it.chosen ? t('recipes.chosen') : t('recipes.choose')}
        </button>
      </div>
    </article>
  );
}

/** 右の欄：見せられること・見えにくいこと。見えにくいことには、補完パーツか別のレシピを案内する */
function Detail({ recipe, plan, setPlan }: { recipe: RecipeDef; plan: Plan; setPlan: SetPlan }) {
  const t = useT();
  const L = useL();
  const { shows } = recipeAspects(recipe);
  const remedies = recipeRemedies(recipe, {
    complement: (id, chart) => (IMPLEMENTED_COMPLEMENTS[chart] ?? []).includes(id),
    recipe: (id) => recipeRenderable(registry.recipes[id]),
  });
  const open = remedies;
  return (
    <div className={css.detail}>
      <h3 className={css.name}>{L(recipe.name)}</h3>
      <p className={css.comp}>{t(`comp.${recipe.composition}` as MessageKey)}・{L(registry.charts[primaryChart(recipe)].label)}</p>
      <p className={css.reason}>{L(recipe.reason)}</p>
      <h4 className={css.okHead}>{t('recipes.shows')}</h4>
      <ul className={css.okList}>
        {shows.map((a) => <li key={a}>{L(registry.aspects[a].label)}</li>)}
      </ul>
      {open.length > 0 && (
        <>
          <h4 className={css.ngHead}>{t('recipes.cannot')}</h4>
          {open.map((r) => (
            <div key={r.aspect} className={css.ngItem}>
              <b>{L(registry.aspects[r.aspect].label)}</b>
              {r.complement ? (
                <small className={css.remedy}>{t('recipes.inEditor', { name: L(registry.complements[r.complement].label) })}</small>
              ) : r.recipe ? (
                <button type="button" className={css.fixBtn} onClick={() => setPlan(chooseRecipe(plan, r.recipe as RecipeId))}>
                  {t('recipes.addRecipe', { name: L(registry.recipes[r.recipe].name) })}
                </button>
              ) : <small>{t('recipes.noRemedy')}</small>}
            </div>
          ))}
        </>
      )}
      {(recipe.optional ?? []).filter((o) => !o.requiresFields?.length).length > 0 && (
        <>
          <h4 className={css.okHead}>{t('recipes.optionalHead')}</h4>
          {(recipe.optional ?? []).filter((o) => !o.requiresFields?.length).map((o) => (
            <p key={o.complement} className={css.small}>{t('recipes.inEditorWhy', { name: L(registry.complements[o.complement].label), reason: L(o.reason) })}</p>
          ))}
        </>
      )}
      <Needs recipe={recipe} />
    </div>
  );
}

/** 注意点の「補い方」（提案画面では選ばせず、エディターでできることを案内するだけ） */
function remedyLine(recipe: RecipeDef, t: ReturnType<typeof useT>, L: (x: LocalizedText) => string): string | null {
  const rem = recipeRemedies(recipe, {
    complement: (id, chart) => (IMPLEMENTED_COMPLEMENTS[chart] ?? []).includes(id),
    recipe: (id) => recipeRenderable(registry.recipes[id]),
  });
  const c = rem.find((r) => r.complement);
  if (c) return t('recipes.inEditor', { name: L(registry.complements[c.complement!].label) });
  const o = recipe.optional?.find((x) => !x.requiresFields?.length);
  if (o) return t('recipes.inEditor', { name: L(registry.complements[o.complement].label) });
  const r = rem.find((x) => x.recipe);
  if (r) return t('recipes.withRecipe', { name: L(registry.recipes[r.recipe!].name) });
  return null;
}

/** 追加データが必要な補完（20.3）：データを入れる前に使うかを確かめる。今のデータで作れる物はここに出さない */
function ExtraData({ chosen }: { chosen: RecipeDef[] }) {
  const t = useT();
  const L = useL();
  const items = chosen.flatMap((r) => (r.optional ?? []).filter((o) => o.requiresFields?.length).map((o) => ({ r, o })));
  if (!items.length) return null;
  return (
    <div className={css.extra}>
      <h3 className={css.subHead}>{t('recipes.extraHead')}</h3>
      {items.map(({ r, o }) => (
        <p key={`${r.id}-${o.complement}`} className={css.small}>
          {t('recipes.extraAsk', { name: L(registry.complements[o.complement].label), fields: o.requiresFields!.map((f) => L(f.label)).join('、') })}
        </p>
      ))}
    </div>
  );
}
