import { checkPaste, type CheckResult, type ParsedTable } from '@/features/editor/dataCheck';
import type { Dataset, RecipeId } from '@/registry';
import { candidatesFor, type Candidate, type CandidateSet } from './candidates';
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
export const SUPPORTED_SHAPES: DraftShape[] = ['item_metric', 'time_metric', 'item_compare', 'relation', 'exact_table'];

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

/** 貼り付けたデータで描いた図の出典（見本の出典にしない） */
export const draftSource = (locale: 'ja' | 'en'): string => (locale === 'en' ? 'Source: pasted data' : '出典：貼り付けたデータ');

export interface Resolved { map: ColumnRoleMap; dropped: Dropped[] }
export type RolesOutcome = ({ status: 'ready' } & Resolved) | { status: 'needs_manual'; reasons: NeedsManualReason[] };

/** 列対応を決める：AI の返答（検証して採用）→ 規則による推定 → 手動指定。ユーザーの指定は別（manualRoles） */
export function resolveRoles(profile: TableProfile, ai: AiRoleResponse | null | undefined): RolesOutcome {
  if (ai) {
    const v = validateRoleMap(profile, ai, 'ai');
    if (v.status === 'ok') {
      const filled = fillLeftOutMetrics(profile, ai, v.map);
      return { status: 'ready', map: filled?.map ?? v.map, dropped: filled?.dropped ?? v.dropped };
    }
  }
  const r = inferRoles(profile);
  return r.status === 'ok' ? { status: 'ready', map: r.map, dropped: [] } : { status: 'needs_manual', reasons: r.reasons };
}

/**
 * AI が拾わなかった（または「使わない」とした）数値の列を、規則が指標と読めるなら指標として足す。
 * AI には見出しの語彙にない見出し（例：客単価）の意味が伝わらず、使わない列にされやすい。数値の列を黙って落とさず、
 * 画面の「列の使い方」で見えるようにしておく（不要なら「直す」で使わないにできる）。時間つきの表では足さない
 */
function fillLeftOutMetrics(profile: TableProfile, ai: AiRoleResponse, mapped: ColumnRoleMap): Resolved | null {
  if (mapped.time || !mapped.assignments.some((a) => a.role === 'item')) return null;
  const r = inferRoles(profile);
  if (r.status !== 'ok' || r.map.time) return null;
  const used = new Set(mapped.assignments.filter((a) => a.role !== 'unused').map((a) => a.col));
  const add = r.map.assignments.filter((a) => a.role === 'metric' && !used.has(a.col));
  if (!add.length) return null;
  const addCols = new Set(add.map((a) => a.col));
  const v = validateRoleMap(profile, { ...ai, assignments: [...ai.assignments.filter((a) => !addCols.has(a.col)), ...add] }, 'ai');
  return v.status === 'ok' ? { map: v.map, dropped: v.dropped } : null;
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
const SHAPE_ORDER: DraftShape[] = ['time_metric', 'item_compare', 'item_metric', 'relation', 'exact_table'];

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
  const all = shapesOf(map).filter((s) => SUPPORTED_SHAPES.includes(s));
  // 基本表（全部の数値）は、ほかの形があるときだけ添える
  const applicable = all.some((s) => s !== 'exact_table') ? all : [];
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

/** 差を聞かれた質問（増減表を先に） */
const DIFF = /差|ずれ|乖離|増減|差異|vs|versus|gap|diff|variance/i;

/** 正確な値を聞かれた相談で、最初に見せる表。差を聞かれていて増減表があれば増減表、それ以外は基本表（全部の数値） */
export function exactPick(sets: DraftSet[], question: string): RecipeId | null {
  const all = sets.flatMap((x) => x.candidates.candidates).filter((c) => c.reason === 'exact_values_asked');
  if (!all.length) return null;
  const delta = all.find((c) => c.recipe === 'TABLE_DELTA');
  const basic = all.find((c) => c.recipe === 'TABLE_BASIC');
  return (DIFF.test(question) ? delta ?? basic : basic ?? delta)?.recipe ?? null;
}

/**
 * 同じ場所に並べるタブ：このレシピの属する形の候補 ＋ 基本表（全部の数値）。
 * 基本表は、項目の大小・実績と比較先の形の末尾に付く（正確な値を聞かれていれば、表の並びの中）。関係と時系列には付けない（時系列は期間×系列の表が基本表）
 */
export function tabsFor(sets: DraftSet[], recipe: RecipeId, fallbackHome?: RecipeId | null): Candidate[] {
  const tableSet = sets.find((x) => x.shape === 'exact_table');
  const charts = sets.filter((x) => x.shape !== 'exact_table');
  const withBasic = (x: DraftSet) => !!tableSet && x.shape !== 'time_metric' && x.shape !== 'relation';
  let home = setFor(charts, recipe) ?? (fallbackHome ? setFor(charts, fallbackHome) : undefined) ?? charts[0];
  // 基本表そのものを見ている時：基本表を持つ形（項目の大小・実績と比較先）の並びの中で見せる。無ければ基本表だけ
  if (recipe === 'TABLE_BASIC' && home && !withBasic(home)) home = charts.find(withBasic) ?? home;
  const base = home ? home.candidates.candidates : [];
  const basic = tableSet && home && withBasic(home) ? tableSet.candidates.candidates : [];
  if (!basic.length) return base.length && base.some((c) => c.recipe === recipe) ? base : recipe === 'TABLE_BASIC' && tableSet ? tableSet.candidates.candidates : base;
  const lead = base.findIndex((c) => !(c.recipe === 'TABLE_DELTA' || c.recipe === 'TABLE_BASIC'));
  const at = basic[0]!.reason === 'exact_values_asked' ? (lead < 0 ? base.length : lead) : base.length;
  return [...base.slice(0, at), ...basic, ...base.slice(at)];
}

/** 質問の言い回しで先頭に決まった候補（例：規模を聞かれたバブル）。推奨の形の先頭が question_fit の時だけ */
export function leadPick(sets: DraftSet[], recommended: RecipeId | null): RecipeId | null {
  const home = (recommended ? setFor(sets, recommended) : undefined) ?? sets[0];
  const c = home?.candidates.candidates[0];
  return c && c.reason === 'question_fit' ? c.recipe : null;
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

/** 一覧・正確な数値を聞かれた相談の「答える問い」：相談文から「何を知りたいか」を取り出して「〜は、いくつか。」にする。取り出せなければ null */
export function exactQuestion(text: string, locale: 'ja' | 'en' = 'ja'): string | null {
  if (locale !== 'ja') return null;
  if (!/いくら|正確|正しい数|具体的な数|一覧|数値を確認|確認したい|見たい|知りたい/.test(text)) return null;
  let t = text.trim().replace(/[。.!！?？\s]+$/, '');
  // 文末の依頼表現を落とす（〜を正確な数値で確認したい／〜を一覧で見たい／〜を知りたい）
  t = t.replace(/(を|は|が)?(、)?(小数まで)?(正確な数値|正確な値|正確に|正確|正しい数|具体的な数|数値|一覧|表|いくつ|いくら)?(で|を)?(確認|見|知り|比較|把握|見比べ)(し)?(ておき)?(たい|たいです|たいんです)$/, '');
  t = t.replace(/[、,]\s*$/, '').trim();
  if (t.length < 3 || t.length > 40 || t === text.trim()) return null;
  return `${t}は、いくつか。`;
}

export function isExactAsk(text: string): boolean {
  return /いくら|正確|正しい数|具体的な数|一覧|数値を確認|exact|precise/i.test(text);
}
