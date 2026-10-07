'use client';

import { vwColumns } from '@/engine/layout/charts/vwidth';
import { slopeEnds } from '@/engine/layout/charts/slope';
import { complementNeedsBase, complementsFor, controlsFor, localize, lostWhenRemoved, lostWhenTableRemoved, registry, standardComplements, type ComplementDef, type ControlDef, type ControlId, type RecipeDef } from '@/registry';
import { IMPLEMENTED_COMPLEMENTS } from '@/engine/layout/charts';
import { growthSpan, isTimeAxis, timeRange } from '@/engine/transform/cagr';
import { useLocale, useT, type MessageKey } from '@/i18n/ui';
import { ControlField } from './ControlField';
import { DimensionFields, LocaleField, MetricNames, SourceField, TitleField } from './SlideFields';
import { controlSource, hasBase, isComplementOn, isSwapped, recipeTablePanels, viewAxes, type BuilderState } from './state';
import css from '../ui.module.css';
import { Fold } from './Fold';
import { AccentPicker, ThemePicker } from './ThemePicker';
import { ChartHeaderFields } from './ChartHeaderFields';
import { ComboPanel } from './ComboPanel';
import { SideField } from './SideField';
import { sidesFor, usesTwoMetrics } from './sides';
import { FONT_SCALE_MAX, FONT_SCALE_MIN, fontScaleOf, stepFontScale } from '@/engine/text-style';
import { useTip } from './Tip';

type Props = {
  state: BuilderState; update: (patch: Partial<BuilderState>) => void; recipe?: RecipeDef | null;
  mode?: 'all' | 'content' | 'style';
  /** どれかのスライドが比較期間を使う（使わなければ期間の名前の欄は出さない） */
  showBase?: boolean;
};

/** 設定の欄のうち、専用の場所で扱うもの（ここでは並べない） */
const HANDLED_ELSEWHERE: ControlId[] = ['rank_basis', 'side_ratio', 'side_form', 'side_measure', 'sort_by_size', 'title', 'subtitle', 'source', 'unit', 'palette', 'font_scale', 'highlight_color', 'items', 'series', 'axis_swap', 'cagr_table_cols',
  'combo_series', 'combo_left_title', 'combo_right_title', 'combo_left_min', 'combo_left_max', 'combo_right_min', 'combo_right_max', 'combo_left_zero', 'combo_right_zero'];

/**
 * 「見せ方」内の設定を、実装上の並びではなくユーザーの目的単位でグルーピングする（編集画面UI/UX再設計レビュー §6 に対応。第1段階：並べ替え・見出しのみ、
 * 状態や挙動は変えない）。ここに無いコントロールは、従来どおり見出し無しでグルーピングの後に並べる
 */
type ControlGroup = 'color' | 'labels' | 'display';
const CONTROL_GROUPS: Partial<Record<ControlId, ControlGroup>> = {
  highlight: 'color', highlight_color: 'color', highlights: 'color', posneg_color: 'color',
  number_format: 'labels', mekko_labels: 'labels', data_labels: 'labels', x_labels: 'labels', pair_labels: 'labels',
  top_n: 'display', category_order: 'display', segment_order: 'display', rank_sort: 'display', variance_sort: 'display',
  driver_sort: 'display', vw_sort: 'display', show_zero: 'display',
};
const GROUP_ORDER: ControlGroup[] = ['color', 'labels', 'display'];
const GROUP_LABEL_KEY: Record<ControlGroup, MessageKey> = {
  color: 'settings.group.color', labels: 'settings.group.labels', display: 'settings.group.display',
};

