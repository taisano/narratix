import { localize, PROOF_NEEDS, type Locale, type ProofNeedId, type StoryDataPackSuggestion } from '@/registry';
import type { StorySlide, StoryState } from './model';
import {
  DATA_PACK_LIMITS, emptyDataPackPlan,
  type DataFieldKind, type DataRequestImportance, type DataValueType, type StoryDataPackPlan, type StoryDataRequest, type StoryDataRequestField,
} from './dataPackPlan';

/**
 * Story データパックの規則ベースの提案と、編集の操作（docs/story-data-pack-implementation-plan.md 13章）。
 * AI を使わずに、Question の proof_needs から「行の粒度が違うデータ」を別の依頼として組む。画面は後から重ねる
 */

// ──────────── 規則による提案（fallback） ────────────

/** 行の粒度が同じ proof_needs をまとめる。粒度が違えば別の依頼にする */
type Grain = 'trend' | 'mix' | 'bridge' | 'relation' | 'target';

const GRAIN_OF: Record<ProofNeedId, Grain> = {
  OVERALL_CHANGE: 'trend', GROWTH_SPEED: 'trend', CONTRIBUTION: 'trend', SIZE_CONTEXT: 'trend', SEGMENT_DIFFERENCE: 'trend', RANKING: 'trend',
  CURRENT_MIX: 'mix', MIX_CHANGE: 'mix', ITEM_SHARE: 'mix',
  BRIDGE: 'bridge',
  RELATIONSHIP: 'relation', POSITIONING: 'relation', SECOND_METRIC: 'relation',
  TARGET_GAP: 'target',
};
const GRAIN_ORDER: Grain[] = ['trend', 'mix', 'target', 'relation', 'bridge'];

/** 最初の提案は2〜4件を目安にする */
const SUGGEST_MAX = 4;

interface FieldSpec { id: string; ja: [label: string, desc: string]; en: [label: string, desc: string]; kind: DataFieldKind; valueType: DataValueType; unit?: boolean }
const f = (id: string, kind: DataFieldKind, valueType: DataValueType, ja: [string, string], en: [string, string], unit = false): FieldSpec => ({ id, kind, valueType, ja, en, unit });

const ITEM = f('item', 'dimension', 'text', ['項目', '比べたい単位（地域・商品・顧客など）'], ['Item', 'The unit being compared (region, product, customer, …)']);
const PERIOD = f('period', 'dimension', 'date', ['期間', '年・年度・四半期など'], ['Period', 'Year, fiscal year, quarter, …']);
const VALUE = f('value', 'measure', 'number', ['値', '集計済みの実数（率はアプリで計算します）'], ['Value', 'Aggregated actual numbers (the app calculates rates)'], true);

const SHAPES: Record<Grain, { label: [string, string]; grain: [string[], string[]]; fields: FieldSpec[] }> = {
  trend: { label: ['項目別の推移', 'Items over time'], grain: [['項目', '期間'], ['Item', 'Period']], fields: [ITEM, PERIOD, VALUE] },
  mix: {
    label: ['項目別の内訳', 'Breakdown by item'], grain: [['項目', '内訳', '期間'], ['Item', 'Segment', 'Period']],
    fields: [ITEM, f('segment', 'dimension', 'text', ['内訳', '構成要素（商品区分・費目など）'], ['Segment', 'Component of the whole (category, cost line, …)']), PERIOD, VALUE],
  },
  target: {
    label: ['実績と基準・目標', 'Actual vs. benchmark'], grain: [['項目'], ['Item']],
    fields: [ITEM, f('actual', 'measure', 'number', ['実績', '実際の値'], ['Actual', 'The actual value'], true), f('benchmark', 'measure', 'number', ['基準・目標', '比べる基準の値'], ['Benchmark', 'The value to compare with'], true)],
  },
  relation: {
    label: ['2つの指標', 'Two metrics'], grain: [['項目'], ['Item']],
    fields: [ITEM, f('metric_a', 'measure', 'number', ['指標A', '1つ目の指標'], ['Metric A', 'The first metric'], true), f('metric_b', 'measure', 'number', ['指標B', '2つ目の指標'], ['Metric B', 'The second metric'], true)],
  },
  bridge: {
    label: ['増減の内訳', 'Start-to-end bridge'], grain: [['増減の要因'], ['Driver']],
    fields: [f('driver', 'dimension', 'text', ['増減の要因', '始点から終点への変化を生んだ要因'], ['Driver', 'What moved the value from start to end']), f('delta', 'measure', 'number', ['増減額', '要因ごとの増減（プラスもマイナスも）'], ['Change', 'Change per driver (positive or negative)'], true)],
  },
};

