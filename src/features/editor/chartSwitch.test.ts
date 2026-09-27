import { describe, expect, it } from 'vitest';
import { CHART_TYPE_IDS, registry } from '@/registry';
import { IMPLEMENTED_CHARTS } from '@/engine/layout/compose';
import { switchChart } from './chartSwitch';
import { pasteTsv, replaceWithTable, setCell } from './edit';
import { hasBase, initialState, pairSample, type BuilderState } from './state';

const available = CHART_TYPE_IDS.filter((c) => IMPLEMENTED_CHARTS.includes(c));

/** 2指標スロープに自分のデータ（左右の指標とも）を入れた状態 */
function pairWithOwnData(): BuilderState {
  let s: BuilderState = { ...initialState(), chart: 'slope_pair', ...pairSample('en') };
  s = setCell(s, 'current', 0, 0, 999);
  s = setCell(s, 'base', 0, 0, 111);
  return { ...s, controls: { ...s.controls, total_label: 'Five markets shown', source_left: 'Source: JNTO', source_right: 'Source: JTA', highlights: [s.dataset.cols[0]!] } };
}

describe('CHART-011：2指標スロープからほかのチャートへ必ず切り替わる', () => {
  it('自分のデータのまま、すべてのチャートへ切り替わる（確認で止まらない）', () => {
    for (const chart of available.filter((c) => c !== 'slope_pair')) {
      const r = switchChart(pairWithOwnData(), chart);
      expect(r.state.chart, chart).toBe(chart);
    }
  });
  it('見本のままでも、すべてのチャートへ切り替わる', () => {
    const s: BuilderState = { ...initialState(), chart: 'slope_pair', ...pairSample('ja') };
    for (const chart of available.filter((c) => c !== 'slope_pair')) expect(switchChart(s, chart).state.chart).toBe(chart);
  });
  it('右の指標の表と、左右の指標名を外し、外した名前を返す（画面で「元に戻す」を出す）', () => {
    const s = pairWithOwnData();
    const r = switchChart(s, 'stacked_column');
    expect(r.removedPair).toBe(s.dataset.periods.base.label);
    expect(hasBase(r.state)).toBe(false);
    expect(r.state.dataset.periods.current.label).toBe('');
    expect(r.state.dataset.periods.base.label).toBe('');
    // 左の指標のデータは残す
    expect(r.state.dataset.periods.current.values[0]![0]).toBe(999);
  });
  it('右の指標が空でも、指標名は残さない（2期間のチャートのタブ名に出ないように）', () => {
    let s = pairWithOwnData();
    s = { ...s, dataset: { ...s.dataset, periods: { ...s.dataset.periods, base: { ...s.dataset.periods.base, values: s.dataset.rows.map(() => s.dataset.cols.map(() => null)) } } } };
    const r = switchChart(s, 'share_pair');
    expect(r.removedPair).toBeNull();
    expect(r.state.dataset.periods.current.label).toBe('');
    expect(r.state.dataset.periods.base.label).toBe('');
  });
});

describe('CHART-004：チャートだけの設定を、ほかのチャートへ持っていかない', () => {
  it('行き先で使わない文字の設定（合計の名前・左右の出典・軸の名前）は外す。共通の設定は残す', () => {
    const s: BuilderState = { ...initialState(), chart: 'bubble', controls: { x_title: 'Implementation Ease', y_title: 'Business Impact', number_format: 'k', palette: 'quiet_steel_blue' } };
    const r = switchChart(s, 'line').state;
    expect(r.controls.x_title).toBeUndefined();
    expect(r.controls.y_title).toBeUndefined();
    expect(r.controls.number_format).toBe('k');
    expect(r.controls.palette).toBe('quiet_steel_blue');
    // 同じ設定を使うチャート同士なら残す
    expect(switchChart(s, 'scatter').state.controls.x_title).toBe('Implementation Ease');
  });
  it('2指標スロープ → スロープでは合計の名前を残し、積み上げ縦棒では外す', () => {
    const s = pairWithOwnData();
    expect(registry.controls.total_label.appliesTo).toContain('slope');
    expect(switchChart(s, 'slope').state.controls.total_label).toBe('Five markets shown');
    const r = switchChart(s, 'stacked_column').state;
    expect(r.controls.total_label).toBeUndefined();
    expect(r.controls.source_left).toBeUndefined();
    expect(r.controls.source_right).toBeUndefined();
  });
  it('表の行の名前を全部貼り替えたら、前のデータの文字の設定を外す', () => {
    const s: BuilderState = { ...initialState(), controls: { total_label: 'Five markets shown', source_left: 'JNTO', number_format: 'k' } };
    const text = s.dataset.rows.map((_, i) => `Q${i + 1}\t1`).join('\n');
    const n = pasteTsv(s, 'current', 0, -1, text, { row: (k) => `r${k}`, col: (k) => `c${k}` });
    expect(n.controls.total_label).toBeUndefined();
    expect(n.controls.source_left).toBeUndefined();
    expect(n.controls.number_format).toBe('k');
    // 一部の行だけ直した時は残す
    const m = pasteTsv(s, 'current', 0, -1, 'Only one\t1', { row: (k) => `r${k}`, col: (k) => `c${k}` });
    expect(m.controls.total_label).toBe('Five markets shown');
  });
  it('形の違う表に貼り替えたら、前の期間（指標）の名前を残さない', () => {
    const s: BuilderState = { ...initialState(), chart: 'slope_pair', ...pairSample('en') };
    const n = replaceWithTable(s, 'current', { rows: ['2025 Q4', '2026 Q1', '2026 Q2'], cols: ['A', 'B'], values: [[1, 2], [3, 4], [5, 6]], hasColNames: true, hasRowNames: true, corner: null, raw: [] } as never);
    expect(n.dataset.periods.base.label).toBe('');
    expect(n.dataset.periods.current.label).toBe('');
  });
});
