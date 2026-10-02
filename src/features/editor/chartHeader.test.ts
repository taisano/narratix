import { describe, expect, it } from 'vitest';
import { CHART_TYPE_IDS } from '@/registry';
import { IMPLEMENTED_CHARTS, composeSlide } from '@/engine/layout/compose';
import { layoutChartHeader } from '@/engine/layout/frame';
import type { Scene, TextItem } from '@/engine/scene';
import { expectPptxMatches } from '@/export/pptx/test-utils';
import { autoChartTitle, autoPeriod, chartHeaderOf } from './chartHeader';
import { switchChart } from './chartSwitch';
import { evaluate } from './preview';
import { duplicateSlide, fromBuilder, normalizeProject, viewOf } from './project';
import { initialState, sampleFor, toDataset, toViewSpec, type BuilderState } from './state';

const texts = (s: Scene) => s.items.filter((i): i is TextItem => i.kind === 'text').flatMap((i) => i.lines.map((l) => l.t));
const charts = CHART_TYPE_IDS.filter((c) => IMPLEMENTED_CHARTS.includes(c));
const trend = (loc: 'ja' | 'en' = 'ja'): BuilderState => switchChart(initialState(loc), 'line').state;

describe('チャートタイトルの初期値（ルールで作る）', () => {
  it('{比較軸}別・{指標}の{分析内容}。分からない部分は省く', () => {
    expect(autoChartTitle(trend())).toBe('項目別の推移');
    expect(autoChartTitle(switchChart(initialState(), 'stacked_column').state)).toBe('項目別の推移と内訳');
    expect(autoChartTitle(initialState())).toBe('項目別の規模と構成');
    expect(autoChartTitle(switchChart(initialState(), 'waterfall').state)).toBe('営業利益の増減要因');
    expect(autoChartTitle(switchChart(initialState(), 'scatter').state)).toBe('項目別・市場成長率と営業利益率の関係');
    expect(autoChartTitle(trend('en'))).toBe('Trend by Item');
  });
  it('比較軸も指標も分からなければ空（プレースホルダーを出さない）。時間の軸は比較軸にしない', () => {
    const s = trend();
    expect(autoChartTitle({ ...s, dataset: { ...s.dataset, dimensions: { rows: '', cols: '' } } })).toBe('');
    expect(autoChartTitle({ ...s, dataset: { ...s.dataset, dimensions: { rows: '地域', cols: '年' } } })).toBe('');
  });
  it('同じ語を重ねない・メッセージタイトルと同じなら出さない', () => {
    const s = trend();
    expect(autoChartTitle({ ...s, title: '項目別の推移' })).toBe('');
  });
  it('期間：時間の行なら最初–最後、スロープは選んだ2時点', () => {
    expect(autoPeriod(trend())).toBe('2021–2025');
    const sl = switchChart(initialState(), 'slope').state;
    expect(autoPeriod({ ...sl, controls: { ...sl.controls, slope_from: '2022', slope_to: '2024' } })).toBe('2022–2024');
  });
});

describe('表示・非表示と保存', () => {
  it('新しいスライドは出す。古いスライド（chartHeader なし）は今まで通り出さない', () => {
    expect(chartHeaderOf(trend())).toEqual({ chartTitle: '項目別の推移', chartPeriod: '2021–2025', chartUnit: '億円', chartNote: 'off' });
    const { chartHeader: _h, ...old } = trend(); void _h;
    expect(chartHeaderOf(old as BuilderState)).toEqual({});
    expect(toViewSpec(old as BuilderState).slide).toEqual({ title: old.title, source: old.source });
  });
  it('書いたタイトルを使い、非表示にすれば出さない。期間・単位も別に切り替えられる', () => {
    const s = trend();
    expect(chartHeaderOf({ ...s, chartHeader: { show: true, title: '用途別・資料作成本数の推移' } }).chartTitle).toBe('用途別・資料作成本数の推移');
    expect(chartHeaderOf({ ...s, chartHeader: { show: false } })).toEqual({ chartPeriod: '2021–2025', chartUnit: '億円' });
    expect(chartHeaderOf({ ...s, chartHeader: { show: true, showPeriod: false, showUnit: false } })).toEqual({ chartTitle: '項目別の推移', chartNote: 'off' });
  });
  it('保存・読み込み・複製で保持する', () => {
    const s: BuilderState = { ...trend(), chartHeader: { show: true, title: '独自のタイトル', showUnit: false } };
    const p = normalizeProject(JSON.parse(JSON.stringify(fromBuilder(s))))!;
    expect(viewOf(p).chartHeader).toEqual(s.chartHeader);
    const d = duplicateSlide(p);
    expect(viewOf(d, 1).chartHeader).toEqual(s.chartHeader);
  });
});