const fieldOf = (spec: FieldSpec, locale: Locale): StoryDataRequestField => {
  const [label, description] = spec[locale];
  return { id: spec.id, label, description, kind: spec.kind, valueType: spec.valueType, required: true, origin: 'coach' };
};

const dedupe = <T,>(xs: T[]): T[] => [...new Set(xs)];

/**
 * Story の Question から、データを集める依頼を組む。
 * proof_needs を行の粒度でまとめ、同じ粒度は1つの依頼にする（最大 SUGGEST_MAX 件。超えた分は最後の依頼にまとめる）。
 * ユーザーの確認・編集が前提で、自動では確定しない
 */
export function fallbackDataPack(story: StoryState, locale: Locale = story.slideLocale): StoryDataPackPlan {
  const eligible = story.slides.filter((s) => s.questionPriority !== 'COACHING_ONLY' && s.proofNeeds.length > 0);
  const byGrain = new Map<Grain, StorySlide[]>();
  for (const s of eligible) {
    for (const g of dedupe(s.proofNeeds.map((n) => GRAIN_OF[n]))) byGrain.set(g, [...(byGrain.get(g) ?? []), s]);
  }
  // 提案できる Question が無い時も、空の画面にはしない（項目別の推移を1つ置く）
  if (!byGrain.size) byGrain.set('trend', []);
  const grains = GRAIN_ORDER.filter((g) => byGrain.has(g));

  const requests: StoryDataRequest[] = grains.map((g) => {
    const slides = dedupe(byGrain.get(g)!.map((s) => s.id)).map((id) => byGrain.get(g)!.find((s) => s.id === id)!);
    const shape = SHAPES[g];
    const needs = dedupe(slides.flatMap((s) => s.proofNeeds.filter((n) => GRAIN_OF[n] === g)));
    const hint = slides.flatMap((s) => s.personalization?.requiredDataHints ?? [])[0];
    return {
      id: `r-${g}`,
      label: hint ? hint.slice(0, DATA_PACK_LIMITS.label) : shape.label[locale === 'ja' ? 0 : 1],
      role: needs.map((n) => localize(PROOF_NEEDS[n].label, locale)).join(locale === 'ja' ? '、' : ', '),
      importance: slides.some((s) => s.questionPriority === 'REQUIRED') ? 'required' : 'recommended',
      origin: 'coach',
      questionRefs: slides.map((s) => s.id),
      grain: shape.grain[locale === 'ja' ? 0 : 1],
      fields: shape.fields.map((spec) => fieldOf(spec, locale)),
      sharedKeys: [],
    };
  });

  // 件数が多すぎる時は、超えた分を最後の依頼にまとめる（項目は名前で重ねる。Question の紐づけは残す）
  while (requests.length > SUGGEST_MAX) {
    const extra = requests.pop()!;
    const last = requests[requests.length - 1]!;
    last.questionRefs = dedupe([...last.questionRefs, ...extra.questionRefs]);
    last.role = dedupe([last.role, extra.role].filter(Boolean)).join(locale === 'ja' ? '、' : ', ');
    last.grain = dedupe([...last.grain, ...extra.grain]).slice(0, DATA_PACK_LIMITS.grain);
    for (const fld of extra.fields) if (!last.fields.some((x) => x.label === fld.label)) last.fields.push({ ...fld, id: `${fld.id}_${extra.id}` });
    if (extra.importance === 'required') last.importance = 'required';
  }

  // 依頼が2つ以上ある時は、「項目」（無ければ最初の Dimension）を共通キーにして、依頼どうしを対応させやすくする
  if (requests.length > 1) {
    for (const r of requests) {
      const key = r.fields.find((x) => x.id === 'item') ?? r.fields.find((x) => x.kind === 'dimension');
      if (key) r.sharedKeys = [key.id];
    }
  }
  return { ...emptyDataPackPlan(), requests };
}

