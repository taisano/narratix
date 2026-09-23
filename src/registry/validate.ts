import { CHART_TYPES } from './charts';
import { chartAcceptsSchema } from './compat';
import { COMPLEMENTS } from './complements';
import { CONTROLS } from './controls';
import type { Dataset } from './dataset';
import { CONTROL_IDS, type ControlId } from './ids';
import { LAYOUTS } from './layouts';
import { TABLES, TRANSFORMS } from './transforms';
import { ViewSpecSchema, type ViewSpec } from './viewspec';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  /** 画面側で翻訳するためのコード */
  code: string;
  path: (string | number)[];
  message: string;
}

export type ValidationResult =
  | { ok: true; spec: ViewSpec; issues: ValidationIssue[] }
  | { ok: false; spec?: undefined; issues: ValidationIssue[] };

const isControlId = (k: string): k is ControlId => (CONTROL_IDS as readonly string[]).includes(k);

/**
 * ViewSpec をレジストリで検証する。AI の出力も保存データもここを通す。
 * error が1つでもあれば ok=false。warning（比較期間がない等）は描画を止めない。
 */
export function validateViewSpec(input: unknown, dataset?: Dataset): ValidationResult {
  const parsed = ViewSpecSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({
        severity: 'error' as const,
        code: 'schema',
        path: i.path.filter((p): p is string | number => typeof p !== 'symbol'),
        message: i.message,
      })),
    };
  }
  const spec = parsed.data;
  const issues: ValidationIssue[] = [];
  const err = (code: string, path: (string | number)[], message: string) => issues.push({ severity: 'error', code, path, message });
  const warn = (code: string, path: (string | number)[], message: string) => issues.push({ severity: 'warning', code, path, message });
  const hasBase = !!dataset?.periods.base;

  // ---- layout ----
  const layout = LAYOUTS[spec.layout.id];
  if (spec.layout.ratios) {
    if (spec.layout.ratios.length !== layout.ratios.length) {
      err('layout_ratio_count', ['layout', 'ratios'], `${layout.id} takes ${layout.ratios.length} ratio(s)`);
    } else {
      spec.layout.ratios.forEach((r, i) => {
        const p = layout.ratios[i]!;
        if (r < p.min - 1e-9 || r > p.max + 1e-9) err('layout_ratio_range', ['layout', 'ratios', i], `ratio ${r} is outside ${p.min}–${p.max}`);
      });
    }
  }
  if (spec.panels.length > layout.slots.length) {
    err('too_many_panels', ['panels'], `${layout.id} has ${layout.slots.length} slot(s), got ${spec.panels.length} panels`);
  }

  // ---- panels ----
  const panelIds = new Set<string>();
  const usedSlots = new Set<string>();
  spec.panels.forEach((panel, pi) => {
    const at = (...rest: (string | number)[]) => ['panels', pi, ...rest];
    if (panelIds.has(panel.id)) err('duplicate_panel_id', at('id'), `duplicate panel id "${panel.id}"`);
    panelIds.add(panel.id);
    if (!layout.slots.includes(panel.slot)) err('unknown_slot', at('slot'), `slot "${panel.slot}" does not exist in ${layout.id}`);
    else if (usedSlots.has(panel.slot)) err('duplicate_slot', at('slot'), `slot "${panel.slot}" is used twice`);
    usedSlots.add(panel.slot);
  });

  spec.panels.forEach((panel, pi) => {
    const at = (...rest: (string | number)[]) => ['panels', pi, ...rest];

    // kind と中身の対応
    if (panel.kind === 'chart' && !panel.chart) err('missing_chart', at('chart'), 'chart panel needs "chart"');
    if (panel.kind === 'table' && !panel.table) err('missing_table', at('table'), 'table panel needs "table"');
    if (panel.kind === 'text' && panel.text === undefined) err('missing_text', at('text'), 'text panel needs "text"');
    if (panel.kind !== 'chart' && (panel.chart || panel.controls || panel.inChartComplements)) {
      err('chart_fields_on_non_chart', at(), 'chart / controls / inChartComplements are only for chart panels');
    }

    const chart = panel.chart ? CHART_TYPES[panel.chart] : undefined;
    if (chart && panel.purpose && panel.purpose !== chart.purpose) {
      err('purpose_mismatch', at('purpose'), `${chart.id} belongs to ${chart.purpose}, not ${panel.purpose}`);
    }
    if (chart && dataset && !panel.transform?.length && !chartAcceptsSchema(chart.id, dataset.schema)) {
      err('schema_mismatch', at('chart'), `${chart.id} cannot draw a ${dataset.schema} dataset`);
    }

    // transform
    panel.transform?.forEach((t, ti) => {
      if (dataset && TRANSFORMS[t.type].requiresBase && !hasBase) {
        warn('requires_base', at('transform', ti), `${t.type} needs comparison-period data`);
      }
    });
    if (panel.table && dataset && TABLES[panel.table].requiresBase && !hasBase) {
      warn('requires_base', at('table'), `${panel.table} needs comparison-period data`);
    }

    // controls
    if (panel.controls) {
      for (const [key, value] of Object.entries(panel.controls)) {
        if (!isControlId(key)) { err('unknown_control', at('controls', key), `unknown control "${key}"`); continue; }
        const def = CONTROLS[key];
        if (chart && !def.appliesTo.includes(chart.id)) { err('control_not_applicable', at('controls', key), `${key} does not apply to ${chart.id}`); continue; }
        const bad = () => err('invalid_control_value', at('controls', key), `invalid value for ${key}`);
        switch (def.type) {
          case 'select':
            if (typeof value !== 'string' || !def.options?.some((o) => o.value === value)) bad();
            break;
          case 'toggle':
            if (typeof value !== 'boolean') bad();
            break;
          case 'text':
            if (typeof value !== 'string') bad();
            break;
          case 'data_select':
          case 'data_multi_select': {
            const vals = def.type === 'data_select' ? [value] : value;
            if (!Array.isArray(vals) || !vals.every((v) => typeof v === 'string')) { bad(); break; }
            if (dataset) {
              const known = new Set([...dataset.rows, ...dataset.cols]);
              const missing = (vals as string[]).filter((v) => !known.has(v));
              if (missing.length) err('unknown_data_item', at('controls', key), `not in dataset: ${missing.join(', ')}`);
            }
            break;
          }
        }
      }
    }

    // チャート内の補完パーツ
    panel.inChartComplements?.forEach((c, ci) => {
      const def = COMPLEMENTS[c.id];
      if (def.placement !== 'in_chart') err('complement_is_panel', at('inChartComplements', ci), `${c.id} is added as its own panel, not inside a chart`);
      if (chart && !def.appliesTo.includes(chart.id)) err('complement_not_applicable', at('inChartComplements', ci), `${c.id} does not apply to ${chart.id}`);
      if (dataset && def.requiresBase === 'always' && !hasBase) warn('requires_base', at('inChartComplements', ci), `${c.id} needs comparison-period data`);
    });

    // 揃え
    panel.align?.forEach((a, ai) => {
      if (a.to === panel.id) err('align_self', at('align', ai), 'a panel cannot align to itself');
      else if (!panelIds.has(a.to)) err('align_unknown_panel', at('align', ai), `no panel with id "${a.to}"`);
    });
  });

  // ---- 出力方式 ----
  if (spec.export) {
    spec.panels.forEach((panel, pi) => {
      if (panel.chart && !CHART_TYPES[panel.chart].exports.includes(spec.export!)) {
        err('export_not_supported', ['panels', pi, 'chart'], `${panel.chart} cannot be exported as ${spec.export}`);
      }
    });
  }

  if (issues.some((i) => i.severity === 'error')) return { ok: false, issues };
  return { ok: true, spec, issues };
}
