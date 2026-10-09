import { EXEC_SUMMARY_ROLE, STORY_TEMPLATES, localize, routeDef, type Locale, type OutlineRoleKind, type ProofNeedId, type RecipeId, type StoryRouteId, type StoryTemplateId } from '@/registry';
import type { ComparisonContent, ComparisonLook, Kpi, KpiContent, TemplateContent, TemplateLook } from '@/engine/layout/templates';
import { defaultComparisonLook, emptyKpi } from '../templates/content';
import { emptySlide, type StorySlide } from './model';
import { questionOf, referenceRecipesFor } from './questionMap';

/**
 * 相談文に書かれたスライドの並び（「最初に Executive Summary、KPI スコアカード、推移グラフ、比較表…」）を読む。
 * 見せ方の名前が2つ以上あれば、その順でストーリーを組む（AIMED の地図より、ユーザーの指定を優先する）。
 * 規則で読む（AI は使わない）。数字（「会員数は12万人で計画10万人」など）は KPI の下書きに、選択肢と比較項目は比較表の見出しに入れる
 */

export type OutlineKind = StoryTemplateId | 'GRAPH_TREND';

/** 見せ方の名前（言い換えも）。上から順に探し、見つけた所は塗りつぶす（「課題→示唆→アクション」の「アクション」を次のアクションと読まない） */
const PATTERNS: [OutlineKind, RegExp][] = [
  ['STORY_TEXT_EXECUTIVE_SUMMARY', /executive\s*summary|エグゼクティブ・?サマリー?|サマリー(?:スライド)?/gi],
  ['STORY_TEXT_ISSUE_INSIGHT_ACTION', /課題\s*(?:と|→|->|、|・)\s*示唆(?:\s*(?:と|→|->|、|・)\s*(?:アクション|打ち手))?|issues?\s*(?:and|→|->|,)\s*insights?/gi],
  ['STORY_TEXT_NEXT_ACTIONS', /(?:次の|ネクスト|今後の)\s*アクション|アクションプラン|next\s*(?:steps?|actions?)|action\s*plan/gi],
  ['STORY_TABLE_KPI', /kpi\s*(?:スコアカード|scorecard|カード|一覧)?|スコアカード|scorecard/gi],
  ['STORY_TABLE_HEATMAP', /ヒートマップ|heat\s*map/gi],
  ['STORY_TABLE_DELTA', /増減(?:付き)?の?表|差異表|変化の表/gi],
  ['STORY_TABLE_COMPARISON', /比較表|比較の表|comparison\s*table/gi],
  ['STORY_TABLE_BASIC', /基本表|一覧表/gi],
  ['STORY_TEXT_TWO_COLUMN', /2\s*カラム|二つを並べ|before\s*\/?\s*after|ビフォー.?アフター|two[-\s]column/gi],
  ['STORY_TEXT_BULLETS', /箇条書き|bullet\s*points?/gi],
  ['STORY_TEXT_NUMBERS', /数字\s*[＋+と]\s*(?:短い)?説明|big\s*numbers?/gi],
  ['STORY_TEXT_CONCLUSION_REASONS', /結論\s*[＋+と]\s*(?:3つの)?根拠/gi],
  ['GRAPH_TREND', /推移(?:の)?(?:グラフ|チャート)|トレンド(?:グラフ)?|trend\s*(?:chart|graph)/gi],
];

/** 相談文に並べた見せ方（現れた順。同じものは最初の1回）。2つ未満なら null（並びの指定とは読まない） */
export function readOutline(text: string): OutlineKind[] | null {
  let rest = text;
  const found: { kind: OutlineKind; at: number }[] = [];
  for (const [kind, re] of PATTERNS) {
    rest = rest.replace(re, (m: string, ...args: unknown[]) => {
      const at = args.find((a) => typeof a === 'number') as number;
      found.push({ kind, at });
      return '\u0000'.repeat(m.length);
    });
  }
  const seen = new Set<OutlineKind>();
  const out = found.sort((a, b) => a.at - b.at).map((f) => f.kind).filter((k) => (seen.has(k) ? false : (seen.add(k), true)));
  return out.length >= 2 ? out : null;
}

