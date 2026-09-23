import {
  complementPlacement, validateViewSpec, type Dataset, type Locale, type Panel, type ValidationResult, type ViewSpec,
} from '@/registry';
import type { MekkoLabelMode } from '@/engine/layout/charts/mekko';
import { SAMPLE_DATASET, SAMPLE_SOURCE, SAMPLE_TITLE } from './sample';

/**
 * Mekko ビルダーの画面の状態。保存・出力の単位は ViewSpec なので、
 * 画面の状態は toViewSpec() で ViewSpec に変換してから描画・検証する。
 */
export interface BuilderState {
  version: 1;
  /** 比較期間は画面上は常に持ち、全セルが空なら「なし」として扱う */
  dataset: Dataset & { periods: { base: NonNullable<Dataset['periods']['base']> } };
  title: string;
  source: string;
  /** 左の全体合計（比較期間と現在の100%積み上げ） */
  showTotal: boolean;
  /** 下の揃えた成長率表 */
  alignedTable: boolean;
  growthMode: 'cagr' | 'period';
  /** 'market' または 'series:<列名>' */
  growthRows: string[];
  deltaLabels: boolean;
  labels: MekkoLabelMode;
  sortBySize: boolean;
  highlight: string | null;
  slideLocale: Locale;
}

export function initialState(): BuilderState {
  return {
    version: 1,
    dataset: structuredClone(SAMPLE_DATASET) as BuilderState['dataset'],
    title: SAMPLE_TITLE,
    source: SAMPLE_SOURCE,
    showTotal: true,
    alignedTable: true,
    growthMode: 'cagr',
    growthRows: ['market', 'series:デュアル'],
    deltaLabels: true,
    labels: 'pct',
    sortBySize: true,
    highlight: null,
    slideLocale: 'ja',
  };
}

const hasValues = (vals: (number | null)[][]) => vals.some((r) => r.some((v) => v != null));

/** 描画に渡す Dataset（比較期間が空なら取り除く） */
export function toDataset(s: BuilderState): Dataset {
  const { base, current } = s.dataset.periods;
  return { ...s.dataset, periods: hasValues(base.values) ? { current, base } : { current } };
}

/** 画面の状態 → ViewSpec。レイアウトと置き場所はレジストリ（補完パーツ aligned_table の定義）から決める */
export function toViewSpec(s: BuilderState): ViewSpec {
  const place = complementPlacement('aligned_table', 'mekko')!;
  const hasBase = hasValues(s.dataset.periods.base.values);
  const cols = s.dataset.cols;
  const growthRows = s.growthRows.filter((r) => r === 'market' || cols.includes(r.replace(/^series:/, '')));
  const panels: Panel[] = [];

  if (s.showTotal) {
    panels.push({
      id: 'total', slot: 'left', kind: 'chart', chart: 'stacked_100',
      transform: [{ type: 'aggregate_rows' }, { type: 'select_periods', periods: hasBase ? ['base', 'current'] : ['current'] }],
      ...(s.highlight && cols.includes(s.highlight) ? { controls: { highlight: s.highlight } } : {}),
      align: [{ to: 'main', axis: 'y_scale' }],
    });
  }
  panels.push({
    id: 'main', slot: place.hostSlot, kind: 'chart', chart: 'mekko',
    controls: {
      mekko_labels: s.labels,
      sort_by_size: s.sortBySize,
      ...(s.highlight && cols.includes(s.highlight) ? { highlight: s.highlight } : {}),
    },
    inChartComplements: s.deltaLabels ? [{ id: 'delta_labels' }] : [],
  });
  if (s.alignedTable && growthRows.length) {
    panels.push({
      id: 'growth', slot: place.slot, kind: 'table', table: 'growth_table',
      transform: [{ type: 'growth', mode: s.growthMode, rows: growthRows }],
      align: [{ to: 'main', axis: 'columns' }],
    });
  }

  return {
    datasetId: 'local',
    layout: { id: place.layout, ...(place.ratios ? { ratios: place.ratios } : {}) },
    panels,
    slide: { title: s.title, source: s.source },
    slideLocale: s.slideLocale,
  };
}

export function validateState(s: BuilderState): ValidationResult {
  return validateViewSpec(toViewSpec(s), toDataset(s));
}

/** ブラウザ保存から読み戻した値が壊れていないか */
export function isBuilderState(v: unknown): v is BuilderState {
  const o = v as BuilderState | null;
  return !!o && o.version === 1 && !!o.dataset && Array.isArray(o.dataset.rows) && Array.isArray(o.dataset.cols) && !!o.dataset.periods?.base;
}
