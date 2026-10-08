/**
 * Story データパック（データを集める依頼）の保存形式 v1。docs/story-data-pack-implementation-plan.md 13章。
 * 実データが入る前の「収集設計」なので、StoryDataset（実データ必須）とは分けて持つ。
 * 実データが入った後は、これまでどおり StoryDataset／dataset version を正本にする（空の依頼のためにダミーの Dataset は作らない）。
 * 既存の「テンプレート」（TemplateContent・STORY_TEMPLATES）と混同しないよう、名前は DataRequest 系にする
 */

export const DATA_REQUEST_IMPORTANCE = ['required', 'recommended', 'optional'] as const;
export type DataRequestImportance = (typeof DATA_REQUEST_IMPORTANCE)[number];

/** 誰が足したか。Coach の提案か、ユーザーが足したか（Dataset と項目の両方に持つ） */
export const DATA_REQUEST_ORIGINS = ['coach', 'user'] as const;
export type DataRequestOrigin = (typeof DATA_REQUEST_ORIGINS)[number];

export const DATA_FIELD_KINDS = ['dimension', 'measure'] as const;
export type DataFieldKind = (typeof DATA_FIELD_KINDS)[number];

export const DATA_VALUE_TYPES = ['text', 'number', 'percent', 'date'] as const;
export type DataValueType = (typeof DATA_VALUE_TYPES)[number];

export interface StoryDataRequestField {
  id: string;
  label: string;
  description: string;
  kind: DataFieldKind;
  valueType: DataValueType;
  unit?: string;
  /** 入力例（Dimension の例を数行置くのに使う。数値の項目では捏造しない） */
  example?: string;
  required: boolean;
  origin: DataRequestOrigin;
}

export interface StoryDataRequest {
  id: string;
  label: string;
  /** この Story での役割（Overview に出す） */
  role: string;
  importance: DataRequestImportance;
  origin: DataRequestOrigin;
  /** このデータを使う Question（StorySlide.id）。存在しなくなった Question への参照は読み込み時に外す */
  questionRefs: string[];
  /** 1行が何の粒度か（例：地域 × 年） */
  grain: string[];
  fields: StoryDataRequestField[];
  /** 他の依頼とつなぐための共通キー（この依頼の項目の id） */
  sharedKeys: string[];
  /** 実データとの対応（入力後に付ける。V1 では取り込み操作は作らない） */
  datasetId?: string;
}

/** Overview の見出しごとの区切り。公開する・しないを項目ごとに決める */
export const OVERVIEW_SECTIONS = ['consultation', 'background', 'purpose', 'questions', 'datasets', 'rules'] as const;
export type OverviewSection = (typeof OVERVIEW_SECTIONS)[number];

/** 既定で公開しない項目：元の相談文（戦略上の内容を含みうる） */
const PRIVATE_BY_DEFAULT: readonly OverviewSection[] = ['consultation'];

export interface DataPackOverview {
  titleOverride?: string;
  backgroundOverride?: string;
  purposeOverride?: string;
  rulesOverride?: string;
  /** 見出しごとの公開の指定。無い項目は既定（相談文だけ非公開、ほかは公開） */
  include?: Partial<Record<OverviewSection, boolean>>;
}

export interface StoryDataPackPlan {
  version: 1;
  overview: DataPackOverview;
  requests: StoryDataRequest[];
}

export const DATA_PACK_LIMITS = { requests: 8, fields: 30, grain: 6, sharedKeys: 6, label: 100, text: 300, long: 2000 } as const;

export const emptyDataPackPlan = (): StoryDataPackPlan => ({ version: 1, overview: {}, requests: [] });

/** Overview の見出しを公開するか（指定が無ければ既定） */
export const overviewIncludes = (plan: StoryDataPackPlan, section: OverviewSection): boolean =>
  plan.overview.include?.[section] ?? !PRIVATE_BY_DEFAULT.includes(section);

// ──────────── 読み込み（壊れていても、読めるところは読む） ────────────

const oneOf = <T extends string>(ids: readonly T[], v: unknown, fallback: T): T => ((ids as readonly string[]).includes(v as string) ? (v as T) : fallback);
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const optStr = (v: unknown, max: number): string | undefined => str(v, max) || undefined;
const strs = (v: unknown, max: number, each: number): string[] =>
  [...new Set((Array.isArray(v) ? v : []).map((x) => str(x, each)).filter(Boolean))].slice(0, max);

/** id は重複・空を避ける（空・重複は prefix+連番で振り直す。振り直しは読み込みごとに同じ結果になる） */
function uniqueId(raw: unknown, taken: Set<string>, prefix: string, index: number): string {
  let id = typeof raw === 'string' ? raw.trim().slice(0, 60) : '';
  if (!id || taken.has(id)) {
    let n = index + 1;
    do id = `${prefix}${n++}`; while (taken.has(id));
  }
  taken.add(id);
  return id;
}

