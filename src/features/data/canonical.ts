import type { Dataset, Locale, LongPivot } from '@/registry';
import { isTimeLabel, columnKinds, isTimeCol } from '@/features/editor/long';
import { dataKey, familyOf, type DataFamily, type ProjectState, type SlideState } from '@/features/editor/project';
import { isTwoMetricChart } from '@/features/editor/state';

export type MissingReason = 'blank' | 'not_available' | 'not_applicable' | 'confidential' | 'error';
export type TimeGranularity = 'year' | 'half' | 'quarter' | 'month' | 'week' | 'day' | 'point' | 'unknown';
export type DimensionKind = 'geography' | 'category' | 'entity' | 'segment' | 'scenario' | 'other' | 'unknown';
export type Quantity = 'currency' | 'count' | 'percent' | 'ratio' | 'index' | 'duration' | 'score' | 'other' | 'unknown';
export type Aggregation = 'sum' | 'average' | 'ratio' | 'stock' | 'unknown';

export interface TimeField {
  id: string;
  name: string;
  role: 'time';
  granularity: TimeGranularity;
  basis?: 'calendar' | 'fiscal' | 'unknown';
  members: { id: string; label: string; start?: string; end?: string }[];
}

export interface DimensionField {
  id: string;
  name: string;
  role: 'dimension';
  kind: DimensionKind;
  members: { id: string; label: string; total?: boolean }[];
}

export interface MeasureField {
  id: string;
  name: string;
  role: 'measure';
  unit: { label: string; quantity: Quantity; currency?: string; scale?: number };
  aggregation: Aggregation;
  definition?: string;
  denominatorFieldId?: string;
  valueKind?: 'actual' | 'plan' | 'forecast' | 'target' | 'reference' | 'unknown';
  derived?: { formulaId: string; inputs: string[] };
}

export type Field = TimeField | DimensionField | MeasureField;

export interface CanonicalTable {
  schemaVersion: 1;
  fields: Field[];
  records: (string | number | null)[][];
  missing?: Record<string, MissingReason>;
}

export interface SourceRecord {
  id: string;
  workspaceId: string;
  kind: 'external_web' | 'external_document' | 'internal' | 'survey' | 'user_estimate' | 'sample';
  title: string;
  publisher?: string;
  url?: string;
  publishedAt?: string;
  retrievedAt?: string;
  locator?: string;
  citationText: string;
}

export interface TextField {
  text: string;
  author: 'user' | 'ai' | 'ai_edited' | 'template' | 'sample' | 'rule';
  ai?: { feature: string; model: string; promptVersion: string; original: string; factIds?: string[]; at: string };
  basis?: { datasetVersionId: string; dataHash: string; semanticsHash: string };
  updatedAt: string;
}

export interface PivotSpec {
  rowFieldId?: string;
  columnFieldId?: string;
  timeFieldId?: string;
  groupFieldId?: string;
  measureFieldIds: string[];
  currentMemberId?: string;
  baseMemberId?: string;
  long?: LongPivot;
}

export type SlideView = Omit<SlideState, 'id' | 'title' | 'dataRef' | 'longPivot'>;

export interface SlideRecord {
  id: string;
  view: SlideView;
  data: { datasetVersionId: string; pivot: PivotSpec }[];
  texts: { message?: TextField; chartTitle?: TextField; question?: TextField; notes?: TextField };
}

export interface StoryMeta {
  title?: TextField;
  consultation?: string;
  decisionQuestion?: TextField;
  route?: string;
  groups?: Record<string, string[]>;
}

export interface DeckContent {
  schemaVersion: 1;
  slideLocale: Locale;
  slides: SlideRecord[];
  story?: StoryMeta;
}

export interface DatasetProjection extends PivotSpec {
  mode: 'matrix' | 'two_metric' | 'long';
}

export interface CanonicalDatasetDraft {
  table: CanonicalTable;
  projection: DatasetProjection;
  /** 現在の画面が持つ元入力。正規形から戻せない入力表・読み方も版に必ず残す。 */
  input: { kind: 'legacy_dataset'; dataset: Dataset };
  originalTableHash: string;
  contentHash: string;
  semanticsHash: string;
}

interface DatasetSlot {
  key: string;
  family: DataFamily;
  label: string;
  source: string;
}

