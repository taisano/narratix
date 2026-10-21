import { sourceCitation, sourceTitle } from '@/features/data/source';
import { kpiFromData } from '@/features/templates/content';
import { KPI_LIMITS } from '@/registry/storyTemplates';
import { checkPaste, type CheckResult, type ParsedTable } from '@/features/editor/dataCheck';
import type { Dataset, RecipeId } from '@/registry';
import { candidatesFor, type Candidate, type CandidateSet } from './candidates';
import type { AiRoleResponse, ColumnRoleMap } from './columnRoles';
import { inferRoles, type NeedsManualReason } from './infer';
import { profileTable, TableTooLarge, type TableProfile } from './profile';
import { isRateName } from '@/engine/layout/charts/combo-config';
import { reshape, type ReshapeFail, type ReshapeNote } from './reshape';
import { shapesOf, type DraftShape } from './shape';
import { validateRoleMap, type Dropped } from './validate';

/**
 * 実データ下書きの流れ（画面から呼ぶ入口）。貼った表 → 列対応（AI → 規則 → 手動）→ 形 → Dataset → 候補。
 * AI は列対応の一部を補助するだけで、組み替え・数値の転記・描画はすべてここ（コード）が行う。
 */

/** 組み替えられる形（1a：項目の大小・時系列、1b：実績と比較先の差・関係。表の候補は 1c） */
export const SUPPORTED_SHAPES: DraftShape[] = ['item_metric', 'time_metric', 'item_compare', 'relation', 'exact_table', 'time_kpi', 'time_combo'];

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

/** 貼った表の末尾に「出典：〇〇」があれば、それをスライドの出典にする。無ければ「貼り付けたデータ」 */
export function pastedSource(tsv: string, locale: 'ja' | 'en'): string {
  const a = analyzeTable(tsv);
  const text = a.ok ? a.check.issues.find((i) => i.code === 'noteRows')?.vars?.text : undefined;
  const found = typeof text === 'string' ? text.split('／').find((x) => /^\s*(出典|出所|資料|source)\s*[:：]/i.test(x)) : undefined;
  const title = found ? sourceTitle(found) : '';
  return title ? sourceCitation(title, locale) : draftSource(locale);
}

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
 * 画面の「列の使い方」で見えるようにしておく（不要なら「直す」で使わないにできる）。時間つきの表は、横持ち（行＝期間、列＝指標）の時だけ足す
 */
