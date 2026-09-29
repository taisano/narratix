import {
  registry, type ChartTypeId, type ControlId, type Dataset, type Panel, type ViewSpec,
} from '@/registry';
import { slideText } from '@/i18n/slide';
import type { Rect, Scene, SceneItem, SceneWarning } from '../scene';
import { SEC, chartPalette, themeIdOf } from '../theme';
import { applyTransforms, filter, reorder, transpose, type OrderMode } from '../transform/ops';
import { isTimeAxis } from '../transform/cagr';

import { fromDataset, periodYears, type Matrix } from '../transform/matrix';
import type { PanelAnchors } from './anchors';
import { CHART_LAYOUTS } from './charts';
import type { ChartCtx } from './charts/context';
import { MEKKO } from './charts/mekko';
import { computeSlots } from './slots';
import { layoutChartHeader, layoutFrame } from './frame';
import { GROWTH_TABLE, layoutGrowthTable, type GrowthRow } from './tables/growth-table';
import { layoutCagrTable, type CagrTableCols } from './tables/cagr-table';

export class ComposeError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

/** 設定値（未指定ならレジストリの既定値） */
function control<T>(panel: Panel, id: ControlId): T | undefined {
  return (panel.controls?.[id] ?? registry.controls[id].defaultValue) as T | undefined;
}

/**
 * パネルのデータ：入力した表を、画面で絞り込んだ行・列に絞り、必要なら行と列を入れ替えてから transform を掛ける。
 * 入れ替えは見え方だけの変更で、入力したデータは変えない。
 */
/** 並べ方の設定（1枚の中の表も同じ順にするため、スライドのチャートの設定を使う） */
type Order = { segments: OrderMode; categories: OrderMode; timeOk?: boolean };
/** Mekko の古い設定「規模の大きい順に並べる」（既定オン）を項目の順に読み替える */
const legacyMekkoOrder = (p: Panel): OrderMode => (p.controls?.sort_by_size === false ? 'sheet' : 'desc');
const ORDER_MODES: OrderMode[] = ['sheet', 'reverse', 'desc', 'asc'];
const orderMode = (v: unknown): OrderMode => (ORDER_MODES.includes(v as OrderMode) ? (v as OrderMode) : 'sheet');

function panelMatrix(panel: Panel, dataset: Dataset, total: string, swapped: boolean, order: Order, others: string): Matrix {
  let m = fromDataset(dataset);
  const items = panel.controls?.items as string[] | undefined;
  const series = panel.controls?.series as string[] | undefined;
  if (items || series) m = filter(m, { rows: items, cols: series });
  if (swapped) m = transpose(m);
  m = reorder(m, 'cols', order.segments, others);
  // 横軸が年・期間なら項目の順は変えない（時間の流れを崩さない）
  if (order.timeOk || !isTimeAxis(m.rows)) m = reorder(m, 'rows', order.categories, others);
  return applyTransforms(m, panel.transform, { total });
}

const SCOPE_H = 0.3;

/** 縦長の表の絞り込み（1つの値を選んだもの）と割合を、1行の注記にする。無ければ null */
export function scopeNote(d: Dataset, locale: ViewSpec['slideLocale']): string | null {
  const L = d.long;
  if (!L) return null;
  const parts = L.pivot.filters.filter((f) => f.value != null).map((f) => {
    const name = L.headers[f.col] ?? '';
    return f.col === L.pivot.share ? slideText(locale, 'scopeShare', { name, value: f.value! }) : slideText(locale, 'scopeFilter', { name, value: f.value! });
  });
  return parts.length ? parts.join(locale === 'ja' ? '　' : ' · ') : null;
}

/** 描画を実装済みのチャート（それ以外は ComposeError） */
export const IMPLEMENTED_CHARTS = Object.keys(CHART_LAYOUTS) as ChartTypeId[];

