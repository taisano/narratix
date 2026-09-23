import {
  registry, type ChartTypeId, type ControlId, type Dataset, type Panel, type ViewSpec,
} from '@/registry';
import { slideText } from '@/i18n/slide';
import { mekkoModel } from '../model/mekko';
import type { Rect, Scene, SceneItem, SceneWarning } from '../scene';
import { palette as paletteOf } from '../theme';
import { applyTransforms, filter } from '../transform/ops';

import { fromDataset, periodYears, type Matrix } from '../transform/matrix';
import type { PanelAnchors } from './anchors';
import { layoutMekko, MEKKO, type MekkoLabelMode } from './charts/mekko';
import { layoutStacked100 } from './charts/stacked100';
import { computeSlots } from './slots';
import { layoutFrame } from './frame';
import { textWidth } from '../text';
import { GROWTH_TABLE, layoutGrowthTable, type GrowthRow } from './tables/growth-table';

export class ComposeError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

/** 設定値（未指定ならレジストリの既定値） */
function control<T>(panel: Panel, id: ControlId): T | undefined {
  return (panel.controls?.[id] ?? registry.controls[id].defaultValue) as T | undefined;
}

/** 画面で絞り込んだ項目・系列を反映したデータ */
function panelMatrix(panel: Panel, dataset: Dataset, total: string): Matrix {
  let m = fromDataset(dataset);
  const items = panel.controls?.items as string[] | undefined;
  const series = panel.controls?.series as string[] | undefined;
  if (items || series) m = filter(m, { rows: items, cols: series });
  return applyTransforms(m, panel.transform, { total });
}

/** 描画を実装済みのチャート（それ以外は ComposeError） */
export const IMPLEMENTED_CHARTS: readonly ChartTypeId[] = ['mekko', 'stacked_100'];

/**
 * ViewSpec と Dataset からスライド1枚の配置（Scene）を作る。
 * 検証（validateViewSpec）を通った ViewSpec を渡すこと。
 */
