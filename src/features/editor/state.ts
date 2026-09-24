import {
  CHART_TYPE_IDS, complementPlacement, controlsFor, registry, validateViewSpec,
  type ChartTypeId, type ComplementId, type ControlId, type Dataset, type Locale, type Panel, type PurposeId,
  type ValidationResult, type ViewSpec,
} from '@/registry';
import { IMPLEMENTED_COMPLEMENTS } from '@/engine/layout/charts';
import { SAMPLE_DATASET, SAMPLE_SOURCE, SAMPLE_TITLE, TREND_SAMPLE, TREND_SOURCE, TREND_TITLE } from './sample';

type Period = NonNullable<Dataset['periods']['base']>;

/**
 * エディタの画面の状態（保存形式 v2）。保存・出力の単位は ViewSpec なので、
 * 描画・検証・保存のたびに toViewSpec() で ViewSpec に変換する。
 */
export interface BuilderState {
  version: 2;
  /** 比較期間は画面上は常に持ち、全セルが空なら「なし」として扱う */
  dataset: Dataset & { periods: { base: Period } };
  chart: ChartTypeId;
  title: string;
  source: string;
  slideLocale: Locale;
  /** 詳細設定。チャートを切り替えても残し、描く時にそのチャートに効くものだけを使う */
  controls: Partial<Record<ControlId, unknown>>;
  /** 補完パーツのオン・オフ（チャートを切り替えても残す） */
  complements: Partial<Record<ComplementId, boolean>>;
  /** Mekko の複合構成：左の全体の構成、揃えた成長率表の中身 */
  mekko: { showTotal: boolean; growthMode: 'cagr' | 'period'; growthRows: string[] };
}

const emptyBase = (d: Dataset): Period => ({ label: '', values: d.rows.map(() => d.cols.map(() => null)) });

/** 目的ごとのサンプル（構成は Mekko の見本、推移・比較は年×地域） */
export function sampleFor(purpose: PurposeId): Pick<BuilderState, 'dataset' | 'title' | 'source'> {
  const composition = purpose === 'composition';
  const d = structuredClone(composition ? SAMPLE_DATASET : TREND_SAMPLE);
  return {
    dataset: { ...d, periods: { ...d.periods, base: d.periods.base ?? emptyBase(d) } } as BuilderState['dataset'],
    title: composition ? SAMPLE_TITLE : TREND_TITLE,
    source: composition ? SAMPLE_SOURCE : TREND_SOURCE,
  };
}

export function initialState(): BuilderState {
  return {
    version: 2,
    ...sampleFor('composition'),
    chart: 'mekko',
    slideLocale: 'ja',
    controls: { mekko_labels: 'pct', sort_by_size: true },
    complements: { aligned_table: true, delta_labels: true },
    mekko: { showTotal: true, growthMode: 'cagr', growthRows: ['market', 'series:デュアル'] },
  };
}

const hasValues = (vals: (number | null)[][]) => vals.some((r) => r.some((v) => v != null));
export const hasBase = (s: BuilderState) => hasValues(s.dataset.periods.base.values);
export const purposeOf = (s: BuilderState): PurposeId => registry.charts[s.chart].purpose;

/** 描画に渡す Dataset。形の種類は選んだチャートの目的に合わせ、比較期間が空なら取り除く */
export function toDataset(s: BuilderState): Dataset {
  const { base, current } = s.dataset.periods;
  return {
    ...s.dataset,
    schema: registry.purposes[purposeOf(s)].schema,
    periods: hasValues(base.values) ? { current, base } : { current },
  };
}

/** 行と列を入れ替えているか（そのチャートで入れ替えが使える場合のみ） */
export function isSwapped(s: BuilderState): boolean {
  return s.controls.axis_swap === 'swapped' && registry.controls.axis_swap.appliesTo.includes(s.chart);
}

/** 表示する行・列（絞り込みの後、入れ替えの前）。すべてなら undefined */
function shownNames(all: string[], picked: unknown): string[] | undefined {
  if (!Array.isArray(picked)) return undefined;
  const keep = all.filter((n) => picked.includes(n));
  return keep.length && keep.length < all.length ? keep : undefined;
}

/** チャートから見た行（横軸の項目）と列（系列）の名前。入れ替え・絞り込みの後 */
export function viewAxes(s: BuilderState): { rows: string[]; cols: string[] } {
  const d = s.dataset;
  const rows = shownNames(d.rows, s.controls.items) ?? d.rows;
  const cols = shownNames(d.cols, s.controls.series) ?? d.cols;
  return isSwapped(s) ? { rows: cols, cols: rows } : { rows, cols };
}

/** そのチャートに効く設定だけを、正しい値のものに絞って ViewSpec に入れる */
function chartControls(s: BuilderState): Record<string, unknown> {
  const axes = viewAxes(s);
  const out: Record<string, unknown> = {};
  for (const def of controlsFor(s.chart)) {
    const v = s.controls[def.id];
    if (v === undefined || ['title', 'subtitle', 'source', 'unit', 'palette'].includes(def.id)) continue;
    if (def.id === 'items') { const x = shownNames(s.dataset.rows, v); if (x) out.items = x; continue; }
    if (def.id === 'series') { const x = shownNames(s.dataset.cols, v); if (x) out.series = x; continue; }
    if (def.type === 'select' && !def.options?.some((o) => o.value === v)) continue;
    if (def.type === 'toggle' && typeof v !== 'boolean') continue;
    if (def.type === 'data_select' && !(typeof v === 'string' && (def.dataSource === 'rows' ? axes.rows : axes.cols).includes(v))) continue;
    out[def.id] = v;
  }
  return out;
}