export interface CanonicalProjectDraft {
  content: DeckContent;
  datasetVersions: Record<string, CanonicalDatasetDraft>;
  editor: {
    current: number;
    recommendation?: ProjectState['recommendation'];
    origin?: ProjectState['origin'];
    tone?: ProjectState['tone'];
    slots: Record<string, DatasetSlot>;
  };
}

const member = (field: string, label: string, index: number) => ({ id: `${field}:${index}`, label });
const memberMap = (field: string, labels: string[]) => labels.map((label, i) => member(field, label, i));
const allTime = (labels: string[]) => labels.length > 0 && labels.every((x) => isTimeLabel(x));

const granularityOf = (labels: string[]): TimeGranularity => {
  if (!labels.length) return 'unknown';
  if (labels.every((x) => /^(FY\s?)?(19|20)\d{2}年?$/i.test(x.trim()))) return 'year';
  if (labels.every((x) => /(Q[1-4]|[1-4]Q)/i.test(x))) return 'quarter';
  if (labels.every((x) => /(H[12]|上期|下期)/i.test(x))) return 'half';
  if (labels.every((x) => /\d{1,2}月|\/\d{1,2}$/.test(x))) return 'month';
  return 'unknown';
};

const currencyOf = (label: string): string | undefined => /\$|USD|ドル/i.test(label) ? 'USD' : /€|EUR|ユーロ/i.test(label) ? 'EUR' : /£|GBP|ポンド/i.test(label) ? 'GBP' : /円|JPY/i.test(label) ? 'JPY' : undefined;
const scaleOf = (label: string): number | undefined => /兆/.test(label) ? 1e12 : /億/.test(label) ? 1e8 : /百万|M\b/i.test(label) ? 1e6 : /万/.test(label) ? 1e4 : /千|K\b/i.test(label) ? 1e3 : undefined;
const quantityOf = (label: string): Quantity => currencyOf(label) ? 'currency' : /%|％/.test(label) ? 'percent' : /人|件|台|個|社/.test(label) ? 'count' : label ? 'other' : 'unknown';
const unitOf = (label: string) => ({ label, quantity: quantityOf(label), ...(currencyOf(label) ? { currency: currencyOf(label) } : {}), ...(scaleOf(label) ? { scale: scaleOf(label) } : {}) });
const splitMeasureLabel = (label: string, fallbackUnit = ''): { name: string; unit: string } => {
  const m = /^(.*?)[（(]([^()（）]+)[）)]\s*$/.exec(label.trim());
  return m ? { name: m[1]!.trim() || label, unit: m[2]!.trim() } : { name: label || '値', unit: fallbackUnit };
};

const dimensionField = (id: string, name: string, labels: string[]): DimensionField => ({ id, name: name || id, role: 'dimension', kind: 'unknown', members: memberMap(id, labels) });
const timeField = (id: string, name: string, labels: string[]): TimeField => ({ id, name: name || id, role: 'time', granularity: granularityOf(labels), basis: labels.some((x) => /^FY/i.test(x)) ? 'fiscal' : 'unknown', members: memberMap(id, labels) });
const measureField = (id: string, name: string, unit: string, aggregation: Aggregation = 'unknown'): MeasureField => ({ id, name: name || '値', role: 'measure', unit: unitOf(unit), aggregation });

