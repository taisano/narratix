import { describe, expect, it } from 'vitest';
import { ACCENT_COLORS } from '@/engine/theme';
import { MESSAGES, translate } from '@/i18n/ui';
import { convertChart } from './convert';
import { dataSig, meaningIssues } from './meaning';
import { hideNames } from './MeaningPanel';
import { dataSuggestions } from './advice';
import { evaluate } from './preview';
import { fromBuilder, viewOf, withView, type ProjectState } from './project';
import { initHistory, pushHistory, redo, undo } from './history';
import { initialState, type BuilderState } from './state';

/** 報告の再現データ：Q1〜Q4 × 売上（億円）・粗利率、Mekko、単位は前の「百万ドル」 */
function mekko(cols = ['売上（億円）', '粗利率'], values: (number | null)[][] = [[120, 32], [135, 34], [140, 35], [150, 36]], rows = ['Q1', 'Q2', 'Q3', 'Q4'], extra: Partial<BuilderState> = {}): ProjectState {
  const s0 = initialState('ja');
  const s: BuilderState = {
    ...s0, chart: 'mekko', title: '売上と粗利率', source: '出典：社内', ...extra,
    dataset: { ...s0.dataset, unit: '百万ドル', rows, cols, periods: { current: { label: '2025', values }, base: { label: '', values: values.map((r) => r.map(() => null)) } } },
  };
  return fromBuilder(s);
}
/** 変えても失ってはいけないもの */
const keep = (p: ProjectState) => { const v = viewOf(p); return { sig: dataSig(v.dataset), rows: v.dataset.rows, cols: v.dataset.cols, unit: v.dataset.unit, source: v.source, title: v.title, series: v.controls.series }; };
const SAMPLE_WORDS = ['製品A', '市場成長率（%）', 'シングル', '北米'];

describe('チャートの変換（データを失わない）', () => {
  it('Mekko → 縦棒＋折れ線：落ちない。Q1〜Q4 を保ち、売上は棒・粗利率は線（右軸）', () => {
    const p = mekko();
    const r = convertChart(p, 'combo');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(keep(r.project)).toEqual(keep(p));
    const v = viewOf(r.project);
    expect(v.chart).toBe('combo');
    expect(() => evaluate(v)).not.toThrow();
    const texts = JSON.stringify(evaluate(v).scene);
    expect(texts).toContain('Q1');
    expect(texts).not.toContain('売上実績');
  });
  it('Mekko → 散布図（2指標）：見本に置き換えない。項目＝Q1〜Q4、X＝売上、Y＝粗利率', () => {
    const p = mekko();
    const r = convertChart(p, 'scatter');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = viewOf(r.project);
    expect(keep(r.project)).toEqual(keep(p));
    expect(v.dataset.rows).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    expect(v.dataset.cols).toEqual(['売上（億円）', '粗利率']);
    for (const w of SAMPLE_WORDS) expect(JSON.stringify(v.dataset)).not.toContain(w);
  });
  it('3指標ならバブル。1指標だけ（または1つを外した）なら散布図にはできず、何も変えない', () => {
    expect(convertChart(mekko(['売上', '利益率', '社員数'], [[1, 2, 3], [4, 5, 6]], ['A', 'B']), 'bubble').ok).toBe(true);
    const one = mekko(['売上（億円）'], [[1], [2], [3]], ['A', 'B', 'C']);
    const r1 = convertChart(one, 'scatter');
    expect(r1).toMatchObject({ ok: false, reason: 'need_metrics' });
    const p = mekko();
    const hidden = withView(p, 0, hideNames(viewOf(p), ['粗利率']));
    expect(convertChart(hidden, 'scatter')).toMatchObject({ ok: false, reason: 'need_metrics' });
  });
  it('空のタイトル・単位・出典、欠けた値、記号や英語の項目名でも落ちず、欠けた位置も保つ', () => {
    const p = mekko(['Sales ($M)', 'Margin %'], [[120, null], [null, 34], [140, 35]], ['Q1 / FY25', 'Q2 & more', '第3四半期'], { title: '', source: '' });
    const v0 = viewOf(p);
    const p2 = { ...p, dataset: { ...p.dataset, unit: '' } };
    for (const c of ['combo', 'scatter', 'line', 'stacked_column'] as const) {
      const r = convertChart(p2, c);
      expect(r.ok, c).toBe(true);
      if (r.ok) expect(viewOf(r.project).dataset.periods.current.values).toEqual(v0.dataset.periods.current.values);
    }
  });
  it('往復：Mekko → 散布図 → 縦棒＋折れ線 → Mekko で、データ・単位・出典・見出しが同じ', () => {
    const p0 = mekko();
    let p = p0;
    for (const c of ['scatter', 'combo', 'mekko'] as const) {
      const r = convertChart(p, c);
      expect(r.ok, c).toBe(true);
      if (r.ok) p = r.project;
      expect(keep(p)).toEqual(keep(p0));
    }
  });
  it('元に戻す1回で変換前、やり直す1回で変換後。20回くり返しても値は変わらない', () => {
    const p0 = mekko();
    const r = convertChart(p0, 'combo');
    if (!r.ok) throw new Error('convert');
    let h = pushHistory(initHistory(p0), r.project, 1);
    for (let k = 0; k < 20; k++) {
      h = undo(h);
      expect(h.present).toBe(p0);
      h = redo(h);
      expect(h.present).toBe(r.project);
    }
    expect(keep(h.present)).toEqual(keep(p0));
  });
  it('ほかのスライドが行き先の形のデータを使っていたら、上書きせず何も変えない', () => {
    const p = mekko();
    const two: ProjectState = { ...p, slides: [...p.slides, { ...p.slides[0]!, id: 's2', chart: 'scatter' }], datasets: { relation: viewOf(p).dataset } };
    const r = convertChart(two, 'bubble');
    expect(r.ok).toBe(false);
  });
});

describe('重大な注意と提案', () => {
  it('Mekko に金額と率 → 重大。散布図・縦棒＋折れ線にすると消える', () => {
    const p = mekko();
    expect(meaningIssues(viewOf(p)).some((x) => x.level === 'error')).toBe(true);
    for (const c of ['combo', 'scatter'] as const) {
      const r = convertChart(p, c);
      if (r.ok) expect(meaningIssues(viewOf(r.project)).some((x) => x.level === 'error'), c).toBe(false);
    }
  });
  it('列を外した後は、外した列を数えて散布図を勧めない', () => {
    const p = mekko();
    expect(dataSuggestions(viewOf(p)).map((x) => x.code)).toContain('items_two_metrics');
    const hidden = hideNames(viewOf(p), ['粗利率']);
    expect(dataSuggestions(hidden).map((x) => x.code)).not.toContain('items_two_metrics');
  });
});

describe('文言が無くても止めない', () => {
  it('縦棒＋折れ線の色の選択肢（強調の色すべて）に文言がある', () => {
    for (const id of Object.keys(ACCENT_COLORS)) {
      expect(MESSAGES.ja[`combo.color.${id}` as keyof typeof MESSAGES.ja], id).toBeTruthy();
      expect(MESSAGES.en[`combo.color.${id}` as keyof typeof MESSAGES.en], id).toBeTruthy();
    }
  });
  it('無いキーでも例外にしない', () => {
    expect(translate('ja', 'no.such.key' as never)).toBe('no.such.key');
  });
});
