import { localize, registry, type ChartTypeId, type Locale, type LocalizedText } from '@/registry';
import { applyRecipe, resolveAutoControls } from '../editor/fromRecipe';
import { previewSvg } from '../editor/preview';
import { initialProject, viewOf } from '../editor/project';
import type { BuilderState } from '../editor/state';
import type { Proposal } from './coach';

/**
 * ② で見せるもの（docs/dish-matrix.md 8章）：
 * ・実際に描いた小さなプレビュー（見本データで、付け合わせ・補完パーツ込み）
 * ・「変わること」の1行（チャート・構成・付け合わせ・補足）
 */

const L = (ja: string, en: string): LocalizedText => ({ ja, en });

/** 案を、見本データのエディタの状態にする（プレビュー用。保存はしない） */
export function proposalState(p: Proposal, locale: Locale): BuilderState {
  const r = registry.recipes[p.recipe];
  const s = applyRecipe(viewOf(initialProject(locale), 0), r, p.complements ?? []);
  return resolveAutoControls({ ...s, controls: { ...s.controls, ...(p.controls ?? {}) }, recipe: r.id, title: localize(r.question, locale), slideLocale: locale });
}

const cache = new Map<string, string | null>();
/** 案のプレビュー（SVG）。同じ案は作り直さない */
export function proposalSvg(p: Proposal, locale: Locale): string | null {
  const key = `${locale}:${JSON.stringify(p)}`;
  if (!cache.has(key)) {
    let svg: string | null = null;
    try { svg = previewSvg(proposalState(p, locale)); } catch { svg = null; }
    cache.set(key, svg);
  }
  return cache.get(key)!;
}

/** 付け合わせ（右・下のパネル）の呼び方 */
function sideLabel(panel: { kind: string; chart?: ChartTypeId; table?: string; controls?: Record<string, unknown>; align?: { axis: string }[] }): LocalizedText {
  const rowAligned = panel.align?.some((a) => a.axis === 'rows');
  if (panel.kind === 'chart' && panel.chart === 'variance_bar' && rowAligned) {
    const m = panel.controls?.side_measure;
    return m === 'cagr' ? L('伸び率（CAGR、左と同じ行）', 'Growth rate (CAGR, on the same rows)')
      : m === 'metric2' ? L('2つ目の指標（左と同じ行）', 'Second metric (on the same rows)')
        : L('前回からの増減（左と同じ行）', 'Change since last time (on the same rows)');
  }
  if (panel.kind === 'chart' && panel.chart === 'variance_bar') return L('項目別の増加額（差分バー）', 'Increase by part (difference bars)');
  if (panel.kind === 'table' && panel.table === 'cagr_table') return L('項目別の伸び率（CAGR の表）', 'Growth rate by part (CAGR table)');
  if (panel.kind === 'table' && panel.table === 'growth_table') return L('成長率の表', 'Growth table');
  if (panel.kind === 'table' && panel.table) return registry.tables[panel.table as keyof typeof registry.tables]?.label ?? L('表', 'Table');
  if (panel.chart) return registry.charts[panel.chart].label;
  return L('補助', 'Support');
}

/** 「変わること」：チャート・構成・付け合わせ・補足（選んだチャートから替えた時はそれも） */
export function changeParts(p: Proposal, chosenChart: ChartTypeId | null): { label: LocalizedText; value: LocalizedText }[] {
  const r = registry.recipes[p.recipe];
  const main = r.view.panels.find((x) => x.id === 'main')!;
  const sides = r.view.panels.filter((x) => x.id !== 'main');
  const chartLabel = registry.charts[main.chart!].label;
  const out: { label: LocalizedText; value: LocalizedText }[] = [];
  out.push({
    label: L('チャート', 'Chart'),
    value: chosenChart && chosenChart !== main.chart
      ? L(`${registry.charts[chosenChart].label.ja} → ${chartLabel.ja}`, `${registry.charts[chosenChart].label.en} → ${chartLabel.en}`)
      : chartLabel,
  });
  const ratio = p.controls?.side_ratio === 'half' ? 0.5 : p.controls?.side_ratio === 'two_thirds' ? 0.67 : r.view.layout.ratios?.[0] ?? 0.5;
  out.push({
    label: L('構成', 'Layout'),
    value: !sides.length ? L('チャート1つ', 'One chart')
      : ratio <= 0.5 ? L('左右（1/2 ずつ）', 'Side by side (half and half)')
        : L('左右（主役 2/3・付け合わせ 1/3）', 'Side by side (main 2/3, support 1/3)'),
  });
  if (sides.length) out.push({ label: L('付け合わせ', 'Support'), value: joinText(sides.map(sideLabel)) });
  const parts = [...(main.inChartComplements ?? []).map((c) => c.id), ...(p.complements ?? [])];
  const slope = p.controls?.slope_change;
  const extra: LocalizedText[] = [...new Set(parts)].map((c) => registry.complements[c].label);
  if (typeof slope === 'string' && slope !== 'none') {
    extra.push(slope === 'cagr' ? L('CAGR のラベル', 'CAGR labels') : slope === 'diff' ? L('増減のラベル', 'Change labels') : L('増減率のラベル', '% change labels'));
  }
  if (extra.length) out.push({ label: L('補足', 'Extras'), value: joinText(extra) });
  return out;
}

const joinText = (xs: LocalizedText[]): LocalizedText => ({ ja: xs.map((x) => x.ja).join('・'), en: xs.map((x) => x.en).join(', ') });
