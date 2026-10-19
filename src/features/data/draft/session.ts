import { checkPaste, type CheckResult, type ParsedTable } from '@/features/editor/dataCheck';
import type { Dataset, RecipeId } from '@/registry';
import { candidatesFor, type CandidateSet } from './candidates';
import type { AiRoleResponse, ColumnRoleMap } from './columnRoles';
import { inferRoles, type NeedsManualReason } from './infer';
import { profileTable, TableTooLarge, type TableProfile } from './profile';
import { reshape, type ReshapeFail, type ReshapeNote } from './reshape';
import { shapesOf, type DraftShape } from './shape';
import { validateRoleMap, type Dropped } from './validate';

/**
 * 実データ下書きの流れ（画面から呼ぶ入口）。貼った表 → 列対応（AI → 規則 → 手動）→ 形 → Dataset → 候補。
 * AI は列対応の一部を補助するだけで、組み替え・数値の転記・描画はすべてここ（コード）が行う。
 */

/** 組み替えられる形（1a：項目の大小・時系列、1b：実績と比較先の差・関係。表の候補は 1c） */
export const SUPPORTED_SHAPES: DraftShape[] = ['item_metric', 'time_metric', 'item_compare', 'relation'];

/** プランに持たせる下書きの元（元の貼り付け文字列と列対応を残す。Dataset は毎回ここから作る） */
export interface DraftSource {
  tsv: string;
  map: ColumnRoleMap | null;
  /** 手動指定が要る理由（map が null の時） */
  manual?: NeedsManualReason[];
  shape: DraftShape | null;
  /** 「この形で作成」で選んだレシピ */
  pick?: RecipeId;
  question: string;
}

export type AnalyzeFail = 'empty' | 'unreadable' | 'too_large';
export type Analyzed = { ok: true; table: ParsedTable; profile: TableProfile; check: CheckResult } | { ok: false; reason: AnalyzeFail };

export function analyzeTable(tsv: string): Analyzed {
  if (!tsv.trim()) return { ok: false, reason: 'empty' };
  const check = checkPaste(tsv);
  if (!check.table || check.issues.some((i) => i.level === 'error')) return { ok: false, reason: 'unreadable' };
  try { return { ok: true, table: check.table, profile: profileTable(check.table), check }; }
  catch (e) { if (e instanceof TableTooLarge) return { ok: false, reason: 'too_large' }; throw e; }
}

export interface Resolved { map: ColumnRoleMap; dropped: Dropped[] }
export type RolesOutcome = ({ status: 'ready' } & Resolved) | { status: 'needs_manual'; reasons: NeedsManualReason[] };

/** 列対応を決める：AI の返答（検証して採用）→ 規則による推定 → 手動指定。ユーザーの指定は別（manualRoles） */
export function resolveRoles(profile: TableProfile, ai: AiRoleResponse | null | undefined): RolesOutcome {
  if (ai) {
    const v = validateRoleMap(profile, ai, 'ai');
    if (v.status === 'ok') return { status: 'ready', map: v.map, dropped: v.dropped };
  }
  const r = inferRoles(profile);
  return r.status === 'ok' ? { status: 'ready', map: r.map, dropped: [] } : { status: 'needs_manual', reasons: r.reasons };
}

/** ユーザーが画面で選んだ列対応（source: user）。検証して通ったものだけ */
export function manualRoles(profile: TableProfile, input: unknown): RolesOutcome {
  const v = validateRoleMap(profile, input, 'user');
  return v.status === 'ok' ? { status: 'ready', map: v.map, dropped: v.dropped } : { status: 'needs_manual', reasons: ['unreadable'] };
}

export type BuildFail = ReshapeFail | 'no_shape';
/** 1つの形から作った Dataset と、その候補（形ごとに Dataset が違う：項目の比べ・時系列・関係） */
export interface DraftSet { shape: DraftShape; dataset: Dataset; notes: ReshapeNote[]; candidates: CandidateSet }
/** 最初の set を、従来どおり shape・dataset・notes・candidates としても持つ（sets は当てはまる形すべて） */
export type Built =
  | ({ ok: true; sets: DraftSet[] } & DraftSet)
  | { ok: false; reason: BuildFail };

/** 当てはまる形の並び：実績と比較先の差 → 時系列 → 項目の大小 → 関係（関係は最後） */
const SHAPE_ORDER: DraftShape[] = ['time_metric', 'item_compare', 'item_metric', 'relation'];

const setOf = (table: ParsedTable, map: ColumnRoleMap, question: string, shape: DraftShape): { ok: true; set: DraftSet } | { ok: false; reason: ReshapeFail } => {
  const r = reshape(table, map, shape);
  if (!r.ok) return r;
  const d = r.dataset as Dataset;
  const facts = shape === 'relation'
    ? { rows: d.rows.length, cols: d.cols.length, itemNames: undefined, hasSize: d.cols.length >= 3 }
    : { rows: d.rows.length, cols: d.cols.length, unit: d.unit, itemNames: shape === 'item_metric' ? d.cols : undefined };
  return { ok: true, set: { shape, dataset: d, notes: r.notes, candidates: candidatesFor(shape, question, facts, map) } };
};

/** 列対応から、当てはまる形ごとに Dataset と候補を作る。prefer の形があれば先頭に。組み替えられない形は飛ばし、全部だめなら最初の理由を返す */
export function buildDraft(table: ParsedTable, map: ColumnRoleMap, question: string, prefer?: DraftShape | null): Built {
  const applicable = shapesOf(map).filter((s) => SUPPORTED_SHAPES.includes(s));
  if (!applicable.length) return { ok: false, reason: 'no_shape' };
  const order = [...applicable].sort((x, y) => (x === prefer ? -1 : y === prefer ? 1 : SHAPE_ORDER.indexOf(x) - SHAPE_ORDER.indexOf(y)));
  const sets: DraftSet[] = [];
  let firstFail: ReshapeFail | null = null;
  for (const shape of order) {
    const r = setOf(table, map, question, shape);
    if (r.ok) sets.push(r.set); else firstFail ??= r.reason;
  }
  if (!sets.length) return { ok: false, reason: firstFail ?? 'no_shape' };
  return { ok: true, ...sets[0]!, sets };
}

/** このレシピを含む set（「この形で作成」の元データ） */
export const setFor = (sets: DraftSet[], recipe: RecipeId): DraftSet | undefined => sets.find((s) => s.candidates.candidates.some((c) => c.recipe === recipe));

/** プランの下書きの元から、Dataset と候補を作り直す（毎回同じ結果。AI は呼ばない） */
export function loadDraft(d: DraftSource): (Built & { table: ParsedTable }) | { ok: false; reason: 'no_map' | BuildFail | AnalyzeFail } {
  if (!d.map) return { ok: false, reason: 'no_map' };
  const a = analyzeTable(d.tsv);
  if (!a.ok) return { ok: false, reason: a.reason };
  const b = buildDraft(a.table, d.map, d.question, d.shape);
  return b.ok ? { ...b, table: a.table } : b;
}
