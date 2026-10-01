import { composeSlide, type Scene } from '@/engine';
import type { MessageKey } from '@/i18n/ui';
import { sceneToSvg } from '@/render/svg/scene-to-svg';
import { toDataset, validateState, type BuilderState } from './state';
import { composeTemplate } from '@/engine/layout/templates';
import { comparisonChecks, conclusionChecks, deltaChecks, execChecks, heatChecks, iiaChecks, kpiChecks, nextChecks, numbersChecks, basicChecks, twoColChecks, bulletsChecks } from '../templates/checks';
import { isSampleSource } from './leftovers';
import { defaultComparisonLook, defaultConclusionLook, defaultDeltaLook, defaultHeatLook, defaultExecLook, defaultIiaLook, emptyIia, defaultNumbersLook, emptyNumbers, defaultNextLook, emptyNext, defaultBasicLook, defaultTwoColLook, emptyTwoCol, defaultBulletsLook, emptyBullets, sampleDelta, defaultKpiLook, emptyConclusion, emptyExec, sampleComparison, sampleKpi } from '../templates/content';

export type Evaluation = {
  scene?: Scene;
  warnings: { key: MessageKey; vars?: Record<string, string | number> }[];
  error?: string;
};

/** 画面の状態 → ViewSpec → 検証 → 配置。エディタのプレビューとマイページの縮小表示で共有 */
export function evaluate(s: BuilderState): Evaluation {
  if (s.view) return evaluateTemplate(s);
  const v = validateState(s);
  const warnings: Evaluation['warnings'] = [];
  if (v.issues.some((i) => i.code === 'requires_base')) warnings.push({ key: 'warn.requires_base' });
  if (!v.ok) return { warnings, error: v.issues.filter((i) => i.severity === 'error').map((i) => i.message).join(' / ') };
  try {
    const scene = composeSlide(v.spec, toDataset(s));
    for (const w of scene.warnings) warnings.push({ key: `warn.${w.code}` as MessageKey, vars: w.params });
    return { scene, warnings };
  } catch (e) {
    return { warnings, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 縮小表示用の SVG（描けなければ null） */
export function previewSvg(s: BuilderState): string | null {
  const r = evaluate(s);
  return r.scene && !r.warnings.some((w) => w.key === 'warn.no_data') ? sceneToSvg(r.scene, { title: s.title }) : null;
}

/**
 * 表・言葉の型のスライド：中身と見せ方から描き、規則の確認を注意として添える（出力は止めない）。
 * 中身がまだ無ければ空（型を選んだ時に作るので、普通は無いことはない）
 */
function evaluateTemplate(s: BuilderState): Evaluation {
  const id = s.view!;
  const nOf = new Map((s.others ?? []).map((o) => [o.id, o.n]));
  const warnings: Evaluation['warnings'] = [];
  // 見本の出典は出さない（見本の文言を PPT に出さない）
  const source = isSampleSource(s.source) ? '' : s.source;
  try {
    if (id === 'STORY_TABLE_COMPARISON') {
      const content = s.content?.comparison ?? sampleComparison(s.slideLocale);
      const look = s.look?.comparison ?? defaultComparisonLook();
      const scene = composeTemplate({ id, title: s.title, source, locale: s.slideLocale, comparison: { content, look } });
      warnings.push(...comparisonChecks(content, look, s.source));
      if (scene.notes.includes('dense')) warnings.push({ key: 'tpl.warn.dense' });
      return { scene, warnings };
    }
    if (id === 'STORY_TABLE_HEATMAP') {
      const content = s.content?.comparison ?? sampleComparison(s.slideLocale);
      // 数の形は比較表と共有（同じ表なので）
      const tableLook = s.look?.comparison ?? defaultComparisonLook();
      const look = { ...(s.look?.heatmap ?? defaultHeatLook(tableLook)), formatAxis: tableLook.formatAxis, formats: tableLook.formats };
      const scene = composeTemplate({ id, title: s.title, source, locale: s.slideLocale, heatmap: { content, look } });
      warnings.push(...heatChecks(content, look, s.source));
      if (scene.notes.includes('dense')) warnings.push({ key: 'tpl.warn.dense' });
      return { scene, warnings };
    }
    if (id === 'STORY_TABLE_KPI') {
      const content = s.content?.kpi ?? sampleKpi(s.slideLocale);
      const look = s.look?.kpi ?? defaultKpiLook();
      const scene = composeTemplate({ id, title: s.title, source, locale: s.slideLocale, kpi: { content, look } });
      warnings.push(...kpiChecks(content, look));
      if (scene.notes.includes('dense')) warnings.push({ key: 'tpl.warn.dense' });
      return { scene, warnings };
    }
    if (id === 'STORY_TABLE_BASIC') {
      const content = s.content?.comparison ?? sampleComparison(s.slideLocale);
      // 数の形は比較表と共有（同じ表なので）
      const tableLook = s.look?.comparison ?? defaultComparisonLook();
      const look = { ...(s.look?.basic ?? defaultBasicLook(tableLook)), formatAxis: tableLook.formatAxis, formats: tableLook.formats };
      const scene = composeTemplate({ id, title: s.title, source, locale: s.slideLocale, basic: { content, look } });
      warnings.push(...basicChecks(content, look, s.source));
      if (scene.notes.includes('dense')) warnings.push({ key: 'tpl.warn.dense' });
      return { scene, warnings };
    }
    if (id === 'STORY_TEXT_TWO_COLUMN') {
      const content = s.content?.twoCol ?? emptyTwoCol();
      const look = s.look?.twoCol ?? defaultTwoColLook();
      const scene = composeTemplate({ id, title: s.title, source, locale: s.slideLocale, twoCol: { content, look }, slideNumber: (ref) => nOf.get(ref) ?? null });
      warnings.push(...twoColChecks(s.title, content, (ref) => !s.others || nOf.has(ref), s.slideLocale));
      if (scene.notes.includes('dense')) warnings.push({ key: 'tpl.warn.dense' });
      return { scene, warnings };
    }
    if (id === 'STORY_TEXT_BULLETS') {
      const content = s.content?.bullets ?? emptyBullets();
      const look = s.look?.bullets ?? defaultBulletsLook();
      const scene = composeTemplate({ id, title: s.title, source, locale: s.slideLocale, bullets: { content, look }, slideNumber: (ref) => nOf.get(ref) ?? null });
      warnings.push(...bulletsChecks(s.title, content, (ref) => !s.others || nOf.has(ref)));
      if (scene.notes.includes('dense')) warnings.push({ key: 'tpl.warn.dense' });
      return { scene, warnings };
    }
    if (id === 'STORY_TEXT_NEXT_ACTIONS') {
      const content = s.content?.next ?? emptyNext();
      const look = s.look?.next ?? defaultNextLook();
      const scene = composeTemplate({ id, title: s.title, source, locale: s.slideLocale, next: { content, look } });
      warnings.push(...nextChecks(s.title, content, look));
      if (scene.notes.includes('dense')) warnings.push({ key: 'tpl.warn.dense' });
      return { scene, warnings };
    }
    if (id === 'STORY_TEXT_NUMBERS') {
      const content = s.content?.numbers ?? emptyNumbers();
      const look = s.look?.numbers ?? defaultNumbersLook();
      const scene = composeTemplate({ id, title: s.title, source, locale: s.slideLocale, numbers: { content, look }, slideNumber: (ref) => nOf.get(ref) ?? null });
      warnings.push(...numbersChecks(s.title, content, (ref) => !s.others || nOf.has(ref)));
      if (scene.notes.includes('dense')) warnings.push({ key: 'tpl.warn.dense' });
      return { scene, warnings };
    }
    if (id === 'STORY_TEXT_ISSUE_INSIGHT_ACTION') {
      const content = s.content?.iia ?? emptyIia();
      const look = s.look?.iia ?? defaultIiaLook();
      const scene = composeTemplate({ id, title: s.title, source, locale: s.slideLocale, iia: { content, look }, slideNumber: (ref) => nOf.get(ref) ?? null });
      warnings.push(...iiaChecks(s.title, content, (ref) => !s.others || nOf.has(ref), s.slideLocale));
      if (scene.notes.includes('dense')) warnings.push({ key: 'tpl.warn.dense' });
      return { scene, warnings };
    }
    if (id === 'STORY_TABLE_DELTA') {
      const content = s.content?.delta ?? sampleDelta(s.slideLocale);
      const look = s.look?.delta ?? defaultDeltaLook();
      const scene = composeTemplate({ id, title: s.title, source, locale: s.slideLocale, delta: { content, look } });
      warnings.push(...deltaChecks(content, look, s.source));
      if (scene.notes.includes('dense')) warnings.push({ key: 'tpl.warn.dense' });
      return { scene, warnings };
    }
    if (id === 'STORY_TEXT_EXECUTIVE_SUMMARY') {
      const content = s.content?.exec ?? emptyExec();
      const look = s.look?.exec ?? defaultExecLook();
      const scene = composeTemplate({ id, title: s.title, source, locale: s.slideLocale, exec: { content, look }, slideNumber: (ref) => nOf.get(ref) ?? null });
      warnings.push(...execChecks(s.title, content, (ref) => !s.others || nOf.has(ref), s.slideLocale));
      if (scene.notes.includes('dense')) warnings.push({ key: 'tpl.warn.dense' });
      return { scene, warnings };
    }
    const content = s.content?.conclusion ?? emptyConclusion();
    const look = s.look?.conclusion ?? defaultConclusionLook();
    const scene = composeTemplate({ id, title: s.title, source, locale: s.slideLocale, conclusion: { content, look }, slideNumber: (ref) => nOf.get(ref) ?? null });
    // 参照先：プロジェクトから描く時だけ確かめる（others が無い＝単独で描いている）
    warnings.push(...conclusionChecks(s.title, content, (ref) => !s.others || nOf.has(ref)));
    if (scene.notes.includes('dense')) warnings.push({ key: 'tpl.warn.dense' });
    return { scene, warnings };
  } catch (e) {
    return { warnings, error: e instanceof Error ? e.message : String(e) };
  }
}