export function Settings({ state: s, update, recipe = null, showBase = true, mode = 'all' }: Props) {
  const t = useT();
  const locale = useLocale();
  const textSizeTip = useTip('info', t('field.chartTextSizeNote'));
  const L = (x: { en: string; ja?: string }) => localize(x, locale);
  const C = registry.controls;
  const d = s.dataset;
  const axes = viewAxes(s);
  const swapped = isSwapped(s);
  const rowsName = d.dimensions?.rows || t('field.rowsLabel');
  const colsName = d.dimensions?.cols || t('field.colsLabel');

  const setData = (patch: Partial<BuilderState['dataset']>) => update({ dataset: { ...d, ...patch } });
  const setPeriodLabel = (k: 'current' | 'base', label: string) => {
    const periods = { ...d.periods, [k]: { ...d.periods[k], label } };
    // 縦長の表から左右（2時点）を切り出している時は、名前を切り出し方に持たせる（切り出し直すたびに元の名前に戻らないように）
    const cmp = d.long?.pivot.compare;
    if (d.long && cmp) {
      const compare = { ...cmp, [k === 'current' ? 'currentLabel' : 'baseLabel']: label };
      setData({ periods, long: { ...d.long, pivot: { ...d.long.pivot, compare } } });
    } else setData({ periods });
  };
  const setControl = (id: ControlId, v: unknown) => {
    const next = { ...s.controls };
    if (v === undefined) delete next[id]; else next[id] = v;
    update({ controls: next });
  };

  /** 行・列の表示の切り替え（全部選ばれたら絞り込みを外す） */
  const toggleShown = (id: 'items' | 'series', all: string[], name: string, on: boolean) => {
    const cur = Array.isArray(s.controls[id]) ? (s.controls[id] as string[]) : all;
    const next = all.filter((n) => (n === name ? on : cur.includes(n)));
    setControl(id, next.length === all.length ? undefined : next);
  };
  const shown = (id: 'items' | 'series', name: string) => !Array.isArray(s.controls[id]) || (s.controls[id] as string[]).includes(name);

  /**
   * 画面に出す設定値。並べ方は未設定なら「表の順」。ただし古い「規模の大きい順に並べる」（既定オン）を持つチャートは、それを読み替えて出す
   * （Mekko は項目の順、100%横棒は系列の順）
   */
  const shownValue = (id: ControlId) => {
    const v = s.controls[id];
    if (v !== undefined || (id !== 'category_order' && id !== 'segment_order')) return v;
    const legacy = (id === 'category_order' && s.chart === 'mekko') || (id === 'segment_order' && s.chart === 'bar_100');
    return legacy && s.controls.sort_by_size !== false ? 'desc' : 'sheet';
  };
  /**
   * 並べ方の i：何を、何で比べて並べるか。大きい順・小さい順は全体の合計で比べ、棒ごと・系列ごとに並べ替えるのではないことを書く
   */
  const orderInfo = (id: ControlId) => {
    const catName = swapped ? colsName : rowsName;
    const segName = swapped ? rowsName : colsName;
    if (id === 'segment_order') {
      const legacy = s.chart === 'bar_100' && s.controls.segment_order === undefined ? ' ' + t('order.segmentLegacy') : '';
      return { label: t('order.segmentInfo'), text: t('order.segmentText', { seg: segName, cat: catName }) + legacy };
    }
    if (id === 'category_order') {
      return { label: t('order.categoryInfo'), text: t(s.chart === 'mekko' ? 'order.categoryTextMekko' : 'order.categoryText', { seg: segName, cat: catName }) };
    }
    return undefined;
  };
  // 横軸が年・期間なら「項目の順」は出さない（時間の順は変えない。Mekko の列は規模なので出す）
  const timeRows = isTimeAxis(axes.rows);
  const controls = controlsFor(s.chart).filter((c) => !HANDLED_ELSEWHERE.includes(c.id) && !(c.id === 'category_order' && timeRows && s.chart !== 'mekko'));
  const canSwap = C.axis_swap.appliesTo.includes(s.chart);
  // 「スライド」欄で単位を入れられる時（チャートタイトルの単位を出す・縦棒＋折れ線の左軸）
  const unitInHeader = s.chart === 'combo' || (!!s.chartHeader && s.chartHeader.showUnit !== false);
  const emptyLabel = (id: ControlId) => {
    if (id === 'compare_target' || id === 'compare_target2') return t('field.defaultLast', { value: axes.rows[axes.rows.length - 1] ?? '' });
    if (id === 'base_target') return t('field.defaultFirst', { value: axes.rows[0] ?? '' });
    if (id === 'slope_from' || id === 'slope_to') {
      const e = slopeEnds(axes.rows);
      const v = e ? axes.rows[id === 'slope_from' ? e.a : e.b] : undefined;
      return t(id === 'slope_from' ? 'field.defaultFirst' : 'field.defaultLast', { value: v ?? '' });
    }
    if (id === 'total_label') return t('field.totalLabelHint');
    if (id === 'highlights') return t('field.highlightsHint');
    if (id === 'source_left' || id === 'source_right') return t('field.panelSourceHint');
    const sw = s.controls.xy_swap === 'swapped';
    if (id === 'x_title') return axes.cols[sw ? 1 : 0] ?? '';
    if (id === 'y_title') return axes.cols[sw ? 0 : 1] ?? '';
    // 幅が変わる縦棒：未指定の時に使う列と、基準線の既定
    const vw = s.chart === 'variable_width' ? vwColumns(axes.cols, s.controls.vw_width as string | undefined, s.controls.vw_height as string | undefined) : null;
    if (id === 'vw_width') return t('field.defaultCol', { value: vw ? axes.cols[vw.w] ?? '' : '' });
    if (id === 'vw_height') return t('field.defaultCol', { value: vw ? axes.cols[vw.h] ?? '' : '' });
    if (id === 'ref_value') return t('field.refAuto');
    if (id === 'ref_label') return t('field.refLabelHint');
    return t('field.highlightNone');
  };

  const implemented = IMPLEMENTED_COMPLEMENTS[s.chart] ?? [];
  const complements = complementsFor(s.chart).filter((c) => implemented.includes(c.def.id));
  const years = timeRange(axes.rows);
  const growthKeys = ['market', ...axes.cols.map((c) => `series:${c}`)];
  const toggleGrowthRow = (key: string, on: boolean) =>
    update({ mekko: { ...s.mekko, growthRows: growthKeys.filter((k) => (k === key ? on : s.mekko.growthRows.includes(k))) } });

  const renderComplement = ({ def, recommended }: { def: ComplementDef; recommended: boolean }, kind: 'std' | 'opt' | 'other' | 'all') => {
      const needsBase = complementNeedsBase(def.id, s.chart) && !hasBase(s);
      // 伸び率注記：年なら CAGR、四半期・月なら期間の伸び率（Mekko は期間の名前の年で計算するので今まで通り）
      const span = def.id === 'cagr_note' && s.chart !== 'mekko' ? growthSpan(axes.rows) : null;
      const needsYears = def.id === 'cagr_note' && (s.chart === 'mekko' ? !years : !span);
      return (
        <div key={def.id}>
          <label className={css.check}>
            <input type="checkbox" disabled={needsBase} checked={isComplementOn(s, def.id) && !needsBase}
              onChange={(e) => update({ complements: { ...s.complements, [def.id]: e.target.checked } })} />
            <span>{L(def.label)}{' '}{kind === 'std' ? <span className={css.badge}>{t('complement.standardBadge')}</span> : (kind === 'all' || kind === 'other') && recommended && <span className={css.badge}>{t('complement.recommended')}</span>}</span>
          </label>
          {kind === 'opt' && optReason(def.id) && <p className={css.hint}>{optReason(def.id)}</p>}
          {kind === 'std' && !isComplementOn(s, def.id) && <p className={css.hintWarn}>{stdOffText(def)}</p>}
          {needsBase && <p className={css.hint}>{t('complement.needsBase')}</p>}
          {!needsBase && needsYears && isComplementOn(s, def.id) && <p className={css.hint}>{t(s.chart === 'mekko' ? 'complement.needsYears' : 'complement.needsPeriods')}</p>}
          {span && isComplementOn(s, def.id) && <p className={css.hint}>{t(span.years != null ? 'complement.growthYears' : 'complement.growthPeriod', { from: span.fromLabel, to: span.toLabel })}</p>}
          {def.id === 'aligned_table' && s.complements.aligned_table && s.chart === 'mekko' && (
            <div className={css.sub}>
              <div className={css.field}>
                <span>{t('field.growthMode')}</span>
                <div className={css.seg} role="group" aria-label={t('field.growthMode')}>
                  {(['cagr', 'period'] as const).map((m) => (
                    <button key={m} type="button" aria-pressed={s.mekko.growthMode === m} onClick={() => update({ mekko: { ...s.mekko, growthMode: m } })}>{t(`field.growthMode.${m}`)}</button>
                  ))}
                </div>
              </div>
              <div className={css.field}>
                <span>{t('field.growthRows')}</span>
                <div className={css.chips}>
                  {growthKeys.map((k) => (
                    <label key={k} className={css.check}>
                      <input type="checkbox" checked={s.mekko.growthRows.includes(k)} onChange={(e) => toggleGrowthRow(k, e.target.checked)} />
                      {k === 'market' ? t('field.market') : k.slice(7)}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      );
  };

  // 補完：レシピから作ったスライドは「標準構成」「おすすめの補完」「ほかにも付けられる」に分ける（レシピの定義から。AI は使わない）
  const std = recipe ? standardComplements(recipe) : [];
  const optIds = (recipe?.optional ?? []).map((o) => o.complement);
  const optReason = (id: string) => { const o = recipe?.optional?.find((x) => x.complement === id); return o ? L(o.reason) : ''; };
  const stdOffText = (def: ComplementDef) => {
    const lost = recipe ? lostWhenRemoved(recipe, def.id) : [];
    return lost.length
      ? t('complement.stdOff', { name: L(def.label), lost: lost.map((x) => L(registry.aspects[x].label)).join('・') })
      : t('complement.stdOffGeneric', { name: L(def.label) });
  };
  // レシピの標準構成の表（CAGR 表など）。チャートの補完パーツと同じ「標準構成」の中でオン・オフする
  const tablePanels = recipeTablePanels(s);
  const hidden = s.hiddenParts ?? [];
  const toggleTable = (id: string, on: boolean) => update({ hiddenParts: on ? hidden.filter((x) => x !== id) : [...hidden, id] });
  const tableOffText = (id: string, name: string) => {
    const lost = recipe ? lostWhenTableRemoved(recipe, id) : [];
    return lost.length
      ? t('complement.stdOff', { name, lost: lost.map((x) => L(registry.aspects[x].label)).join('・') })
      : t('complement.stdOffGeneric', { name });
  };
  type Group = { key: 'std' | 'opt' | 'other' | 'all'; title: string | null; note?: string; items: typeof complements };
  const groups: Group[] = recipe
    ? [
        { key: 'std', title: t('complement.standard'), note: t('complement.standardNote'), items: complements.filter((c) => std.includes(c.def.id)) },
        { key: 'opt', title: t('complement.optional'), items: complements.filter((c) => optIds.includes(c.def.id) && !std.includes(c.def.id)) },
        { key: 'other', title: t('complement.others'), items: complements.filter((c) => !std.includes(c.def.id) && !optIds.includes(c.def.id)) },
      ]
    : [{ key: 'all', title: null, items: complements }];

  return (
    <>
      {(mode === 'all' || mode === 'content') && <Fold id="slide" title={t('section.slide')}>
        <TitleField state={s} update={update} />
        <ChartHeaderFields state={s} update={update} />
        <SourceField state={s} update={update} />
        <LocaleField state={s} update={update} />
      </Fold>}

      {(mode === 'all' || mode === 'style') && <>
      <Fold id="textStyle" title={t('section.chartText')}>
        <div className={css.field}>
          <span className={css.labelRow}>{t('field.chartTextSize')}{textSizeTip.button}</span>
          <div className={css.fontStep} role="group" aria-label={t('field.chartTextSize')}>
            <button type="button" disabled={fontScaleOf(s.controls.font_scale) <= FONT_SCALE_MIN} onClick={() => {
              const next = stepFontScale(s.controls.font_scale, -1);
              setControl('font_scale', next === 1 ? undefined : next);
            }} title={t('field.chartTextSmaller')}>A−</button>
            <output aria-live="polite">{fontScaleOf(s.controls.font_scale) === 1 ? t('field.chartTextDefault') : `${Math.round(fontScaleOf(s.controls.font_scale) * 100)}%`}</output>
            <button type="button" disabled={fontScaleOf(s.controls.font_scale) >= FONT_SCALE_MAX} onClick={() => {
              const next = stepFontScale(s.controls.font_scale, 1);
              setControl('font_scale', next === 1 ? undefined : next);
            }} title={t('field.chartTextLarger')}>A＋</button>
          </div>
          {textSizeTip.panel(t('field.chartTextSizeNote'))}
        </div>
      </Fold>

      <Fold id="view" title={t('section.view')}>
        {s.chart === 'combo' && <ComboPanel state={s} update={update} />}
        <ThemePicker value={s.controls.palette} inherited={s.deckStyle?.palette} onChange={(v) => setControl('palette', v)} chart={s.chart} items={axes.cols.length} />
        {canSwap && (
          <div className={css.fieldStack}>
            <ControlField def={C.axis_swap} value={s.controls.axis_swap} onChange={(v) => setControl('axis_swap', v)} />
            <p className={css.axisNow}>{t('field.axisNow', { axis: swapped ? colsName : rowsName, series: swapped ? rowsName : colsName })}</p>
          </div>
        )}
        {(() => {
          const renderControl = (def: ControlDef) => (
            <div key={def.id}>
              <ControlField
                def={def} value={shownValue(def.id)} onChange={(v) => setControl(def.id, v)}
                candidates={controlSource(def.id, def.dataSource, s.chart) === 'rows' ? axes.rows : axes.cols} emptyLabel={emptyLabel(def.id)}
                info={orderInfo(def.id)}
              />
              {def.id === 'data_labels' && s.controls.data_labels === 'highlight' && !s.controls.highlight && <p className={css.hint}>{t('field.labelsNeedHighlight')}</p>}
              {/* 1つだけ強調した時だけ、その色を選べる（ほかは薄いグレー）。いくつでも強調できるチャートは色を選ばない */}
              {def.id === 'highlight' && !!s.controls.highlight && C.highlight_color.appliesTo.includes(s.chart) && (
                <AccentPicker value={s.controls.highlight_color} onChange={(v) => setControl('highlight_color', v)} />
              )}
            </div>
          );
          const byGroup = new Map<ControlGroup, ControlDef[]>();
          const ungrouped: ControlDef[] = [];
          for (const def of controls) {
            const g = CONTROL_GROUPS[def.id];
            if (!g) { ungrouped.push(def); continue; }
            (byGroup.get(g) ?? byGroup.set(g, []).get(g)!).push(def);
          }
          return (
            <>
              {GROUP_ORDER.filter((g) => byGroup.has(g)).map((g) => (
                <div key={g} className={css.compGroup}>
                  <h3 className={css.compHead}>{t(GROUP_LABEL_KEY[g])}</h3>
                  {byGroup.get(g)!.map(renderControl)}
                </div>
              ))}
              {ungrouped.map(renderControl)}
            </>
          );
        })()}
      </Fold>

      {/* 補完パーツが1つもないチャートでは、見出しごと出さない */}
      {(s.chart === 'mekko' || complements.length > 0 || tablePanels.length > 0 || sidesFor(s.chart).length > 0) && (
      <Fold id="complements" title={t('section.complements')}>
        {/* 右側に並べる（付け合わせ）：付ける・外す・替える。チャートを替えても引き継ぐ */}
        <SideField state={s} update={update} />
        {s.chart === 'mekko' && (
          <label className={css.check}>
            <input type="checkbox" checked={s.mekko.showTotal} onChange={(e) => update({ mekko: { ...s.mekko, showTotal: e.target.checked } })} />
            {t('field.showTotal')}
          </label>
        )}
        {groups.map((g) => (g.items.length > 0 || (g.key === 'std' && tablePanels.length > 0)) && (
          <div key={g.key} className={css.compGroup}>
            {g.title && <h3 className={css.compHead}>{g.title}</h3>}
            {g.note && <p className={css.hint}>{g.note}</p>}
            {g.key === 'std' && tablePanels.map((p) => {
              const name = L(registry.tables[p.table!].label);
              const on = !hidden.includes(p.id);
              return (
                <div key={`table-${p.id}`}>
                  <label className={css.check}>
                    <input type="checkbox" checked={on} onChange={(e) => toggleTable(p.id, e.target.checked)} />
                    <span>{name}{' '}<span className={css.badge}>{t('complement.standardBadge')}</span></span>
                  </label>
                  {!on && <p className={css.hintWarn}>{tableOffText(p.id, name)}</p>}
                  {on && p.table === 'cagr_table' && !years && <p className={css.hint}>{t('complement.needsYears')}</p>}
                  {on && p.table === 'cagr_table' && s.controls.side_form !== 'bars' && (
                    <label className={css.field}>
                      <span>{L(registry.controls.cagr_table_cols.label)}</span>
                      <select className={css.select} value={String(s.controls.cagr_table_cols ?? registry.controls.cagr_table_cols.defaultValue)}
                        onChange={(e) => update({ controls: { ...s.controls, cagr_table_cols: e.target.value } })}>
                        {registry.controls.cagr_table_cols.options!.map((o) => <option key={o.value} value={o.value}>{L(o.label)}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              );
            })}
            {g.items.map((c) => renderComplement(c, g.key))}
          </div>
        ))}
      </Fold>
      )}

      <Fold id="rowsCols" title={t('section.rowsCols')}>
        <div className={css.field}>
          <span>{t('field.rowsToShow', { name: rowsName })}</span>
          <div className={css.chipList}>
            {d.rows.map((r) => (
              <label key={r} className={css.check}>
                <input type="checkbox" checked={shown('items', r)} onChange={(e) => toggleShown('items', d.rows, r, e.target.checked)} />{r}
              </label>
            ))}
          </div>
        </div>
        <div className={css.field}>
          <span>{t('field.colsToShow', { name: colsName })}</span>
          <div className={css.chipList}>
            {d.cols.map((c) => (
              <label key={c} className={css.check}>
                <input type="checkbox" checked={shown('series', c)} onChange={(e) => toggleShown('series', d.cols, c, e.target.checked)} />{c}
              </label>
            ))}
          </div>
        </div>
      </Fold>

      {registry.charts[s.chart].purpose !== 'relationship' && <Fold id="dataOpts" title={t('section.data')}>
        {showBase && (usesTwoMetrics(s) ? (
          // 2指標スロープ：2つの表の名前が、左右の指標の名前（括弧の中が単位）
          <MetricNames left={d.periods.current.label} right={d.periods.base.label} onChange={setPeriodLabel} />
        ) : <div className={css.row2}>
          <label className={css.field}>
            <span>{t('field.baseLabel')}</span>
            <input className={css.input} value={d.periods.base.label} onChange={(e) => setPeriodLabel('base', e.target.value)} />
          </label>
          <label className={css.field}>
            <span>{t('field.currentLabel')}</span>
            <input className={css.input} value={d.periods.current.label} onChange={(e) => setPeriodLabel('current', e.target.value)} />
          </label>
        </div>)}
        {/* 単位は「スライド」欄（チャートタイトルの単位）で入れている時は、ここには出さない（同じ値を2か所で直さない） */}
        {!unitInHeader && (
          <label className={css.field}>
            <span>{L(C.unit.label)}</span>
            <input className={css.input} value={d.unit ?? ''} onChange={(e) => setData({ unit: e.target.value })} />
          </label>
        )}
        <DimensionFields rows={d.dimensions?.rows ?? ''} cols={d.dimensions?.cols ?? ''} onChange={(k, v) => setData({ dimensions: { ...d.dimensions, [k]: v } })} />
      </Fold>}
      </>}
    </>
  );
}
