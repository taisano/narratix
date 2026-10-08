import { describe, expect, it } from 'vitest';
import seed from '../../../supabase/seed/library_items.v3.json';
import { initialProject } from '@/features/editor/project';
import { convertTemplateSeed, projectFromTemplate, projectToTemplate, type LegacyTemplateSeed } from './template';

describe('テンプレートの新しい保存形式', () => {
  it('プロジェクトを自己完結したdeckとデータへ分けて戻せる', () => {
    const project = initialProject();
    const payload = projectToTemplate(project, '2026-10-03T00:00:00.000Z');
    expect(payload.deckContent.slides[0]!.texts.message?.author).toBe('template');
    expect(payload.datasetContents[0]!.slot.sourceMeta?.kind).toBe('sample');
    const restored = projectFromTemplate(payload.deckContent, payload.datasetContents);
    expect(restored.dataset).toEqual(project.dataset);
    expect(restored.slides[0]).toMatchObject({ title: project.slides[0]!.title, titleMeta: { author: 'template' } });
  });

  it('全スライド共通のフォント・配色も、テンプレート経由で残る', () => {
    const project = { ...initialProject(), design: { font: 'modern' as const, palette: 'deep_ocean_teal' as const } };
    const payload = projectToTemplate(project, '2026-10-03T00:00:00.000Z');
    const restored = projectFromTemplate(payload.deckContent, payload.datasetContents);
    expect(restored.design).toEqual({ font: 'modern', palette: 'deep_ocean_teal' });
  });

  it('書き出した31件を変換し、旧作成者を持ち込まず、2件の混入した期間名だけ直す', () => {
    const rows = convertTemplateSeed(seed as LegacyTemplateSeed[]);
    expect(rows).toHaveLength(31);
    expect(rows.every((x) => x.published)).toBe(true);
    expect(rows.every((x) => !('created_by' in x))).toBe(true);
    expect(rows.every((x) => x.dataset_contents.every((d) => d.slot.sourceMeta?.kind === 'sample'))).toBe(true);
    for (const title of ['宇宙事業の資料作成本数推移', 'Space Business Presentation']) {
      const row = rows.find((x) => x.title === title)!;
      const project = projectFromTemplate(row.deck_content, row.dataset_contents);
      expect(project.dataset.periods.current.label).toBe('');
      expect(project.dataset.periods.base?.label).toBe('');
    }
  });
});
