import { normalize } from '@/features/editor/dataCheck';
import type { PeriodKind } from './columnRoles';

const MONTHS = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?([\s\-\/']*(\d{2}|\d{4}))?$/i;

/** 期間として読めるか。全角・「2025年3月」「FY2025」「2025年度」「Q1」「2025Q2」「Jan-25」「2025-03」「2025/3/1」など */
export function parsePeriod(raw: string): PeriodKind | null {
  const t = normalize(raw).replace(/\s+/g, ' ');
  if (!t) return null;
  if (/^(19|20)\d{2}$/.test(t)) return 'year';
  if (/^FY\s?'?(\d{2}|\d{4})(\s?(E|F|A|P))?$/i.test(t) || /^(19|20)\d{2}\s?(年度|FY)$/i.test(t) || /^(19|20)\d{2}\/\d{2}\s?期?$/.test(t)) return 'fiscalYear';
  if (/^((19|20)\d{2}\s?)?[Qq][1-4]( ?'?(\d{2}|\d{4}))?$/.test(t) || /^(19|20)\d{2}年?\s?第?[1-4]四半期$/.test(t) || /^第?[1-4]四半期$/.test(t) || /^[1-4]Q$/i.test(t)) return 'quarter';
  if (/^(19|20)\d{2}\s?年\s?\d{1,2}\s?月$/.test(t) || /^\d{1,2}月$/.test(t) || /^(19|20)\d{2}[\/\-.](0?[1-9]|1[0-2])$/.test(t) || MONTHS.test(t)) return 'month';
  if (/^(19|20)\d{2}[\/\-.]\d{1,2}[\/\-.]\d{1,2}$/.test(t) || /^(19|20)\d{2}年\s?\d{1,2}月\s?\d{1,2}日$/.test(t)) return 'date';
  return null;
}

/** 非空のセルのうち period と読めるものが割合以上なら、その期間の種類（混在は unknown） */
export function periodKindOf(cells: string[], minShare = 0.8): PeriodKind | null {
  const filled = cells.filter((c) => normalize(c) !== '');
  if (filled.length < 1) return null;
  const kinds = filled.map(parsePeriod);
  const hits = kinds.filter((k): k is PeriodKind => k != null);
  if (hits.length / filled.length < minShare) return null;
  return new Set(hits).size === 1 ? hits[0]! : 'unknown';
}
