import { registry, type Locale, type StoryTemplateId } from '@/registry';
import { slideText } from '@/i18n/slide';
import type { Scene, SceneItem } from '../../scene';
import { layoutFrame } from '../frame';
import { layoutComparison, templateArea } from './comparison';
import { layoutConclusion } from './conclusion';
import { layoutKpi } from './kpi';
import { layoutExec } from './exec';
import { layoutDelta } from './delta';
import { layoutIia } from './iia';
import { layoutHeatmap } from './heatmap';
import { layoutNumbers } from './numbers';
import { layoutNext } from './next';
import { layoutTwoCol } from './twocol';
import { layoutBullets } from './bullets';
import type { ComparisonContent, ComparisonLook, ConclusionContent, ConclusionLook, DeltaContent, DeltaLook, ExecContent, ExecLook, HeatLook, IiaContent, IiaLook, NumbersContent, NumbersLook, NextContent, NextLook, BasicLook, TwoColContent, TwoColLook, BulletsContent, BulletsLook, KpiContent, KpiLook } from './types';

export * from './types';
export { parseCell, formatCell, alignOf, isNumberCell } from './cells';
export { filledReasons } from './conclusion';
export { filledKpis, kpiDelta, deltaText, deltaColor } from './kpi';
export { filledBlocks, blockLabel, execFilled } from './exec';
export { filledDeltaRows, rowDelta, usesSecond } from './delta';
export { iiaFilled, colLabel } from './iia';
export { heatFills, heatColor, HEAT_PALETTES } from './heatmap';
export { filledNumbers } from './numbers';
export { filledActions } from './next';
export { twoColFilled } from './twocol';
export { filledBullets } from './bullets';

/** 表・言葉の型のスライドを描くのに要るもの */
export interface TemplateInput {
  id: StoryTemplateId;
  title: string;
  source: string;
  locale: Locale;
  comparison?: { content: ComparisonContent; look: ComparisonLook };
  conclusion?: { content: ConclusionContent; look: ConclusionLook };
  kpi?: { content: KpiContent; look: KpiLook };
  exec?: { content: ExecContent; look: ExecLook };
  delta?: { content: DeltaContent; look: DeltaLook };
  iia?: { content: IiaContent; look: IiaLook };
  heatmap?: { content: ComparisonContent; look: HeatLook };
  numbers?: { content: NumbersContent; look: NumbersLook };
  next?: { content: NextContent; look: NextLook };
  basic?: { content: ComparisonContent; look: BasicLook };
  twoCol?: { content: TwoColContent; look: TwoColLook };
  bullets?: { content: BulletsContent; look: BulletsLook };
  /** 参照するスライドの id → スライドの番号（無ければ削除された） */
  slideNumber?: (id: string) => number | null;
}

/** 配置の都合で出す注意（文字が最小でも入り切らない） */
export type TemplateLayoutNote = 'dense';

/**
 * 表・言葉の型のスライド1枚の配置。タイトル・出典の枠はチャートのスライドと同じ（位置・文字の大きさ）。
 * 何も入っていない欄は描かない（見本の文言を PPT に出さない）
 */
export function composeTemplate(t: TemplateInput): Scene & { notes: TemplateLayoutNote[] } {
  const F = registry.slideFrame;
  const showSource = t.id === 'STORY_TABLE_COMPARISON' ? t.comparison?.look.showSource !== false
    : t.id === 'STORY_TABLE_DELTA' ? t.delta?.look.showSource !== false
    : t.id === 'STORY_TABLE_HEATMAP' ? t.heatmap?.look.showSource !== false
    : t.id === 'STORY_TABLE_BASIC' ? t.basic?.look.showSource !== false : true;
  const frame = layoutFrame({ title: t.title, source: showSource ? t.source : '' });
  const area = templateArea();
  const notes: TemplateLayoutNote[] = [];
  const items: SceneItem[] = [frame.title];
  if (t.id === 'STORY_TABLE_COMPARISON' && t.comparison) {
    const r = layoutComparison(t.comparison.content, t.comparison.look, area);
    items.push(...r.items);
    if (r.dense) notes.push('dense');
  }
  if (t.id === 'STORY_TABLE_KPI' && t.kpi) {
    const r = layoutKpi(t.kpi.content, t.kpi.look, area, t.locale);
    items.push(...r.items);
    if (r.dense) notes.push('dense');
  }
  if (t.id === 'STORY_TEXT_NUMBERS' && t.numbers) {
    const r = layoutNumbers(t.numbers.content, t.numbers.look, area, t.locale, (id) => t.slideNumber?.(id) ?? null);
    items.push(...r.items);
    if (r.dense) notes.push('dense');
  }
  if (t.id === 'STORY_TABLE_BASIC' && t.basic) {
    const r = layoutComparison(t.basic.content, { ...t.basic.look, emphasis: { kind: 'none' } }, area);
    items.push(...r.items);
    if (r.dense) notes.push('dense');
  }
  if (t.id === 'STORY_TEXT_TWO_COLUMN' && t.twoCol) {
    const r = layoutTwoCol(t.twoCol.content, t.twoCol.look, area, t.locale, (id) => t.slideNumber?.(id) ?? null);
    items.push(...r.items);
    if (r.dense) notes.push('dense');
  }
  if (t.id === 'STORY_TEXT_BULLETS' && t.bullets) {
    const r = layoutBullets(t.bullets.content, t.bullets.look, area, t.locale, (id) => t.slideNumber?.(id) ?? null);
    items.push(...r.items);
    if (r.dense) notes.push('dense');
  }
  if (t.id === 'STORY_TEXT_NEXT_ACTIONS' && t.next) {
    const r = layoutNext(t.next.content, t.next.look, area, t.locale);
    items.push(...r.items);
    if (r.dense) notes.push('dense');
  }
  if (t.id === 'STORY_TABLE_HEATMAP' && t.heatmap) {
    const r = layoutHeatmap(t.heatmap.content, t.heatmap.look, area, t.locale);
    items.push(...r.items);
    if (r.dense) notes.push('dense');
  }
  if (t.id === 'STORY_TABLE_DELTA' && t.delta) {
    const r = layoutDelta(t.delta.content, t.delta.look, area, t.locale);
    items.push(...r.items);
    if (r.dense) notes.push('dense');
  }
  if (t.id === 'STORY_TEXT_ISSUE_INSIGHT_ACTION' && t.iia) {
    const r = layoutIia(t.iia.content, t.iia.look, area, t.locale, (id) => t.slideNumber?.(id) ?? null);
    items.push(...r.items);
    if (r.dense) notes.push('dense');
  }
  if (t.id === 'STORY_TEXT_EXECUTIVE_SUMMARY' && t.exec) {
    const r = layoutExec(t.exec.content, t.exec.look, area, t.locale, (id) => t.slideNumber?.(id) ?? null);
    items.push(...r.items);
    if (r.dense) notes.push('dense');
  }
  if (t.id === 'STORY_TEXT_CONCLUSION_REASONS' && t.conclusion) {
    const r = layoutConclusion(t.conclusion.content, t.conclusion.look, area, (ref) => {
      const n = t.slideNumber?.(ref);
      return n ? slideText(t.locale, 'refSlide', { n }) : null;
    });
    items.push(...r.items);
    if (r.dense) notes.push('dense');
  }
  if (frame.source.lines.some((l) => l.t.trim())) items.push(frame.source);
  return { width: F.width, height: F.height, items, warnings: [], notes };
}
