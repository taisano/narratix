import type { Locale } from '@/registry';
import { normalizeProject, type ProjectState } from '@/features/editor/project';
import { normalizeTags, withLangTag } from '@/lib/tags';
import { projectFromCanonical, projectToCanonical, type CanonicalDatasetDraft, type CanonicalProjectDraft, type DeckContent, type DatasetSlot } from './canonical';
import { sourceMetaOf } from './source';

export interface TemplateDatasetContent extends CanonicalDatasetDraft {
  id: string;
  slot: DatasetSlot;
}

export interface TemplateDeckContent extends DeckContent {
  editor: CanonicalProjectDraft['editor'];
}

export interface TemplatePayload {
  deckContent: TemplateDeckContent;
  datasetContents: TemplateDatasetContent[];
}

/** テンプレートは文をtemplate、出典をsampleとして自己完結したJSONにする。 */
export function projectToTemplate(project: ProjectState, updatedAt = '1970-01-01T00:00:00.000Z'): TemplatePayload {
  const prepared = structuredClone(project);
  prepared.slides = prepared.slides.map((s) => ({ ...s, ...(s.title ? { titleMeta: { author: 'template' as const } } : {}) }));
  const sample = (source: string, meta: ProjectState['sourceMeta']) => sourceMetaOf(source, meta, prepared.slideLocale, true) ?? {
    kind: 'sample' as const, title: prepared.slideLocale === 'en' ? 'Template sample data' : 'テンプレートの見本データ', citationText: '',
  };
  prepared.sourceMeta = sample(prepared.source, prepared.sourceMeta);
  if (prepared.extra) for (const x of Object.values(prepared.extra)) x.sourceMeta = sample(x.source, x.sourceMeta);
  const canonical = projectToCanonical(prepared, updatedAt);
  return {
    deckContent: { ...canonical.content, editor: canonical.editor },
    datasetContents: Object.entries(canonical.datasetVersions).map(([id, draft]) => ({ id, ...draft, slot: canonical.editor.slots[id]! })),
  };
}

export function projectFromTemplate(deckContent: TemplateDeckContent, datasetContents: TemplateDatasetContent[]): ProjectState {
  const datasetVersions: Record<string, CanonicalDatasetDraft> = {};
  const slots: Record<string, DatasetSlot> = {};
  for (const { id, slot, ...draft } of datasetContents) { datasetVersions[id] = draft; slots[id] = slot; }
  return projectFromCanonical({
    content: { schemaVersion: 1, slideLocale: deckContent.slideLocale, slides: deckContent.slides, ...(deckContent.story ? { story: deckContent.story } : {}) },
    datasetVersions, editor: { ...deckContent.editor, slots },
  });
}

export interface LegacyTemplateSeed {
  id: string;
  title: string;
  description?: string;
  category?: string;
  project: unknown;
  published?: boolean;
  sort?: number;
  tags?: string[];
}

export interface TemplateImportRow {
  id: string;
  title: string;
  description: string;
  category: string;
  lang: Locale;
  user_tags: string[];
  deck_content: TemplateDeckContent;
  dataset_contents: TemplateDatasetContent[];
  published: boolean;
  sort: number;
}

const PERIOD_FIX = new Set(['宇宙事業の資料作成本数推移', 'Space Business Presentation']);

/** 書き出した旧Libraryを新templatesの行へ変換する。旧created_byは入力型にも含めない。 */
export function convertTemplateSeed(items: LegacyTemplateSeed[]): TemplateImportRow[] {
  return items.map((item) => {
    const project = normalizeProject(structuredClone(item.project));
    if (!project) throw new Error(`invalid template project: ${item.title}`);
    if (PERIOD_FIX.has(item.title)) {
      project.dataset.periods.current.label = '';
      if (project.dataset.periods.base) project.dataset.periods.base.label = '';
    }
    const payload = projectToTemplate(project);
    return {
      id: item.id, title: item.title, description: item.description ?? '', category: item.category ?? '', lang: project.slideLocale,
      user_tags: withLangTag(normalizeTags(item.tags ?? [], 20), project.slideLocale),
      deck_content: payload.deckContent, dataset_contents: payload.datasetContents,
      published: item.published !== false, sort: item.sort ?? 0,
    };
  });
}