/**
 * AI の提案（StoryReading.dataPack）を、依頼の計画にする。Question との対応は proof_needs が重なるもので付ける。
 * 使える依頼が無ければ undefined（呼ぶ側は規則の fallbackDataPack を使う）。必ずユーザーの確認が前提
 */
export function dataPackFromSuggestions(story: StoryState, suggestions: StoryDataPackSuggestion[] | undefined): StoryDataPackPlan | undefined {
  if (!suggestions?.length) return undefined;
  const eligible = story.slides.filter((s) => s.questionPriority !== 'COACHING_ONLY');
  const requests: StoryDataRequest[] = suggestions.slice(0, SUGGEST_MAX).map((sg, i) => ({
    id: `r-ai${i + 1}`,
    label: sg.label,
    role: sg.role,
    importance: sg.importance,
    origin: 'coach',
    questionRefs: eligible.filter((s) => s.proofNeeds.some((n) => sg.needs.includes(n))).map((s) => s.id),
    grain: sg.grain,
    fields: sg.fields.slice(0, DATA_PACK_LIMITS.fields).map((x, j) => ({
      id: `f${j + 1}`, label: x.label, description: x.description, kind: x.kind, valueType: x.valueType, required: true, origin: 'coach' as const,
      ...(x.unit ? { unit: x.unit } : {}), ...(x.example ? { example: x.example } : {}),
    })),
    sharedKeys: [],
  }));
  if (requests.length > 1) {
    for (const r of requests) {
      const key = r.fields.find((x) => x.kind === 'dimension');
      if (key) r.sharedKeys = [key.id];
    }
  }
  return { ...emptyDataPackPlan(), requests };
}

// ──────────── 編集の操作（画面から呼ぶ。元の計画は書き換えない） ────────────