/** 見せ方 → Route内の役割位置。具体的な役割IDはレジストリから読む */
const ROLE_SLOT: Record<OutlineKind, 'EXEC' | 'FIRST' | 'SECOND' | 'THIRD' | 'LAST'> = {
  STORY_TEXT_EXECUTIVE_SUMMARY: 'EXEC',
  STORY_TABLE_KPI: 'FIRST', STORY_TEXT_NUMBERS: 'FIRST', GRAPH_TREND: 'FIRST',
  STORY_TABLE_DELTA: 'SECOND', STORY_TABLE_HEATMAP: 'SECOND', STORY_TEXT_ISSUE_INSIGHT_ACTION: 'SECOND',
  STORY_TABLE_BASIC: 'THIRD', STORY_TEXT_TWO_COLUMN: 'THIRD', STORY_TEXT_BULLETS: 'THIRD',
  STORY_TABLE_COMPARISON: 'LAST', STORY_TEXT_CONCLUSION_REASONS: 'LAST', STORY_TEXT_NEXT_ACTIONS: 'LAST',
};

const outlineRole = (kind: OutlineKind, route: StoryRouteId): string => {
  const slot = ROLE_SLOT[kind];
  if (slot === 'EXEC') return EXEC_SUMMARY_ROLE;
  const def = routeDef(route);
  const roles = def.roles.filter((role) => !role.settingOnly);
  // Route固有の対応表（レジストリ）があればそれを使う。無いRoute（AIMED・Diagnosis）は役割の並び位置で決める
  const mapped = def.outlineRoles?.[kind as OutlineRoleKind];
  if (mapped) return mapped;
  const index = slot === 'FIRST' ? 0 : slot === 'SECOND' ? 1 : slot === 'THIRD' ? 2 : roles.length - 1;
  return roles[index]?.id ?? roles[0]?.id ?? '';
};

// ──────────── 数字の読み取り（KPI の下書き） ────────────

const NUM = '([+-]?\\d[\\d,]*(?:\\.\\d+)?)\\s*(万人|千人|人|億円|万円|千円|円|%|％|pt|件|倍|社|店舗?|回)?';
const BASIS = '(計画|目標|前年同期|前年|昨年|前期|前月|予算)';
/** 「〇〇は 12万人 で 計画 10万人」「〇〇は 8.4億円（計画 7.5億円）」 */
const KPI_RE = new RegExp(`([^、。,，\\s（(）)]{1,24}?)(?:は|が|：|:)\\s*${NUM}\\s*(?:で|と|、)?\\s*[（(]?\\s*${BASIS}(?:は|の|比)?\\s*${NUM}`, 'g');
/** 小さいほど良い指標（コスト・単価・件数・解約など） */
const DOWN = /単価|コスト|費用|CPA|件数|解約|離脱|チャーン|churn|cost|返品|クレーム|問い合わせ|遅延|不良/i;

export function readKpis(text: string): Kpi[] {
  const out: Kpi[] = [];
  for (const m of text.matchAll(KPI_RE)) {
    let name = m[1]!.trim();
    // 「2025年の会員数」→ 期間「2025年」と指標名「会員数」
    const pm = /^(\d{4}\s*年(?:度)?)の?(.+)$/.exec(name);
    const period = pm ? pm[1]!.replace(/\s/g, '') : '';
    if (pm) name = pm[2]!;
    name = name.replace(/^(?:また|一方で?|なお|さらに)/, '').trim();
    if (!name || /^\d+$/.test(name)) continue;
    const pct = (u: string | undefined) => u === '%' || u === '％';
    const unit = pct(m[3]) ? '' : m[3] ?? '';
    const v = (n: string, u: string | undefined) => (pct(u) ? `${n}%` : n);
    out.push(emptyKpi({
      name, period, value: v(m[2]!, m[3]), compare: v(m[5]!, m[6] ?? m[3]), unit, basis: m[4]!,
      good: DOWN.test(name) ? 'down' : 'up',
    }));
    if (out.length >= 8) break;
  }
  // 「2025年の会員数は…、関連売上は…」：期間は、書いていない後ろの指標にも引き継ぐ
  let last = '';
  return out.map((k) => { if (k.period) last = k.period; return k.period || !last ? k : { ...k, period: last }; });
}

// ──────────── 選択肢と比較項目（比較表の下書き） ────────────