describe('スライドの配置', () => {
  it('メッセージタイトル → チャートタイトル（左）と期間・単位（右）→ 凡例 → チャート → 出典の順', () => {
    const s = trend();
    const e = evaluate(s);
    const items = e.scene!.items.filter((i): i is TextItem => i.kind === 'text');
    const y = (t: string) => items.find((i) => i.lines.some((l) => l.t === t))!.y;
    expect(y(s.title)).toBeLessThan(y('項目別の推移'));
    expect(y('項目別の推移')).toBe(y('2021–2025｜単位：億円'));
    const legend = items.find((i) => i.lines.some((l) => l.t === 'AAA'))!;
    expect(legend.y).toBeGreaterThan(y('項目別の推移'));
    expect(y(s.source)).toBeGreaterThan(legend.y);
    // 単位はチャートタイトルの行に出すので、チャートの中の「単位：…」は出さない
    expect(texts(e.scene!).filter((t) => t.includes('単位')).length).toBe(1);
  });
  it('何も無ければ高さ 0。入り切らなければ期間・単位を下の行へ', () => {
    const c = { x: 0.5, y: 1.2, w: 5, h: 5 };
    expect(layoutChartHeader({ title: 'x' }, c, 'ja')).toEqual({ items: [], height: 0 });
    const one = layoutChartHeader({ title: 'x', chartTitle: '短い', chartPeriod: '2021–2025' }, c, 'ja');
    expect(one.items[0]!.y).toBe(one.items[1]!.y);
    const two = layoutChartHeader({ title: 'x', chartTitle: 'とても長いチャートタイトルでメタ情報と同じ行には入り切らない', chartPeriod: '2021 Q1–2025 Q4', chartUnit: '百万円' }, c, 'ja');
    expect(two.items[1]!.y).toBeGreaterThan(two.items[0]!.y);
    expect(two.height).toBeGreaterThan(one.height);
  });
  it('全チャート（日英）で描け、チャートタイトルと出典が重ならず、PPT と一致する', async () => {
    for (const loc of ['ja', 'en'] as const) for (const c of charts) {
      const s = switchChart(initialState(loc), c).state;
      const scene = composeSlide(toViewSpec(s), toDataset(s));
      const head = scene.items.find((i): i is TextItem => i.kind === 'text' && i.lines[0]?.size === 12 && !!i.lines[0]?.bold);
      const src = scene.items[scene.items.length - 1] as TextItem;
      if (head) expect(head.y + head.h, `${loc}:${c}`).toBeLessThan(src.y);
      await expectPptxMatches(scene);
    }
  });
  it('サンプルの要因データでもタイトルなしで期間・単位だけ出せる', () => {
    const s = { ...switchChart(initialState(), 'driver_bar').state, ...sampleFor('contribution') };
    expect(chartHeaderOf(s).chartTitle).toBeUndefined();
    expect(chartHeaderOf(s).chartUnit).toBe('億円');
  });
});

describe('チャートタイトルと重なる注記', () => {
  const mekko = () => initialState('en');
  const all = (s: BuilderState) => texts(evaluate(s).scene!).join('\n');
  it('チャートタイトルを出す Mekko では「幅：…　高さ：…」をチャートの中に出さない', () => {
    expect(all(mekko())).not.toMatch(/Width:/);
    // 古いスライド（chartHeader なし）は今まで通りチャートの中に出す
    const { chartHeader: _h, ...old } = mekko(); void _h;
    expect(all(old as BuilderState)).toMatch(/Width: .* market size/);
    // チャートタイトルを消せば、チャートの中に戻る
    expect(all({ ...mekko(), chartHeader: { show: false } })).toMatch(/Width:/);
  });
  it('「注記を出典の下に出す」をオンにすると、出典の下に1行で出す', () => {
    const s = { ...mekko(), chartHeader: { show: true, showNote: true } };
    const scene = evaluate(s).scene!;
    const note = scene.items.filter((i): i is TextItem => i.kind === 'text').find((i) => i.lines[0]?.t.startsWith('Note: Width:'))!;
    const src = scene.items.filter((i): i is TextItem => i.kind === 'text').find((i) => i.lines[0]?.t === s.source)!;
    expect(note.y).toBeGreaterThan(src.y);
    expect(note.y + note.h).toBeLessThanOrEqual(7.5);
  });
  it('幅が変わる縦棒・バブルも同じ', () => {
    expect(all(switchChart(initialState('en'), 'variable_width').state)).not.toMatch(/Area = width/);
    expect(all(switchChart(initialState('en'), 'bubble').state)).not.toMatch(/Bubble size =/);
  });
  it('ランキングは比べている時点、差分バーは基準–比較先を期間にし、チャートの中の「時点」「の差」は出さない', () => {
    const r = switchChart(initialState(), 'bar_rank').state;
    expect(autoPeriod(r)).toBe('2025');
    expect(autoPeriod({ ...r, controls: { ...r.controls, compare_target: '2023' } })).toBe('2023');
    expect(all(r)).not.toMatch(/時点/);
    const v = switchChart(initialState(), 'variance_bar').state;
    expect(autoPeriod(v)).toBe('2021–2025');
    expect(all(v)).not.toMatch(/→ 2025 の差/);
  });
});