function fillLeftOutMetrics(profile: TableProfile, ai: AiRoleResponse, mapped: ColumnRoleMap): Resolved | null {
  const has = (m: ColumnRoleMap, ...roles: string[]) => m.assignments.some((a) => roles.includes(a.role));
  // 時間つきの表は、横持ち（行＝期間、列＝指標。系列の列が無い）の時だけ
  const wideTime = (m: ColumnRoleMap) => m.time?.orientation === 'rows' && !has(m, 'series', 'seriesValue');
  if (mapped.time ? !wideTime(mapped) : !has(mapped, 'item')) return null;
  const r = inferRoles(profile);
  if (r.status !== 'ok' || (mapped.time ? !wideTime(r.map) : !!r.map.time)) return null;
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
const SHAPE_ORDER: DraftShape[] = ['time_metric', 'time_combo', 'time_kpi', 'item_compare', 'item_metric', 'relation', 'exact_table'];

const setOf = (table: ParsedTable, map: ColumnRoleMap, question: string, shape: DraftShape): { ok: true; set: DraftSet } | { ok: false; reason: ReshapeFail } => {
  const r = reshape(table, map, shape);
  if (!r.ok) return r;
  const d = r.dataset as Dataset;
  const facts = shape === 'relation'
    ? { rows: d.rows.length, cols: d.cols.length, itemNames: undefined, hasSize: d.cols.length >= 3 }
    : { rows: d.rows.length, cols: d.cols.length, unit: d.unit, itemNames: shape === 'item_metric' ? d.cols : undefined, ...(shape === 'time_kpi' ? { canKpi: d.rows.length >= 2 && d.cols.length <= KPI_LIMITS.max && !!kpiFromData(d as never, 'ja', true) } : {}), ...(shape === 'exact_table' ? { mixedKinds: d.cols.some(isRateName) && d.cols.some((c) => !isRateName(c)) } : {}) };
  return { ok: true, set: { shape, dataset: d, notes: r.notes, candidates: candidatesFor(shape, question, facts, map) } };
};

/** 列対応から、当てはまる形ごとに Dataset と候補を作る。prefer の形があれば先頭に。組み替えられない形は飛ばし、全部だめなら最初の理由を返す */
export function buildDraft(table: ParsedTable, map: ColumnRoleMap, question: string, prefer?: DraftShape | null): Built {
  const all = shapesOf(map).filter((s) => SUPPORTED_SHAPES.includes(s));
  // KPI カード用の形は、時系列の形があるときだけ添える（候補は KPI だけ。時系列のタブの並びに入る）
  if (all.includes('time_metric')) all.push('time_kpi', 'time_combo');
  // 基本表（全部の数値）は、ほかの形があるときだけ添える
  const applicable = all.some((s) => s !== 'exact_table') ? all : [];
  if (!applicable.length) return { ok: false, reason: 'no_shape' };
  const order = [...applicable].sort((x, y) => (x === prefer ? -1 : y === prefer ? 1 : SHAPE_ORDER.indexOf(x) - SHAPE_ORDER.indexOf(y)));
  const sets: DraftSet[] = [];
  let firstFail: ReshapeFail | null = null;
  for (const shape of order) {
    const r = setOf(table, map, question, shape);
    if (r.ok && ((shape !== 'time_kpi' && shape !== 'time_combo') || r.set.candidates.candidates.length)) sets.push(r.set);
    else if (!r.ok && shape !== 'time_kpi' && shape !== 'time_combo') firstFail ??= r.reason;
  }
  if (!sets.length) return { ok: false, reason: firstFail ?? 'no_shape' };
  // 単位の違う指標があって、時系列の形が一部の指標だけを残している時は、基本表と色の濃淡つきの表は、全部の指標を持つ形（time_kpi）の方に移す
  const tm = sets.find((x) => x.shape === 'time_metric'), kp = sets.find((x) => x.shape === 'time_kpi');
  if (tm && kp && kp.dataset.cols.length > tm.dataset.cols.length) {
    const moving = tm.candidates.candidates.filter((c) => c.recipe === 'TABLE_BASIC');
    tm.candidates.candidates = tm.candidates.candidates.filter((c) => c.recipe !== 'TABLE_BASIC' && c.recipe !== 'TABLE_HEAT');
    const heat = kp.dataset.rows.length >= 3 && kp.dataset.cols.length >= 2 ? [{ recipe: 'TABLE_HEAT' as const, reason: 'heat_table' as const }] : [];
    kp.candidates.candidates = [...(moving.length ? moving : [{ recipe: 'TABLE_BASIC' as const, reason: 'exact_table' as const }]), ...heat, ...kp.candidates.candidates];
  }
  return { ok: true, ...sets[0]!, sets };
}

/** 最新の値・前の期間との比較を聞かれた質問 */
const LATEST_ASK = /最新|前月|前期|前年|今月|今期|どう変わ|現状|状況|kpi|latest|vs |versus|compared/i;

/** 推移・トレンドを聞かれた質問 */
const TREND_ASK = /推移|トレンド|動き|伸び|成長|時系列|trend|over time|growth/i;

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
export function tabsFor(sets: DraftSet[], recipe0: RecipeId, fallbackHome?: RecipeId | null): Candidate[] {
  let recipe = recipe0;
  const tableSet = sets.find((x) => x.shape === 'exact_table');
  // KPI カード（time_kpi）・量と率（time_combo）は専用のデータを持つが、タブは時系列の並びに入れる
  const kpiSet = sets.find((x) => x.shape === 'time_kpi');
  const comboSet = sets.find((x) => x.shape === 'time_combo');
  const extraSets = [comboSet, kpiSet].filter((x): x is DraftSet => !!x);
  const charts = sets.filter((x) => x.shape !== 'exact_table' && x.shape !== 'time_kpi' && x.shape !== 'time_combo');
  if (extraSets.some((x) => x.candidates.candidates.some((c) => c.recipe === recipe))) recipe = charts.find((x) => x.shape === 'time_metric')?.candidates.candidates[0]?.recipe ?? recipe;
  // 時系列の並び：グラフ → 量と率 → 表（基本表・濃淡）→ KPI
  const withKpi = (list: Candidate[], home: DraftSet | undefined): Candidate[] => {
    if (!extraSets.length || home?.shape !== 'time_metric') return list;
    const isTab = (c: Candidate) => c.recipe === 'TABLE_BASIC' || c.recipe === 'TABLE_HEAT';
    return [...list.filter((c) => !isTab(c)), ...(comboSet?.candidates.candidates ?? []), ...list.filter(isTab), ...(kpiSet?.candidates.candidates ?? [])];
  };
  const withBasic = (x: DraftSet) => !!tableSet && x.shape !== 'time_metric' && x.shape !== 'relation';
  const inTableSet = !!tableSet && tableSet.candidates.candidates.some((c) => c.recipe === recipe);
  let home = setFor(charts, recipe) ?? (fallbackHome ? setFor(charts, fallbackHome) : undefined) ?? charts[0];
  // 基本表・量と率（全部の数値の列）を見ている時：それを持つ形（項目の大小・実績と比較先）の並びの中で見せる
  if (inTableSet && home && !withBasic(home)) home = charts.find(withBasic) ?? home;
  const base = home ? [...withKpi(home.candidates.candidates, home)] : [];
  const extra = tableSet && home && withBasic(home) ? tableSet.candidates.candidates : [];
  if (!extra.length) return base.length && base.some((c) => c.recipe === recipe) ? base : inTableSet ? tableSet!.candidates.candidates : base;
  // 量と率（2軸の縦棒＋折れ線）は先頭、基本表は表の並びの中（正確な値を聞かれていれば）か最後
  const isTab = (c: Candidate) => c.recipe === 'TABLE_BASIC' || c.recipe === 'TABLE_HEAT';
  const evals = extra.filter((c) => c.recipe === 'EVAL_SMALL_BARS');
  const combos = extra.filter((c) => !isTab(c) && c.recipe !== 'EVAL_SMALL_BARS');
  const tables = extra.filter(isTab);
  // 小さな棒の並び（評価）は、グラフの次・表の前
  if (evals.length) {
    const firstTable = base.findIndex((c, i) => i > 0 && (c.recipe === 'TABLE_DELTA' || isTab(c)));
    base.splice(firstTable < 0 ? base.length : firstTable, 0, ...evals);
  }
  const lead = base.findIndex((c) => !(c.recipe === 'TABLE_DELTA' || c.recipe === 'TABLE_BASIC' || c.recipe === 'TABLE_HEAT'));
  const at = tables[0]?.reason === 'exact_values_asked' ? (lead < 0 ? base.length : lead) : base.length;
  const withTables = [...base.slice(0, at), ...tables, ...base.slice(at)];
  return tables[0]?.reason === 'exact_values_asked' ? [...withTables.slice(0, at + tables.length), ...combos, ...withTables.slice(at + tables.length)] : [...combos, ...withTables];
}

/** 質問の言い回しで先頭に決まった候補（例：規模を聞かれたバブル）。推奨の形の先頭が question_fit の時だけ。
 * 量と率の2列だけの表は、推奨が関係（散布図など）でない限り、2軸の縦棒＋折れ線（COMP_COMBO）を最初に見せる */
export function leadPick(sets: DraftSet[], recommended: RecipeId | null, question = ''): RecipeId | null {
  const home = (recommended ? setFor(sets, recommended) : undefined) ?? sets[0];
  const c = home?.candidates.candidates[0];
  // 量と率の2列だけの表（指標が3つ以上ある表は、ほかの見せ方も並べて、最初は決めない）
  const ts = sets.find((x) => x.shape === 'exact_table');
  const combo = ts && ts.dataset.cols.length === 2 ? ts.candidates.candidates.find((x) => x.recipe === 'COMP_COMBO') : undefined;
  if (combo && home && home.shape !== 'relation') return combo.recipe;
  // 単位の違う指標が複数ある時系列の表：折れ線・縦棒は1つの指標しか描けない（残りを捨てる）ので、推移を聞かれていなければ、全部の指標が見える KPI カードを最初に見せる
  const tm = sets.find((x) => x.shape === 'time_metric'), kp = sets.find((x) => x.shape === 'time_kpi');
  if (tm && kp && home?.shape === 'time_metric' && kp.dataset.cols.length > tm.dataset.cols.length && !TREND_ASK.test(question)) {
    const k = kp.candidates.candidates.find((x) => x.recipe === 'TABLE_KPI');
    const cb = sets.find((x) => x.shape === 'time_combo')?.candidates.candidates.find((x) => x.recipe === 'COMP_COMBO');
    // 最新の値・前の期間との比較を聞かれたら KPI カード。そうでなければ、量と率があれば縦棒＋折れ線、無ければ KPI カード
    if (LATEST_ASK.test(question) && k) return k.recipe;
    if (cb) return cb.recipe;
    if (k) return k.recipe;
  }
  if (c && c.reason === 'question_fit') return c.recipe;
  return null;
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
  return `${t}は、いくらか。`;
}

export function isExactAsk(text: string): boolean {
  return /いくら|正確|正しい数|具体的な数|一覧|数値を確認|exact|precise/i.test(text);
}