export function composeSlide(spec: ViewSpec, dataset: Dataset): Scene {
  const F = registry.slideFrame;
  const locale = spec.slideLocale;
  const pal = paletteOf(spec.palette);
  const warnings: SceneWarning[] = [];
  const frame = layoutFrame(spec.slide);
  const total = slideText(locale, 'total');
  const colsLabel = dataset.dimensions?.cols ?? slideText(locale, 'colsFallback');

  if (dataset.periods.base) {
    const years = periodYears(dataset.periods.base.label, dataset.periods.current.label);
    if (years != null && years <= 0) warnings.push({ code: 'period_order' });
  }

  // 1. パネルごとのデータ
  const data = new Map<string, Matrix>();
  for (const p of spec.panels) data.set(p.id, panelMatrix(p, dataset, total));

  // 2. 揃えでつながったスロットは詰め、表は内容の高さに合わせる
  const slotOf = new Map(spec.panels.map((p) => [p.id, p.slot]));
  const tight = new Set<string>();
  const fit: Record<string, number> = {};
  for (const p of spec.panels) {
    for (const a of p.align ?? []) {
      if (a.axis !== 'columns' && a.axis !== 'rows') continue;
      const other = slotOf.get(a.to);
      if (other) tight.add([p.slot, other].sort().join('|'));
    }
    if (p.kind === 'table' && p.align?.some((a) => a.axis === 'columns')) {
      fit[p.slot] = data.get(p.id)!.rows.length * GROWTH_TABLE.rowH;
    }
  }
  const layout = registry.layouts[spec.layout.id];
  // パネルを置かないスロットは詰める（例：p05 で左の合計棒や下の表をオフにした時）
  const used = new Set(spec.panels.map((p) => p.slot));
  for (const s of layout.slots) if (!used.has(s)) fit[s] = 0;
  const empty = (xs: string[]) => xs.every((x) => !used.has(x));
  const slots = computeSlots(layout, spec.layout.ratios, frame.content, {
    gap: (a, b) =>
      empty(a) || empty(b) ? 0
        : a.some((x) => b.some((y) => tight.has([x, y].sort().join('|')))) ? F.alignedGap
        : F.gutter,
    fit,
  });

  // 3. 揃え先から順に配置する
  const anchors = new Map<string, PanelAnchors>();
  const panelItems = new Map<string, SceneItem[]>();
  const pending = [...spec.panels];
  const hasAlignFrom = (id: string, axis: string) => spec.panels.some((p) => p.align?.some((a) => a.to === id && a.axis === axis));
  let guard = 0;
  while (pending.length && guard++ < 10) {
    for (let i = 0; i < pending.length; i++) {
      const p = pending[i]!;
      if ((p.align ?? []).some((a) => !anchors.has(a.to))) continue;
      const rect = slots[p.slot]!;
      const out = layoutPanel(p, rect);
      panelItems.set(p.id, out.items);
      anchors.set(p.id, out.anchors);
      pending.splice(i--, 1);
    }
  }
  if (pending.length) throw new ComposeError('align_cycle', 'panels align to each other in a cycle');

  /** 成長率表の行ラベル（例：市場全体 CAGR、デュアル CAGR） */
  function growthLabels(m: Matrix): string[] {
    if (!m.growth) return [];
    const suffix = slideText(locale, m.growth.useCagr ? 'cagr' : 'periodGrowth');
    return m.rows.map((key) => (key === 'market' ? slideText(locale, 'market') : key.replace(/^series:/, '')) + ' ' + suffix);
  }

  function alignTarget(p: Panel, axis: string): PanelAnchors | undefined {
    const a = p.align?.find((x) => x.axis === axis);
    return a ? anchors.get(a.to) : undefined;
  }

  function layoutPanel(p: Panel, rect: Rect): { items: SceneItem[]; anchors: PanelAnchors } {
    const m = data.get(p.id)!;
    const segs = m.cols;
    const hl = control<string>(p, 'highlight');
    const highlight = hl ? segs.indexOf(hl) : -1;

    if (p.kind === 'chart') {
      if (p.chart === 'mekko') {
        const model = mekkoModel(m, { sortBySize: control<boolean>(p, 'sort_by_size') ?? true });
        if (!model.columns.length) warnings.push({ code: 'no_data' });
        if (m.base && model.missingBase.length) warnings.push({ code: 'base_missing_rows', params: { rows: model.missingBase.join(', ') } });
        // 左に y_scale で揃える合計棒があるときは、左の余白を「下の表の行ラベル」が入る幅まで詰める
        const leftPartner = hasAlignFrom(p.id, 'y_scale');
        const tableLabels = spec.panels
          .filter((q) => q.align?.some((a) => a.to === p.id && a.axis === 'columns'))
          .flatMap((q) => growthLabels(data.get(q.id)!));
        const gutter = !leftPartner
          ? MEKKO.defaultGutter
          : Math.max(0.6, ...tableLabels.map((l) => textWidth(l, 10) + 0.2));
        return layoutMekko({
          rect, model, locale,
          unit: dataset.unit ?? '',
          colsLabel,
          periodLabel: m.current.label,
          labels: control<MekkoLabelMode>(p, 'mekko_labels') ?? 'pct',
          deltaLabels: !!p.inChartComplements?.some((c) => c.id === 'delta_labels'),
          highlight,
          palette: pal,
          gutter,
          axisTitle: !leftPartner,
        });
      }
      if (p.chart === 'stacked_100') {
        return layoutStacked100({ rect, matrix: m, locale, palette: pal, highlight, yScale: alignTarget(p, 'y_scale')?.yScale });
      }
      throw new ComposeError('not_implemented', `chart "${p.chart}" is not implemented yet`);
    }

    if (p.kind === 'table' && p.table === 'growth_table') {
      if (!m.growth) throw new ComposeError('growth_table_needs_growth', 'growth_table needs a growth transform');
      const target = alignTarget(p, 'columns');
      const keys = target?.columns?.keys ?? m.cols;
      const labels = growthLabels(m);
      const rows: GrowthRow[] = m.rows.map((_, r) => ({
        label: labels[r]!,
        vals: keys.map((k) => { const c = m.cols.indexOf(k); return c < 0 ? null : m.current.values[r]![c] ?? null; }),
      }));
      const gutter = target?.gutter ?? { x: rect.x, w: MEKKO.defaultGutter };
      const colW = target?.columns
        ? [gutter.w, ...target.columns.w]
        : [gutter.w, ...keys.map(() => (rect.w - gutter.w) / Math.max(1, keys.length))];
      return { items: [layoutGrowthTable({ x: gutter.x, y: rect.y, colW, rows })], anchors: {} };
    }

    throw new ComposeError('not_implemented', `${p.kind} panel "${p.table ?? ''}" is not implemented yet`);
  }

  const items: SceneItem[] = [frame.title];
  for (const p of spec.panels) items.push(...panelItems.get(p.id)!);
  items.push(frame.source);
  return { width: F.width, height: F.height, items, warnings };
}