function normalizeField(v: unknown, taken: Set<string>, index: number): StoryDataRequestField | null {
  const o = v as Partial<StoryDataRequestField> | null;
  if (!o || typeof o !== 'object') return null;
  const label = str(o.label, DATA_PACK_LIMITS.label);
  if (!label) return null;
  const kind = oneOf(DATA_FIELD_KINDS, o.kind, 'measure');
  const unit = optStr(o.unit, 40);
  const example = optStr(o.example, DATA_PACK_LIMITS.label);
  return {
    id: uniqueId(o.id, taken, 'f', index),
    label,
    description: str(o.description, DATA_PACK_LIMITS.text),
    kind,
    valueType: oneOf(DATA_VALUE_TYPES, o.valueType, kind === 'measure' ? 'number' : 'text'),
    ...(unit ? { unit } : {}),
    // 数値の項目に入力例は置かない（例を本物の値と取り違えさせない）
    ...(example && kind === 'dimension' ? { example } : {}),
    required: o.required === true,
    origin: oneOf(DATA_REQUEST_ORIGINS, o.origin, 'user'),
  };
}

function normalizeRequest(v: unknown, taken: Set<string>, index: number, questionIds: ReadonlySet<string>): StoryDataRequest | null {
  const o = v as Partial<StoryDataRequest> | null;
  if (!o || typeof o !== 'object') return null;
  const fieldIds = new Set<string>();
  const fields = (Array.isArray(o.fields) ? o.fields : []).slice(0, DATA_PACK_LIMITS.fields)
    .map((f, i) => normalizeField(f, fieldIds, i)).filter((f): f is StoryDataRequestField => !!f);
  const label = str(o.label, DATA_PACK_LIMITS.label);
  // 名前も項目も無い依頼は残さない
  if (!label && !fields.length) return null;
  const datasetId = optStr(o.datasetId, 60);
  return {
    id: uniqueId(o.id, taken, 'r', index),
    label,
    role: str(o.role, DATA_PACK_LIMITS.text),
    importance: oneOf(DATA_REQUEST_IMPORTANCE, o.importance, 'recommended'),
    origin: oneOf(DATA_REQUEST_ORIGINS, o.origin, 'user'),
    questionRefs: strs(o.questionRefs, 50, 60).filter((id) => questionIds.has(id)),
    grain: strs(o.grain, DATA_PACK_LIMITS.grain, 60),
    fields,
    // 共通キーは、この依頼に実在する項目の id だけ
    sharedKeys: strs(o.sharedKeys, DATA_PACK_LIMITS.sharedKeys, 60).filter((id) => fieldIds.has(id)),
    ...(datasetId ? { datasetId } : {}),
  };
}

/** 保存したデータパックの計画を読む。無い（古い Story）・壊れている時は undefined。questionIds＝いま存在する Question の id */
export function normalizeDataPackPlan(v: unknown, questionIds: ReadonlySet<string>): StoryDataPackPlan | undefined {
  const o = v as Partial<StoryDataPackPlan> | null;
  if (!o || typeof o !== 'object' || o.version !== 1) return undefined;
  const taken = new Set<string>();
  const requests = (Array.isArray(o.requests) ? o.requests : []).slice(0, DATA_PACK_LIMITS.requests)
    .map((r, i) => normalizeRequest(r, taken, i, questionIds)).filter((r): r is StoryDataRequest => !!r);
  const ov = (o.overview && typeof o.overview === 'object' ? o.overview : {}) as Partial<DataPackOverview>;
  const include: Partial<Record<OverviewSection, boolean>> = {};
  for (const s of OVERVIEW_SECTIONS) if (typeof ov.include?.[s] === 'boolean') include[s] = ov.include[s];
  const titleOverride = optStr(ov.titleOverride, DATA_PACK_LIMITS.label);
  const backgroundOverride = optStr(ov.backgroundOverride, DATA_PACK_LIMITS.long);
  const purposeOverride = optStr(ov.purposeOverride, DATA_PACK_LIMITS.long);
  const rulesOverride = optStr(ov.rulesOverride, DATA_PACK_LIMITS.long);
  return {
    version: 1,
    overview: {
      ...(titleOverride ? { titleOverride } : {}),
      ...(backgroundOverride ? { backgroundOverride } : {}),
      ...(purposeOverride ? { purposeOverride } : {}),
      ...(rulesOverride ? { rulesOverride } : {}),
      ...(Object.keys(include).length ? { include } : {}),
    },
    requests,
  };
}
