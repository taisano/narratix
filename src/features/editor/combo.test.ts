import { describe, expect, it } from 'vitest';
import { resolveComboSeries, isRateName } from '@/engine/layout/charts/combo-config';
import { comboScale } from '@/engine/layout/charts/combo';
import type { BoxItem, EllipseItem, LineItem, Scene, TextItem } from '@/engine/scene';
import { chartPalette } from '@/engine/theme';
import { expectPptxMatches } from '@/export/pptx/test-utils';
import { autoChartTitle } from './chartHeader';
import { switchChart } from './chartSwitch';
import { comboWarnings } from './ComboPanel';
import { evaluate } from './preview';
import { initialState, type BuilderState } from './state';

const combo = (loc: 'ja' | 'en' = 'ja') => switchChart(initialState(loc), 'combo').state;
const withC = (s: BuilderState, c: Record<string, unknown>, comp: Record<string, boolean> = {}): BuilderState =>
  ({ ...s, controls: { ...s.controls, ...c }, complements: { ...s.complements, ...comp } });
const scene = (s: BuilderState): Scene => evaluate(s).scene!;
const texts = (sc: Scene) => sc.items.filter((i): i is TextItem => i.kind === 'text').flatMap((i) => i.lines.map((l) => l.t));
const pal = chartPalette('default', 4);

describe('縦棒＋折れ線：系列の既定', () => {
  it('率の列は折れ線・右軸、それ以外は縦棒・左軸。並びは棒 → 線', () => {
    const r = resolveComboSeries(['粗利率', '売上実績', '売上予算', '営業利益率'], [], pal);
    expect(r.map((x) => [x.name, x.as, x.axis])).toEqual([
      ['売上実績', 'column', 'left'], ['売上予算', 'column', 'left'], ['粗利率', 'line', 'right'], ['営業利益率', 'line', 'right'],
    ]);
    expect(['Operating margin', 'Share', 'CTR %', '解約率'].every(isRateName)).toBe(true);
    expect(['Revenue', 'Sales', '顧客数'].some(isRateName)).toBe(false);
  });
  it('予算・目標は実績と同じ形・軸で淡い色。線の系列はマーカーの形も変える', () => {
    const r = resolveComboSeries(['売上実績', '売上予算', '粗利率', '営業利益率'], [], pal);
    expect(r[1]!.color).not.toBe(r[0]!.color);
    expect(r[2]!.marker).not.toBe(r[3]!.marker);
  });
  it('設定で種類・軸・順番・表示を変えられる。知らない名前の設定は無視', () => {
    const r = resolveComboSeries(['A', 'B', '率'], [{ name: '率', as: 'column', axis: 'left' }, { name: 'X' }, { name: 'A', as: 'line', hidden: true }], pal);
    expect(r.map((x) => [x.name, x.as, x.axis, x.hidden])).toEqual([['率', 'column', 'left', false], ['A', 'line', 'left', true], ['B', 'column', 'left', false]]);
  });
});

describe('描画', () => {
  it('2本以上の棒と2本以上の線を同時に描き、線は棒より前、凡例は系列の順', async () => {
    const sc = scene(combo());
    const boxes = sc.items.filter((i): i is BoxItem => i.kind === 'box' && i.h > 0.05);
    expect(boxes.length).toBeGreaterThanOrEqual(8);
    const firstLine = sc.items.findIndex((i) => i.kind === 'line' && (i as LineItem).width === 2);
    const lastBar = sc.items.map((i, k) => (i.kind === 'box' && (i as BoxItem).h > 0.05 ? k : -1)).filter((k) => k >= 0).pop()!;
    expect(firstLine).toBeGreaterThan(lastBar);
    const t = texts(sc);
    expect(t.indexOf('売上実績')).toBeLessThan(t.indexOf('粗利率'));
    // 右軸は %、線の最新値ラベル（系列名＋値）
    expect(t).toContain('40%');
    expect(t).toContain('営業利益率 17%');
    await expectPptxMatches(sc);
  });
  it('線種とマーカー：破線・点線、四角・ひし形も PPT と一致', async () => {
    const s = withC(combo(), { combo_series: [{ name: '粗利率', line: 'dot', marker: 'square' }, { name: '営業利益率', line: 'dash', marker: 'diamond' }] });
    const sc = scene(s);
    expect(sc.items.some((i) => i.kind === 'line' && (i as LineItem).dash === 'dot')).toBe(true);
    expect(sc.items.some((i) => i.kind === 'ellipse' && (i as EllipseItem).shape === 'diamond')).toBe(true);
    await expectPptxMatches(sc);
  });
  it('積み上げと合計ラベル', async () => {
    const sc = scene(withC(combo(), { combo_bar_mode: 'stacked' }, { total_labels: true }));
    expect(texts(sc)).toContain('165');
    await expectPptxMatches(sc);
  });
  it('非表示にした系列は描かず、元のデータは残す', () => {
    const s = withC(combo(), { combo_series: [{ name: '売上予算', hidden: true }] });
    expect(texts(scene(s))).not.toContain('売上予算');
    expect(s.dataset.cols).toContain('売上予算');
  });
  it('開始から終了までの変化：率はポイント差、量は増減と増減率', () => {
    const t = texts(scene(withC(combo(), {}, { series_change: true }))).join(' ');
    expect(t).toMatch(/営業利益率 12% → 17%（\+5pt）/);
    expect(t).toMatch(/売上実績 80 → 125（\+45、\+56\.3%）/);
  });
  it('参照線（右軸の目標）', () => {
    const t = texts(scene(withC(combo(), { ref_value: '15', ref_label: '目標', ref_axis: 'right' }, { reference_line: true })));
    expect(t).toContain('目標 15%');
  });
  it('軸の最小・最大と「0から始めない」', () => {
    const s = comboScale([30, 40], { min: null, max: null, zero: false });
    expect(s.min).toBeGreaterThan(0);
    const m = comboScale([30, 40], { min: 10, max: 50, zero: true });
    expect([m.min, m.max]).toEqual([10, 50]);
  });
  it('英語でも同じ設定で描ける', async () => {
    const sc = scene(combo('en'));
    expect(texts(sc)).toContain('Operating margin 17%');
    await expectPptxMatches(sc);
  });
});

describe('注意とタイトル', () => {
  it('棒だけ・線だけ、同じ軸に率と金額、系列の多さ、軸の範囲の手入力', () => {
    const s = combo();
    const r = (x: BuilderState) => comboWarnings(x, resolveComboSeries(x.dataset.cols, x.controls.combo_series as never, pal)).map((w) => w.key);
    expect(r(s)).toEqual([]);
    expect(r(withC(s, { combo_series: [{ name: '粗利率', as: 'column' }, { name: '営業利益率', as: 'column' }] }))).toContain('combo.warn.noLines');
    expect(r(withC(s, { combo_series: [{ name: '粗利率', axis: 'left' }] }))).toContain('combo.warn.mixedAxis');
    expect(r(withC(s, { combo_left_max: '200' }))).toContain('combo.warn.axisRange');
  });
  it('見本は量と率の列。初期のチャートタイトルは主な棒と主な線', () => {
    const s = combo();
    expect(s.dataset.cols).toEqual(['売上実績', '売上予算', '粗利率', '営業利益率']);
    expect(autoChartTitle(s)).toBe('売上実績と粗利率の推移');
    // ほかのチャートへ出ると、推移の見本に戻る
    expect(switchChart(s, 'line').state.dataset.cols).not.toContain('粗利率');
  });
});
