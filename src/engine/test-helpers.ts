import type { Dataset } from '@/registry';

/** 見本の状態（S）を Dataset に変換する（テスト専用） */
export interface ReferenceState {
  unit: string; baseYear: number; curYear: number;
  regions: string[]; shapes: string[];
  cur: (number | null)[][]; base: (number | null)[][];
  title: string; source: string;
}

export function goldenDataset(s: ReferenceState): Dataset {
  return {
    schema: 'MEKKO',
    unit: s.unit,
    dimensions: { rows: '地域', cols: '形状' },
    rows: s.regions,
    cols: s.shapes,
    periods: {
      current: { label: String(s.curYear), values: s.cur },
      base: { label: String(s.baseYear), values: s.base },
    },
  };
}

export interface GoldenCase {
  state: ReferenceState & {
    mode: 'cagr' | 'period';
    growMarket: boolean;
    growShapes: boolean[];
    ptLabels: boolean;
    sortBySize: boolean;
    highlight: number;
  };
  model: {
    useCagr: boolean;
    missing: string[];
    regs: { name: string; tot: number; totB: number; share: number; mix: number[]; mixB: (number | null)[]; gMarket: number | null; gShape: (number | null)[] }[];
  };
  layout: { items: unknown[]; table: unknown | null };
}