/**
 * ViewSpec と Dataset からスライド1枚の配置（Scene）を作る。
 * 検証（validateViewSpec）を通った ViewSpec を渡すこと。
 */
export function composeSlide(spec: ViewSpec, dataset: Dataset): Scene {
  const F = registry.slideFrame;
  const locale = spec.slideLocale;
  const theme = themeIdOf(spec.palette);
  const warnings: SceneWarning[] = [];
  const frame = layoutFrame(spec.slide);
  const total = slideText(locale, 'total');
  // チャートタイトル（左）と期間・単位（右）。内容の上端に置き、パネルはその下から
  const head = layoutChartHeader(spec.slide, frame.content, locale);
  if (head.height) frame.content = { ...frame.content, y: frame.content.y + head.height, h: frame.content.h - head.height };
  const unitInHeader = !!spec.slide.chartUnit?.trim();
  const periodInHeader = !!spec.slide.chartPeriod?.trim();
  // 読み方の注記を出典の下に出す時は、ここに集める（同じ文は1回）
  const footerNotes: string[] = [];
  const footer = (t: string) => { if (!footerNotes.includes(t)) footerNotes.push(t); };
  // 縦長の表から絞り込んで切り出した時は、何で絞ったか（例：指標：販売数量（千台））をチャートの上に1行で書く
  const scope = scopeNote(dataset, locale);
  const scopeItem: SceneItem | null = scope
    ? { kind: 'text', x: frame.content.x, y: frame.content.y, w: frame.content.w, h: SCOPE_H - 0.04, lines: [{ t: scope, size: 10, color: SEC }], align: 'left', valign: 'middle' }
    : null;
  if (scope) frame.content = { ...frame.content, y: frame.content.y + SCOPE_H, h: frame.content.h - SCOPE_H };

  // 行と列の入れ替え：自分の設定か、揃え先のパネルが入れ替えていれば入れ替える（1枚の中で見え方を揃える）
  const byId = new Map(spec.panels.map((p) => [p.id, p]));
  const swapped = (p: Panel, seen = new Set<string>()): boolean => {
    if (control<string>(p, 'axis_swap') === 'swapped' && p.kind === 'chart') return true;
    seen.add(p.id);
    return (p.align ?? []).some((a) => !seen.has(a.to) && byId.has(a.to) && swapped(byId.get(a.to)!, seen));
  };
  const colsLabelOf = (p: Panel) =>
    (swapped(p) ? dataset.dimensions?.rows : dataset.dimensions?.cols) || slideText(locale, 'colsFallback');

  if (dataset.periods.base) {
    const years = periodYears(dataset.periods.base.label, dataset.periods.current.label);
    if (years != null && years <= 0) warnings.push({ code: 'period_order' });
  }

  // 1. パネルごとのデータ
  const data = new Map<string, Matrix>();
  // スライドの主なチャート（Mekko の左の合計棒などではなく）の設定で並べる
  const main = spec.panels.find((p) => p.kind === 'chart' && p.id === 'main') ?? spec.panels.find((p) => p.kind === 'chart');
  const order: Order = {
    segments: orderMode(main?.controls?.segment_order),
    categories: orderMode(main?.controls?.category_order ?? (main && 'chart' in main && main.chart === 'mekko' ? legacyMekkoOrder(main) : undefined)),
    timeOk: main && 'chart' in main && main.chart === 'mekko',
  };
  const others = slideText(locale, 'others');
  for (const p of spec.panels) data.set(p.id, panelMatrix(p, dataset, total, swapped(p), order, others));

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
  // 主役を先に描く（付け合わせが主役の系列の色を使うため）
  const pending = [...spec.panels].sort((a, b) => Number(b.id === 'main') - Number(a.id === 'main'));
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
    const suffix = slideText(locale, m.growth.useCagr ? (m.growth.years === 1 ? 'yoy' : 'cagr') : 'periodGrowth');
    return m.rows.map((key) => (key === 'market' ? slideText(locale, 'market') : key.replace(/^series:/, '')) + ' ' + suffix);
  }

  function alignTarget(p: Panel, axis: string): PanelAnchors | undefined {
    const a = p.align?.find((x) => x.axis === axis);
    return a ? anchors.get(a.to) : undefined;
  }

  function layoutPanel(p: Panel, rect: Rect): { items: SceneItem[]; anchors: PanelAnchors } {
    const m = data.get(p.id)!;

    if (p.kind === 'chart') {
      const fn = p.chart ? CHART_LAYOUTS[p.chart] : undefined;
      if (!fn) throw new ComposeError('not_implemented', `chart "${p.chart}" is not implemented yet`);
      const on = new Set((p.inChartComplements ?? []).map((c) => c.id));
      const ctx: ChartCtx = {
        rect, matrix: m, locale,
        control: <T,>(id: ControlId) => control<T>(p, id),
        complement: (id) => on.has(id),
        unit: dataset.unit ?? '',
        colsLabel: colsLabelOf(p),
        alignTarget: (axis) => alignTarget(p, axis),
        ...(p.id !== 'main' ? { mainSeriesColors: () => { const a = anchors.get('main'); return a?.seriesColors ? { colors: a.seriesColors, ...(a.focusColor ? { focus: a.focusColor } : {}) } : undefined; } } : {}),
        alignedFrom: (axis) => hasAlignFrom(p.id, axis),
        alignedTableLabels: () => spec.panels
          .filter((q) => q.align?.some((a) => a.to === p.id && a.axis === 'columns'))
          .flatMap((q) => growthLabels(data.get(q.id)!)),
        warn: (w) => warnings.push(w),
        palette: chartPalette(theme, m.cols.length),
        unitInHeader,
        periodInHeader,
        note: spec.slide.chartNote ?? 'chart',
        footer,
      };
      return fn(ctx);
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

    if (p.kind === 'table' && p.table === 'cagr_table') {
      // メインのチャートと同じ行・列（絞り込みと入れ替え）で、変換はかけずに年の最初→最後で計算する
      const main = spec.panels.find((q) => q.kind === 'chart' && q.id === 'main') ?? spec.panels.find((q) => q.kind === 'chart');
      // 「上位だけ表示」はそろえる（主チャートに出ていない系列を表に出さない）
      const src = main ? panelMatrix({ ...main, transform: (main.transform ?? []).filter((x) => x.type === 'top_n') }, dataset, total, swapped(main), order, others) : m;
      const nf = (main ? control<string>(main, 'number_format') : undefined) ?? 'raw';
      const cols = main ? control<string>(main, 'cagr_table_cols') : undefined;
      return { items: layoutCagrTable({ rect, matrix: src, locale, numberFormat: nf as 'raw', colsLabel: main ? colsLabelOf(main) : slideText(locale, 'colsFallback'), ...(cols ? { cols: cols as CagrTableCols } : {}) }), anchors: {} };
    }

    throw new ComposeError('not_implemented', `${p.kind} panel "${p.table ?? ''}" is not implemented yet`);
  }

  const items: SceneItem[] = [frame.title, ...head.items, ...(scopeItem ? [scopeItem] : [])];
  for (const p of spec.panels) items.push(...panelItems.get(p.id)!);
  items.push(frame.source);
  // 出典の下に読み方の注記（出典が無ければ出典の位置に）
  if (footerNotes.length) {
    const src = frame.source;
    const hasSource = !!spec.slide.source?.trim();
    items.push({ kind: 'text', x: src.x, y: hasSource ? src.y + src.h - 0.02 : src.y, w: src.w, h: 0.2, lines: [{ t: slideText(locale, 'notePrefix', { text: footerNotes.join(locale === 'ja' ? '　' : ' · ') }), size: 8, color: SEC }], align: 'left', valign: 'middle' });
  }
  return { width: F.width, height: F.height, items, warnings };
}