const cap = (s: string, n: number) => s.trim().slice(0, n);
const sameLabel = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const nextId = (prefix: string, taken: Iterable<string>): string => {
  const set = new Set(taken);
  let n = set.size + 1;
  while (set.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
};

/** 該当の依頼だけを変える。何も変わらなかった時は、元の計画をそのまま返す */
const mapRequest = (plan: StoryDataPackPlan, id: string, fn: (r: StoryDataRequest) => StoryDataRequest): StoryDataPackPlan => {
  const before = plan.requests.find((r) => r.id === id);
  if (!before) return plan;
  const after = fn(before);
  return after === before ? plan : { ...plan, requests: plan.requests.map((r) => (r === before ? after : r)) };
};

/** 依頼（Dataset）を足す。ユーザーが足したもの（origin: user）として、項目は空から始める */
export function addRequest(plan: StoryDataPackPlan, label = ''): StoryDataPackPlan {
  if (plan.requests.length >= DATA_PACK_LIMITS.requests) return plan;
  const request: StoryDataRequest = {
    id: nextId('r', plan.requests.map((r) => r.id)), label: cap(label, DATA_PACK_LIMITS.label), role: '', importance: 'recommended', origin: 'user',
    questionRefs: [], grain: [], fields: [], sharedKeys: [],
  };
  return { ...plan, requests: [...plan.requests, request] };
}

export const removeRequest = (plan: StoryDataPackPlan, id: string): StoryDataPackPlan => ({ ...plan, requests: plan.requests.filter((r) => r.id !== id) });

export const updateRequest = (plan: StoryDataPackPlan, id: string, patch: Partial<Pick<StoryDataRequest, 'label' | 'role' | 'importance' | 'questionRefs' | 'datasetId'>>): StoryDataPackPlan =>
  mapRequest(plan, id, (r) => ({
    ...r,
    ...(patch.label != null ? { label: cap(patch.label, DATA_PACK_LIMITS.label) } : {}),
    ...(patch.role != null ? { role: cap(patch.role, DATA_PACK_LIMITS.text) } : {}),
    ...(patch.importance ? { importance: patch.importance as DataRequestImportance } : {}),
    ...(patch.questionRefs ? { questionRefs: dedupe(patch.questionRefs) } : {}),
    ...('datasetId' in patch ? { datasetId: patch.datasetId } : {}),
  }));

/** 依頼の並びを動かす（delta＝-1 で1つ上、1 で1つ下） */
export function moveRequest(plan: StoryDataPackPlan, id: string, delta: -1 | 1): StoryDataPackPlan {
  const i = plan.requests.findIndex((r) => r.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= plan.requests.length) return plan;
  const requests = [...plan.requests];
  [requests[i], requests[j]] = [requests[j]!, requests[i]!];
  return { ...plan, requests };
}

/** 項目を足す（自由項目）。空・同じ名前は足さない。足した項目は origin: user になる */
export function addField(plan: StoryDataPackPlan, requestId: string, label: string, kind: DataFieldKind = 'measure', extra: Partial<Pick<StoryDataRequestField, 'description' | 'unit' | 'valueType' | 'example' | 'required'>> = {}): StoryDataPackPlan {
  const name = cap(label, DATA_PACK_LIMITS.label);
  if (!name) return plan;
  return mapRequest(plan, requestId, (r) => {
    if (r.fields.length >= DATA_PACK_LIMITS.fields || r.fields.some((x) => sameLabel(x.label, name))) return r;
    const field: StoryDataRequestField = {
      id: nextId('u', r.fields.map((x) => x.id)), label: name, description: cap(extra.description ?? '', DATA_PACK_LIMITS.text), kind,
      valueType: extra.valueType ?? (kind === 'measure' ? 'number' : 'text'), required: extra.required ?? false, origin: 'user',
      ...(extra.unit ? { unit: cap(extra.unit, 40) } : {}),
      ...(extra.example && kind === 'dimension' ? { example: cap(extra.example, DATA_PACK_LIMITS.label) } : {}),
    };
    return { ...r, fields: [...r.fields, field] };
  });
}

/** 外した提案の項目を戻す（候補から選び直す）。同じ id・同じ名前が既にあれば何もしない。出どころは元のまま */
export function addCandidateField(plan: StoryDataPackPlan, requestId: string, field: StoryDataRequestField): StoryDataPackPlan {
  return mapRequest(plan, requestId, (r) => {
    if (r.fields.length >= DATA_PACK_LIMITS.fields || r.fields.some((x) => x.id === field.id || sameLabel(x.label, field.label))) return r;
    return { ...r, fields: [...r.fields, { ...field }] };
  });
}

/** 項目を外す。共通キーに入っていれば、そこからも外す */
export const removeField = (plan: StoryDataPackPlan, requestId: string, fieldId: string): StoryDataPackPlan =>
  mapRequest(plan, requestId, (r) => ({ ...r, fields: r.fields.filter((x) => x.id !== fieldId), sharedKeys: r.sharedKeys.filter((k) => k !== fieldId) }));

/** 項目の名前を変える（鉛筆）。空・同じ依頼内の別項目と同じ名前は変えない。Coach が足した項目の出どころは変えない */
export const renameField = (plan: StoryDataPackPlan, requestId: string, fieldId: string, label: string): StoryDataPackPlan =>
  mapRequest(plan, requestId, (r) => {
    const name = cap(label, DATA_PACK_LIMITS.label);
    if (!name || r.fields.some((x) => x.id !== fieldId && sameLabel(x.label, name))) return r;
    return { ...r, fields: r.fields.map((x) => (x.id === fieldId ? { ...x, label: name } : x)) };
  });

export const updateField = (plan: StoryDataPackPlan, requestId: string, fieldId: string, patch: Partial<Pick<StoryDataRequestField, 'description' | 'unit' | 'valueType' | 'example' | 'required'>>): StoryDataPackPlan =>
  mapRequest(plan, requestId, (r) => ({
    ...r,
    fields: r.fields.map((x) => {
      if (x.id !== fieldId) return x;
      const next = { ...x, ...(patch.description != null ? { description: cap(patch.description, DATA_PACK_LIMITS.text) } : {}), ...(patch.valueType ? { valueType: patch.valueType } : {}), ...(patch.required != null ? { required: patch.required } : {}) };
      if ('unit' in patch) { const u = cap(patch.unit ?? '', 40); if (u) next.unit = u; else delete next.unit; }
      if ('example' in patch) { const e = cap(patch.example ?? '', DATA_PACK_LIMITS.label); if (e && x.kind === 'dimension') next.example = e; else delete next.example; }
      return next;
    }),
  }));

/** 項目の並びを動かす（列の順になる） */
export const moveField = (plan: StoryDataPackPlan, requestId: string, fieldId: string, delta: -1 | 1): StoryDataPackPlan =>
  mapRequest(plan, requestId, (r) => {
    const i = r.fields.findIndex((x) => x.id === fieldId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= r.fields.length) return r;
    const fields = [...r.fields];
    [fields[i], fields[j]] = [fields[j]!, fields[i]!];
    return { ...r, fields };
  });

/** 共通キーの入れ替え（この依頼の項目だけ） */
export const toggleSharedKey = (plan: StoryDataPackPlan, requestId: string, fieldId: string): StoryDataPackPlan =>
  mapRequest(plan, requestId, (r) => {
    if (!r.fields.some((x) => x.id === fieldId)) return r;
    return { ...r, sharedKeys: r.sharedKeys.includes(fieldId) ? r.sharedKeys.filter((k) => k !== fieldId) : [...r.sharedKeys, fieldId].slice(0, DATA_PACK_LIMITS.sharedKeys) };
  });

/** Question が消えた・入れ替わった時に、存在しない Question への参照を外す（依頼そのものは消さない） */
export const pruneQuestionRefs = (plan: StoryDataPackPlan, questionIds: ReadonlySet<string>): StoryDataPackPlan => ({
  ...plan, requests: plan.requests.map((r) => ({ ...r, questionRefs: r.questionRefs.filter((id) => questionIds.has(id)) })),
});

// ──────────── 作成できるかの確認 ────────────

export interface DataPackIssue { requestId: string; label: string; missing: 'label' | 'dimension' | 'measure' }

/** データパックを作る前に足りないもの。どの依頼の何が足りないかを具体的に返す（依頼が1つも無い時は空配列で、作成側が別に止める） */
export function dataPackIssues(plan: StoryDataPackPlan): DataPackIssue[] {
  return plan.requests.flatMap((r): DataPackIssue[] => {
    const out: DataPackIssue[] = [];
    if (!r.label.trim()) out.push({ requestId: r.id, label: r.label, missing: 'label' });
    if (!r.fields.some((x) => x.kind === 'dimension')) out.push({ requestId: r.id, label: r.label, missing: 'dimension' });
    if (!r.fields.some((x) => x.kind === 'measure')) out.push({ requestId: r.id, label: r.label, missing: 'measure' });
    return out;
  });
}

export const canBuildDataPack = (plan: StoryDataPackPlan): boolean => plan.requests.length > 0 && dataPackIssues(plan).length === 0;