/** 「A：ネイティブアプリへ大型投資、B：…、C：…」 */
export function readOptions(text: string): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  for (const m of text.matchAll(/(?:^|[、。，,\s（(「])([A-E])\s*[：:）)]\s*([^、。，,\n]{1,30})/g)) {
    if (!out.some((o) => o.id === m[1])) out.push({ id: m[1]!, label: m[2]!.replace(/(?:の)?3つ$|の(?:案|選択肢)$/, '').trim() });
  }
  return out.length >= 2 ? out : [];
}

/** 「投資額、立ち上がり速度、顧客リーチ、データ活用、運用難易度を比較」 */
export function readCriteria(text: string): string[] {
  const m = /((?:[^、。，,\n]{1,14}[、，,]\s*){1,7}[^、。，,\n]{1,14})\s*(?:を|で)(?:比較|比べ|評価)/.exec(text);
  if (!m) return [];
  return m[1]!.split(/[、，,]/).map((x) => x.trim()).filter(Boolean).slice(0, 8);
}

/** 推している案（「私はC案を推したい」） */
const pickedOption = (text: string) => /([A-E])\s*案を(?:推|勧|すす|選|提案)/.exec(text)?.[1] ?? null;

function comparisonSeed(text: string, locale: Locale): { content: ComparisonContent; look?: Partial<ComparisonLook> } | null {
  const opts = readOptions(text);
  const crit = readCriteria(text);
  if (!opts.length && !crit.length) return null;
  const ja = locale === 'ja';
  const heads = opts.length ? opts.map((o) => `${o.id}：${o.label}`) : [ja ? '候補A' : 'Option A', ja ? '候補B' : 'Option B'];
  const rows = (crit.length ? crit : [ja ? '比較項目' : 'Criterion']).map((c) => [c, ...heads.map(() => '')]);
  const pick = pickedOption(text);
  const col = pick ? opts.findIndex((o) => o.id === pick) + 1 : 0;
  return {
    content: { cells: [[ja ? '比較項目' : 'Criteria', ...heads], ...rows], headerRow: true, headerCol: true, lead: '', note: '', fromConsultation: true },
    ...(col > 0 ? { look: { ...defaultComparisonLook(), emphasis: { kind: 'col', index: col } } } : {}),
  };
}

/** 相談文の並びから、問い（スライド）を組む */
export function outlineQuestionMap(text: string, outline: OutlineKind[], locale: Locale, route: StoryRouteId = 'AIMED'): StorySlide[] {
  const kpis = readKpis(text);
  const slides = outline.map((kind) => {
    const role = outlineRole(kind, route);
    if (kind === 'GRAPH_TREND') {
      const needs: ProofNeedId[] = ['OVERALL_CHANGE'];
      const recipes: RecipeId[] = referenceRecipesFor(needs);
      return emptySlide({ routeRole: role, questionPriority: 'REQUIRED', presentationMode: 'GRAPH', question: questionOf(needs, locale), proofNeeds: needs, referenceRecipes: recipes });
    }
    const def = STORY_TEMPLATES[kind];
    let seed: { content: TemplateContent; look?: TemplateLook } | undefined;
    if (kind === 'STORY_TABLE_KPI' && kpis.length) seed = { content: { kpi: { kpis, note: '', fromConsultation: true } as KpiContent } };
    if (kind === 'STORY_TABLE_COMPARISON' || kind === 'STORY_TABLE_BASIC' || kind === 'STORY_TABLE_HEATMAP') {
      const c = comparisonSeed(text, locale);
      if (c) seed = { content: { comparison: c.content }, ...(c.look && kind === 'STORY_TABLE_COMPARISON' ? { look: { comparison: c.look as ComparisonLook } } : {}) };
    }
    return emptySlide({
      routeRole: role, questionPriority: kind === 'STORY_TEXT_EXECUTIVE_SUMMARY' ? 'SUPPORTING' : 'REQUIRED',
      presentationMode: def.kind === 'table' ? 'TABLE' : 'TEXT',
      question: localize(def.question, locale), template: kind, ...(seed ? { seed } : {}),
    });
  });
  return slides.map((s, i) => ({ ...s, nextQuestion: slides[i + 1]?.question ?? '' }));
}