const stable = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => `${JSON.stringify(k)}:${stable(x)}`).join(',')}}`;
  return JSON.stringify(v);
};

export function stableHash(v: unknown): string {
  const text = stable(v);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `fnv1a-${(h >>> 0).toString(16).padStart(8, '0')}`;
}

const hashes = (table: CanonicalTable) => {
  const content = { records: table.records, missing: table.missing ?? {} };
  const semantics = table.fields;
  return { contentHash: stableHash(content), semanticsHash: stableHash(semantics), originalTableHash: stableHash(table) };
};

function longCanonical(dataset: Dataset): { table: CanonicalTable; projection: DatasetProjection } {
  const source = dataset.long!;
  const kinds = columnKinds(source);
  const fields: Field[] = source.headers.map((name, k) => {
    if (kinds[k] === 'value') return measureField(`field:${k}`, name, k === source.pivot.value ? source.unit ?? dataset.unit ?? '' : '');
    const labels = [...new Set(source.rows.map((r) => (r[k] ?? '').trim()).filter(Boolean))];
    return isTimeCol(source, k) ? timeField(`field:${k}`, name, labels) : dimensionField(`field:${k}`, name, labels);
  });
  const maps = fields.map((f) => f.role === 'measure' ? null : new Map(f.members.map((m) => [m.label, m.id])));
  const missing: Record<string, MissingReason> = {};
  const records = source.rows.map((row, i) => fields.map((f, k) => {
    const raw = (row[k] ?? '').trim();
    if (f.role === 'measure') {
      if (!raw) { missing[`${i}:${f.id}`] = 'blank'; return null; }
      const n = Number(raw.replace(/,/g, '').replace(/[%％]/g, ''));
      if (!Number.isFinite(n)) { missing[`${i}:${f.id}`] = 'error'; return null; }
      return n;
    }
    return maps[k]!.get(raw) ?? '';
  }));
  const projection: DatasetProjection = {
    mode: 'long', rowFieldId: `field:${source.pivot.row}`, columnFieldId: `field:${source.pivot.col}`,
    measureFieldIds: [`field:${source.pivot.value}`], long: structuredClone(source.pivot),
  };
  return { table: { schemaVersion: 1, fields, records, ...(Object.keys(missing).length ? { missing } : {}) }, projection };
}

export function datasetToCanonical(dataset: Dataset, options: { twoMetric?: boolean } = {}): CanonicalDatasetDraft {
  const input = { kind: 'legacy_dataset' as const, dataset: structuredClone(dataset) };
  if (dataset.long) {
    const x = longCanonical(dataset), h = hashes(x.table);
    return { ...x, input, ...h };
  }

  const rowLabels = [...dataset.rows], colLabels = [...dataset.cols];
  const row: TimeField | DimensionField = allTime(rowLabels) ? timeField('row', dataset.dimensions?.rows ?? '時間', rowLabels) : dimensionField('row', dataset.dimensions?.rows ?? '行', rowLabels);
  const col = dimensionField('column', dataset.dimensions?.cols ?? '列', colLabels);
  const fields: Field[] = [row, col];
  const group = dataset.groups ? dimensionField('group', dataset.dimensions?.group ?? 'グループ', [...new Set(dataset.groups.filter((x): x is string => !!x))]) : null;
  if (group) fields.push(group);
  const missing: Record<string, MissingReason> = {};
  const records: (string | number | null)[][] = [];
  let projection: DatasetProjection;

  if (options.twoMetric) {
    const cur = splitMeasureLabel(dataset.periods.current.label, dataset.colMeta?.[0]?.unit ?? dataset.unit ?? '');
    const base = splitMeasureLabel(dataset.periods.base?.label ?? '', dataset.colMeta?.[1]?.unit ?? dataset.unit ?? '');
    const measures = [measureField('measure:current', cur.name, cur.unit), measureField('measure:base', base.name, base.unit)];
    fields.push(...measures);
    for (let i = 0; i < rowLabels.length; i++) for (let j = 0; j < colLabels.length; j++) {
      const rec: (string | number | null)[] = [row.members[i]!.id, col.members[j]!.id];
      if (group) rec.push(dataset.groups?.[i] ? group.members.find((m) => m.label === dataset.groups![i])?.id ?? '' : '');
      const values = [dataset.periods.current.values[i]?.[j] ?? null, dataset.periods.base?.values[i]?.[j] ?? null];
      for (let k = 0; k < values.length; k++) { const value = values[k] ?? null; if (value == null) missing[`${records.length}:${measures[k]!.id}`] = 'blank'; rec.push(value); }
      records.push(rec);
    }
    projection = { mode: 'two_metric', rowFieldId: row.id, columnFieldId: col.id, ...(group ? { groupFieldId: group.id } : {}), measureFieldIds: measures.map((x) => x.id) };
  } else {
    const measure = measureField('measure', dataset.dimensions?.cols ?? '値', dataset.unit ?? '', dataset.schema === 'MEKKO' ? 'sum' : 'unknown');
    const base = dataset.periods.base;
    const hasBase = !!base && (base.label.trim() !== '' || base.values.some((r) => r.some((v) => v != null)));
    const periods = hasBase ? [dataset.periods.current.label || '現在', base!.label || '比較'] : [];
    const time = periods.length ? timeField('period', '期間', periods) : null;
    if (time) fields.push(time);
    fields.push(measure);
    const periodValues = time ? [{ member: time.members[0]!, values: dataset.periods.current.values }, { member: time.members[1]!, values: base!.values }] : [{ member: null, values: dataset.periods.current.values }];
    for (const pv of periodValues) for (let i = 0; i < rowLabels.length; i++) for (let j = 0; j < colLabels.length; j++) {
      const rec: (string | number | null)[] = [row.members[i]!.id, col.members[j]!.id];
      if (group) rec.push(dataset.groups?.[i] ? group.members.find((m) => m.label === dataset.groups![i])?.id ?? '' : '');
      if (pv.member) rec.push(pv.member.id);
      const value = pv.values[i]?.[j] ?? null;
      if (value == null) missing[`${records.length}:${measure.id}`] = 'blank';
      rec.push(value); records.push(rec);
    }
    projection = {
      mode: 'matrix', rowFieldId: row.id, columnFieldId: col.id, ...(group ? { groupFieldId: group.id } : {}),
      ...(time ? { timeFieldId: time.id, currentMemberId: time.members[0]!.id, baseMemberId: time.members[1]!.id } : {}), measureFieldIds: [measure.id],
    };
  }
  const table: CanonicalTable = { schemaVersion: 1, fields, records, ...(Object.keys(missing).length ? { missing } : {}) };
  return { table, projection, input, ...hashes(table) };
}

const field = <T extends Field['role']>(table: CanonicalTable, id: string | undefined, role: T): Extract<Field, { role: T }> | undefined =>
  table.fields.find((x): x is Extract<Field, { role: T }> => x.id === id && x.role === role);

export function datasetFromCanonical(draft: CanonicalDatasetDraft): Dataset {
  if (stableHash(draft.table) === draft.originalTableHash || draft.projection.mode === 'long') return structuredClone(draft.input.dataset);
  const out = structuredClone(draft.input.dataset);
  const p = draft.projection, row = field(draft.table, p.rowFieldId, p.rowFieldId === 'row' && field(draft.table, p.rowFieldId, 'time') ? 'time' : 'dimension') as TimeField | DimensionField | undefined;
  const col = field(draft.table, p.columnFieldId, 'dimension');
  if (!row || !col) return out;
  out.rows = row.members.map((x) => x.label); out.cols = col.members.map((x) => x.label);
  const ri = new Map(row.members.map((x, i) => [x.id, i])), ci = new Map(col.members.map((x, i) => [x.id, i]));
  const indices = new Map(draft.table.fields.map((x, i) => [x.id, i]));
  const grid = () => out.rows.map(() => out.cols.map(() => null as number | null));
  const cur = grid(), base = grid();
  if (p.mode === 'two_metric') {
    const mi = p.measureFieldIds.map((id) => indices.get(id)!);
    for (const rec of draft.table.records) {
      const i = ri.get(String(rec[indices.get(row.id)!])), j = ci.get(String(rec[indices.get(col.id)!]));
      if (i == null || j == null) continue;
      const currentValue = rec[mi[0]!], baseValue = rec[mi[1]!];
      cur[i]![j] = typeof currentValue === 'number' ? currentValue : null;
      base[i]![j] = typeof baseValue === 'number' ? baseValue : null;
    }
  } else {
    const vi = indices.get(p.measureFieldIds[0]!)!, ti = p.timeFieldId ? indices.get(p.timeFieldId) : undefined;
    for (const rec of draft.table.records) {
      const i = ri.get(String(rec[indices.get(row.id)!])), j = ci.get(String(rec[indices.get(col.id)!])); if (i == null || j == null) continue;
      const value = typeof rec[vi] === 'number' ? rec[vi] as number : null, period = ti == null ? p.currentMemberId : String(rec[ti]);
      (period === p.baseMemberId ? base : cur)[i]![j] = value;
    }
  }
  out.periods.current.values = cur;
  if (out.periods.base) out.periods.base.values = base;
  const group = field(draft.table, p.groupFieldId, 'dimension');
  if (group) {
    const gi = indices.get(group.id)!;
    const labels = new Map(group.members.map((x) => [x.id, x.label]));
    out.groups = out.rows.map((_, i) => { const rec = draft.table.records.find((x) => ri.get(String(x[indices.get(row.id)!])) === i); return rec ? labels.get(String(rec[gi])) ?? null : null; });
  }
  return out;
}

const versionId = (key: string) => `dataset-version:${key}`;
const viewWithoutData = (slide: SlideState): SlideView => {
  const { id: _id, title: _title, dataRef: _dataRef, longPivot: _longPivot, ...view } = slide;
  void _id; void _title; void _dataRef; void _longPivot;
  return structuredClone(view);
};

export function projectToCanonical(project: ProjectState, updatedAt = '1970-01-01T00:00:00.000Z'): CanonicalProjectDraft {
  const raw = new Map<string, { dataset: Dataset; family: DataFamily; label: string; source: string }>();
  raw.set('@table', { dataset: project.dataset, family: 'table', label: 'table', source: project.source });
  for (const family of ['bridge', 'relation'] as const) if (project.datasets?.[family]) raw.set(`@${family}`, { dataset: project.datasets[family]!, family, label: family, source: project.source });
  for (const [id, x] of Object.entries(project.extra ?? {})) raw.set(id, { dataset: x.dataset, family: x.family, label: x.label, source: x.source });

  const datasetVersions: Record<string, CanonicalDatasetDraft> = {}, slots: Record<string, DatasetSlot> = {};
  for (const [key, x] of raw) {
    const slides = project.slides.filter((s) => dataKey(project, s) === key);
    const id = versionId(key), twoMetric = slides.some((s) => isTwoMetricChart(s.chart));
    datasetVersions[id] = datasetToCanonical(x.dataset, { twoMetric });
    slots[id] = { key, family: x.family, label: x.label, source: x.source };
  }
  const slides: SlideRecord[] = project.slides.map((slide) => {
    const key = dataKey(project, slide), id = versionId(key), draft = datasetVersions[id]!;
    return {
      id: slide.id, view: viewWithoutData(slide),
      data: slide.view ? [] : [{ datasetVersionId: id, pivot: { ...draft.projection, ...(slide.longPivot ? { long: structuredClone(slide.longPivot) } : {}) } }],
      texts: slide.title ? { message: { text: slide.title, author: 'user', updatedAt } } : {},
    };
  });
  return {
    content: { schemaVersion: 1, slideLocale: project.slideLocale, slides }, datasetVersions,
    editor: {
      current: project.current, ...(project.recommendation ? { recommendation: structuredClone(project.recommendation) } : {}),
      ...(project.origin ? { origin: structuredClone(project.origin) } : {}), ...(project.tone ? { tone: project.tone } : {}), slots,
    },
  };
}

export function projectFromCanonical(draft: CanonicalProjectDraft): ProjectState {
  const byKey = new Map<string, { dataset: Dataset; slot: DatasetSlot }>();
  for (const [id, value] of Object.entries(draft.datasetVersions)) { const slot = draft.editor.slots[id]; if (slot) byKey.set(slot.key, { dataset: datasetFromCanonical(value), slot }); }
  const table = byKey.get('@table');
  if (!table) throw new Error('canonical project requires @table data');
  const datasets: ProjectState['datasets'] = {};
  for (const family of ['bridge', 'relation'] as const) { const x = byKey.get(`@${family}`); if (x) datasets[family] = x.dataset as ProjectState['dataset']; }
  const extra: NonNullable<ProjectState['extra']> = {};
  for (const [key, x] of byKey) if (!key.startsWith('@')) extra[key] = { label: x.slot.label, family: x.slot.family, dataset: x.dataset as ProjectState['dataset'], source: x.slot.source };
  const slides: SlideState[] = draft.content.slides.map((s) => {
    const ref = s.data[0]?.datasetVersionId ? draft.editor.slots[s.data[0].datasetVersionId]?.key : null;
    return { id: s.id, title: s.texts.message?.text ?? '', ...structuredClone(s.view), ...(ref && !ref.startsWith('@') ? { dataRef: ref } : {}), ...(s.data[0]?.pivot.long ? { longPivot: structuredClone(s.data[0].pivot.long) } : {}) };
  });
  return {
    version: 3, dataset: table.dataset as ProjectState['dataset'], source: table.slot.source, slideLocale: draft.content.slideLocale, slides, current: draft.editor.current,
    ...(Object.keys(datasets).length ? { datasets } : {}), ...(Object.keys(extra).length ? { extra } : {}),
    ...(draft.editor.recommendation ? { recommendation: structuredClone(draft.editor.recommendation) } : {}),
    ...(draft.editor.origin ? { origin: structuredClone(draft.editor.origin) } : {}), ...(draft.editor.tone ? { tone: draft.editor.tone } : {}),
  };
}