/** オンになっていて、そのチャートで描ける（チャート内の）補完パーツ */
export function activeComplements(s: BuilderState, placement: 'in_chart' | 'panel'): ComplementId[] {
  const ok = IMPLEMENTED_COMPLEMENTS[s.chart] ?? [];
  return (Object.keys(s.complements) as ComplementId[]).filter((id) =>
    s.complements[id] && ok.includes(id) && registry.complements[id].placement === placement && registry.complements[id].appliesTo.includes(s.chart));
}

/** 画面の状態 → ViewSpec。レイアウトと置き場所はレジストリから決める */
export function toViewSpec(s: BuilderState): ViewSpec {
  const controls = chartControls(s);
  const inChart = activeComplements(s, 'in_chart').map((id) => ({ id }));
  const base: Omit<ViewSpec, 'layout' | 'panels'> = { datasetId: 'local', slide: { title: s.title, source: s.source }, slideLocale: s.slideLocale };

  if (s.chart !== 'mekko') {
    return { ...base, layout: { id: 'p01_single' }, panels: [{ id: 'main', slot: 'main', kind: 'chart', chart: s.chart, controls, inChartComplements: inChart }] };
  }

  // Mekko の複合構成（左の全体の構成＋ Mekko ＋ 揃えた成長率表）
  const place = complementPlacement('aligned_table', 'mekko')!;
  const withBase = hasBase(s);
  const cols = viewAxes(s).cols;
  const growthRows = s.mekko.growthRows.filter((r) => r === 'market' || cols.includes(r.replace(/^series:/, '')));
  const panels: Panel[] = [];
  if (s.mekko.showTotal) {
    panels.push({
      id: 'total', slot: 'left', kind: 'chart', chart: 'stacked_100',
      transform: [{ type: 'aggregate_rows' }, { type: 'select_periods', periods: withBase ? ['base', 'current'] : ['current'] }],
      ...(typeof controls.highlight === 'string' ? { controls: { highlight: controls.highlight } } : {}),
      align: [{ to: 'main', axis: 'y_scale' }],
    });
  }
  panels.push({ id: 'main', slot: place.hostSlot, kind: 'chart', chart: 'mekko', controls, inChartComplements: inChart });
  if (s.complements.aligned_table && growthRows.length) {
    panels.push({
      id: 'growth', slot: place.slot, kind: 'table', table: 'growth_table',
      transform: [{ type: 'growth', mode: s.mekko.growthMode, rows: growthRows }],
      align: [{ to: 'main', axis: 'columns' }],
    });
  }
  return { ...base, layout: { id: place.layout, ...(place.ratios ? { ratios: place.ratios } : {}) }, panels };
}

export function validateState(s: BuilderState): ValidationResult {
  return validateViewSpec(toViewSpec(s), toDataset(s));
}

/** 保存形式 v1（Mekko 専用だった頃）の状態 */
interface BuilderStateV1 {
  version: 1;
  dataset: BuilderState['dataset'];
  title: string; source: string;
  showTotal: boolean; alignedTable: boolean; growthMode: 'cagr' | 'period'; growthRows: string[];
  deltaLabels: boolean; labels: string; sortBySize: boolean; highlight: string | null; slideLocale: Locale;
}

/**
 * ブラウザ保存や DB から読み戻した値を、今の保存形式に直す。
 * v1（Mekko 専用）は v2 に変換する。壊れていれば null
 */
export function normalizeState(v: unknown): BuilderState | null {
  const o = v as Partial<BuilderState> & Partial<BuilderStateV1> | null;
  if (!o || typeof o !== 'object' || !o.dataset || !Array.isArray(o.dataset.rows) || !Array.isArray(o.dataset.cols) || !o.dataset.periods?.base) return null;
  if (o.version === 2) {
    if (!CHART_TYPE_IDS.includes(o.chart as ChartTypeId) || !o.controls || !o.complements || !o.mekko) return null;
    return o as BuilderState;
  }
  if (o.version === 1) {
    const v1 = o as BuilderStateV1;
    return {
      version: 2,
      dataset: v1.dataset,
      chart: 'mekko',
      title: v1.title, source: v1.source, slideLocale: v1.slideLocale,
      controls: { mekko_labels: v1.labels, sort_by_size: v1.sortBySize, ...(v1.highlight ? { highlight: v1.highlight } : {}) },
      complements: { aligned_table: v1.alignedTable, delta_labels: v1.deltaLabels },
      mekko: { showTotal: v1.showTotal, growthMode: v1.growthMode, growthRows: v1.growthRows },
    };
  }
  return null;
}

/** 正しい保存形式か（今の形式に直せるものも含む） */
export const isBuilderState = (v: unknown): boolean => normalizeState(v) != null;
