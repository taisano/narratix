import { normalize, readCell, type CellKind } from '@/features/editor/dataCheck';

/**
 * 値の持ち方（「数値を変えない」の定義）。
 * 貼り付けた元の文字列・正規化した数値と単位・表示の桁を分けて持ち、再編集で元データを失わない。
 * 算出した値は origin: 'derived' の印を付けて、貼り付けた値と区別する。
 */
export interface PastedValue {
  origin: 'pasted';
  /** 貼り付けた元の文字列（変えない） */
  raw: string;
  kind: CellKind;
  /** 正規化した数（% は 21.2% → 21.2。単位は掛けない） */
  value: number | null;
  percent: boolean;
  unit?: string;
  /** 表示の桁（元の文字列の小数の桁数） */
  decimals: number;
}

export interface DerivedValue {
  origin: 'derived';
  value: number;
  percent: boolean;
  unit?: string;
  decimals: number;
  /** 何から算出したか（画面で「LY は CY−差分で算出」と見せる） */
  formula: string;
  /** ユーザーが確認したか。未確認の算出値は候補に使わない */
  confirmed: boolean;
}

export type DraftValue = PastedValue | DerivedValue;

const decimalsOf = (raw: string): number => {
  const t = normalize(raw).replace(/[^\d.,\-]/g, '');
  const m = /[.,](\d+)$/.exec(t);
  // 1,200 のような桁区切り（小数点以下が3桁ちょうどで、前に桁がある）は小数ではない
  if (m && m[1]!.length === 3 && /\d[.,]\d{3}$/.test(t) && /,/.test(t)) return 0;
  return m ? m[1]!.length : 0;
};

export function readPastedValue(raw: string): PastedValue {
  const r = readCell(raw);
  return { origin: 'pasted', raw, kind: r.kind, value: r.value, percent: !!r.percent, ...(r.unit ? { unit: r.unit } : {}), decimals: r.kind === 'number' ? decimalsOf(raw) : 0 };
}

export function derivedValue(value: number, p: { percent?: boolean; unit?: string; decimals?: number; formula: string }): DerivedValue {
  return { origin: 'derived', value, percent: !!p.percent, ...(p.unit ? { unit: p.unit } : {}), decimals: p.decimals ?? 1, formula: p.formula, confirmed: false };
}

/** 表示用の文字列。桁は指定（無ければ元の桁）。丸めは表示だけで、value は変えない */
export function formatValue(v: DraftValue, decimals: number = v.decimals): string {
  if (v.value == null) return v.origin === 'pasted' ? v.raw : '';
  return `${v.value.toFixed(decimals)}${v.percent ? '%' : ''}`;
}

/** 候補に使ってよい値か（未確認の算出値は使わない） */
export const usable = (v: DraftValue): boolean => v.origin === 'pasted' || v.confirmed;
