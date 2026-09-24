'use client';

import { useState } from 'react';
import { useLocale, useT, type MessageKey } from '@/i18n/ui';
import { IMPLEMENTED_COMPLEMENTS } from '@/engine/layout/charts';
import { recipeRenderable } from '@/engine/recipes';
import {
  PURPOSE_IDS, localize, primaryChart, recipeAspects, recipeRemedies, registry,
  type LocalizedText, type RecipeDef, type RecipeId,
} from '@/registry';
import {
  addComplement, addPurposeAngle, chooseAll, chooseRecipe, chosenRecipes, otherPurposeSuggestions, pendingRecipeCount,
  purposeHasRecipes, setFocus, toggleAngle, toggleChosen, type Angle, type Plan, type PlanItem,
} from './plan';
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
        <div className={css.centerHead}>
          <h2 className={css.colHead}>{t('recipes.aiHeading')}</h2>
          <p>{c.question}</p>
        </div>
        {!cards.length && <p className={css.empty}>{t('recipes.none')}</p>}
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
        <Pending />
      </main>

      <aside className={css.right}>
        <h2 className={css.colHead}>{t('recipes.chosenList')}</h2>
        {!chosen.length && <p className={css.small}>{t('recipes.noneChosen')}</p>}
        <ul className={css.chosenList}>
          {chosen.map((x) => <li key={x.recipe.id}>{L(x.recipe.name)}</li>)}
        </ul>
        <div className={css.rightFoot}>
          <p className={css.small}>{t('recipes.sharedData')}</p>
          <button type="button" className={css.primary} disabled={!chosen.length} onClick={() => onNext()}>{t('recipes.goN', { n: chosen.length })}</button>
          {cards.length > 1 && (
            <button type="button" className={css.secondary} onClick={() => { const all = chooseAll(plan); setPlan(all); onNext(all); }}>
              {t('recipes.buildAll', { n: cards.length })}
            </button>
          )}
        </div>
      </aside>
    </div>
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
          <p className={css.reason}>{L(recipe.reason)}</p>
          <div className={css.proscons}>
            <div className={css.pro}><b>{t('recipes.strength')}</b>{L(recipe.strength)}</div>
            <div className={css.con}><b>{t('recipes.limitation')}</b>{L(recipe.limitation)}</div>
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
  const needs = [t(`needs.${recipe.schema}` as MessageKey), recipe.requirements.timeAxis && t('needs.years'), recipe.requirements.base && t('needs.base')].filter(Boolean).join('、');
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
  const included = plan.angles.filter((a) => a.included);
  const chosen = chosenRecipes(plan);
  const suggestions = plan.entry === 'CHART' ? otherPurposeSuggestions(plan) : [];
  const focus = plan.focus ? registry.recipes[plan.focus] : null;

  return (
    <div className={css.work}>
      <aside className={css.left}>
        <h2 className={css.colHead}>{t(plan.entry === 'CHART' ? 'recipes.anglesFromChart' : 'recipes.anglesFromPurpose')}</h2>
        <p className={css.small}>{t('recipes.useAngles', { a: included.length, b: plan.angles.length })}</p>
        {plan.angles.map((a, i) => (
          <label key={a.id} className={`${css.angleCard} ${a.included ? css.angleOn : ''}`}>
            <input type="checkbox" checked={a.included} onChange={() => setPlan(toggleAngle(plan, a.id, 'included'))} />
            <span>
              <span className={css.tag} data-purpose={a.purpose}>{num(i)}　{shortPurpose(L(registry.purposes[a.purpose].label))}</span>
              <span className={css.angleTitle}>{angleTitle(a, L)}</span>
              <span className={css.small}>{t('recipes.chosenCount', { n: a.items.filter((x) => x.chosen).length })}</span>
            </span>
          </label>
        ))}
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
        <h2 className={css.colHead}>{t('recipes.detail')}</h2>
        {focus ? <Detail recipe={focus} plan={plan} setPlan={setPlan} /> : <p className={css.small}>{t('recipes.focusHint')}</p>}
        <div className={css.rightFoot}>
          <p className={css.small}>{t('recipes.sharedData')}</p>
          <button type="button" className={css.primary} disabled={!chosen.length} onClick={() => onNext()}>{t('recipes.goN', { n: chosen.length })}</button>
        </div>
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
    <section className={css.angle}>
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
  const added = plan.angles.flatMap((a) => a.items).find((i) => i.recipe === recipe.id)?.addComplements ?? [];
  const { shows } = recipeAspects(recipe);
  const remedies = recipeRemedies(recipe, {
    complement: (id, chart) => (IMPLEMENTED_COMPLEMENTS[chart] ?? []).includes(id),
    recipe: (id) => recipeRenderable(registry.recipes[id]),
  });
  const fixed = remedies.filter((r) => r.complement && added.includes(r.complement));
  const open = remedies.filter((r) => !(r.complement && added.includes(r.complement)));
  return (
    <div className={css.detail}>
      <h3 className={css.name}>{L(recipe.name)}</h3>
      <p className={css.comp}>{t(`comp.${recipe.composition}` as MessageKey)}・{L(registry.charts[primaryChart(recipe)].label)}</p>
      <p className={css.reason}>{L(recipe.reason)}</p>
      <h4 className={css.okHead}>{t('recipes.shows')}</h4>
      <ul className={css.okList}>
        {shows.map((a) => <li key={a}>{L(registry.aspects[a].label)}</li>)}
        {fixed.map((r) => <li key={r.aspect}>{L(registry.aspects[r.aspect].label)}{t('recipes.via', { name: L(registry.complements[r.complement!].label) })}</li>)}
      </ul>
      {open.length > 0 && (
        <>
          <h4 className={css.ngHead}>{t('recipes.cannot')}</h4>
          {open.map((r) => (
            <div key={r.aspect} className={css.ngItem}>
              <b>{L(registry.aspects[r.aspect].label)}</b>
              {r.complement ? (
                <button type="button" className={css.fixBtn} onClick={() => setPlan(addComplement(plan, recipe.id, r.complement!))}>
                  {t('recipes.addComp', { name: L(registry.complements[r.complement].label) })}
                </button>
              ) : r.recipe ? (
                <button type="button" className={css.fixBtn} onClick={() => setPlan(chooseRecipe(plan, r.recipe as RecipeId))}>
                  {t('recipes.addRecipe', { name: L(registry.recipes[r.recipe].name) })}
                </button>
              ) : <small>{t('recipes.noRemedy')}</small>}
            </div>
          ))}
        </>
      )}
      <Needs recipe={recipe} />
    </div>
  );
}
