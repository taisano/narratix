import { describe, expect, it } from 'vitest';
import { DatasetSchema } from '@/registry';
import { applyLong, defaultPivot, detachLong, detectLong, longToTsv, pivotTable, swapLong, tableToTsv, valuesOf } from './long';
import { initialState, sampleFor, toDataset, validateState, type BuilderState } from './state';

/** エアフライヤー：年×地域×タイプ×指標（Vol＝台数、Val＝金額） */
const rows: string[][] = [];
const data: Record<string, [number, number, number, number]> = {
  // 地域: [スチーム Vol, その他 Vol, スチーム Val, その他 Val]
  '2023|北米': [10, 90, 30, 170], '2023|欧州': [5, 45, 10, 90],
  '2024|北米': [20, 80, 50, 150], '2024|欧州': [10, 40, 25, 75],
};
for (const [key, [sv, ov, sval, oval]] of Object.entries(data)) {
  const [y, r] = key.split('|');
  rows.push([y!, r!, 'スチーム', 'Vol', String(sv)], [y!, r!, 'その他', 'Vol', String(ov)], [y!, r!, 'スチーム', 'Val', String(sval)], [y!, r!, 'その他', 'Val', String(oval)]);
}
const text = ['年\t地域\tタイプ\t指標\t値', ...rows.map((r) => r.join('\t'))].join('\n');

describe('縦長の表', () => {
  it('見分ける：切り口が2つ以上・値が1つ以上・最初の切り口が繰り返す', () => {
    const t = detectLong(text)!;
    expect(t.headers).toEqual(['年', '地域', 'タイプ', '指標', '値']);
    expect(t.rows).toHaveLength(16);
    // 横長の表（年×地域）は縦長ではない
    expect(detectLong('年\t北米\t欧州\n2023\t10\t5\n2024\t20\t10')).toBeNull();
    // 項目が繰り返さない表（散布図の表など）も縦長ではない
    expect(detectLong('製品\t事業\t成長率\n A\t消費財\t1\nB\t消費財\t2\nC\t産業財\t3')).toBeNull();
  });

  it('はじめの切り出し方：行＝年、列＝地域、値＝値、残りは最初の値で絞る', () => {
    const p = defaultPivot(detectLong(text)!);
    expect(p).toEqual({ row: 0, col: 1, value: 4, filters: [{ col: 2, value: 'スチーム' }, { col: 3, value: 'Vol' }], share: null, total: null });
  });

  it('そのまま：絞り込みに合う値を並べる。合計の列は量を足す', () => {
    const t = detectLong(text)!;
    const r = pivotTable(t, { ...defaultPivot(t), total: 'グローバル' });
    expect(r.rows).toEqual(['2023', '2024']);
    expect(r.cols).toEqual(['北米', '欧州', 'グローバル']);
    expect(r.values).toEqual([[10, 5, 15], [20, 10, 30]]);
    expect(r.merged).toBe(0);
  });

  it('割合：タイプの中でのスチームの割合（%）。グローバルは量の重みで計算する（地域の % の平均ではない）', () => {
    const t = detectLong(text)!;
    const r = pivotTable(t, { ...defaultPivot(t), share: 2, total: 'グローバル' });
    // 2023 北米 10/100=10%、欧州 5/50=10%、グローバル 15/150=10%。2024 北米 20%、欧州 20%、グローバル 30/150=20%
    expect(r.values).toEqual([[10, 10, 10], [20, 20, 20]]);
    const val = pivotTable(t, { ...defaultPivot(t), filters: [{ col: 2, value: 'スチーム' }, { col: 3, value: 'Val' }], share: 2, total: 'グローバル' });
    // 2024 北米 50/200=25%、欧州 25/100=25%、グローバル 75/300=25%。2023 北米 30/200=15%、欧州 10/100=10%、グローバル 40/300=13.3%
    expect(val.values).toEqual([[15, 10, 13.3], [25, 25, 25]]);
  });

  it('「すべて合計」で絞らない列は足し合わせ、同じ組み合わせが複数あった数を返す', () => {
    const t = detectLong(text)!;
    const r = pivotTable(t, { ...defaultPivot(t), filters: [{ col: 2, value: null }, { col: 3, value: 'Vol' }] });
    expect(r.values).toEqual([[100, 50], [100, 50]]);
    expect(r.merged).toBe(4);
  });

  it('今のデータに当てはめる：単位は %、行・列の名前、元の表を残す。検証を通って描ける', () => {
    const t = detectLong(text)!;
    const s0: BuilderState = { ...initialState(), chart: 'line', ...sampleFor('trend'), controls: { highlight: '中国' } };
    const s = applyLong(s0, t, { ...defaultPivot(t), share: 2, total: 'グローバル' });
    expect(s.dataset.unit).toBe('%');
    expect(s.dataset.dimensions).toMatchObject({ rows: '年', cols: '地域' });
    expect(s.dataset.long?.pivot.share).toBe(2);
    expect(s.controls.highlight).toBeUndefined();
    expect(DatasetSchema.parse(toDataset(s)).long?.headers).toEqual(t.headers);
    expect(validateState(s).ok).toBe(true);
    // 割合をやめると元の値の単位（初めて読んだ表は空）に戻す
    expect(applyLong(s, t, { ...s.dataset.long!.pivot, share: null }).dataset.unit).toBe('');
  });

  it('行と列の入れ替えは切り出し方を入れ替える。切り出しをやめると直接編集できる表が残る', () => {
    const t = detectLong(text)!;
    const s = applyLong({ ...initialState(), chart: 'line', ...sampleFor('trend') }, t, defaultPivot(t));
    const sw = swapLong(s);
    expect(sw.dataset.rows).toEqual(['北米', '欧州']);
    expect(sw.dataset.cols).toEqual(['2023', '2024']);
    const d = detachLong(s);
    expect(d.dataset.long).toBeUndefined();
    expect(d.dataset.rows).toEqual(['2023', '2024']);
  });

  it('コピー：今の表と、元の縦長の表をタブ区切りで', () => {
    const t = detectLong(text)!;
    const s = applyLong({ ...initialState(), chart: 'line', ...sampleFor('trend') }, t, defaultPivot(t));
    expect(tableToTsv(s.dataset)).toBe('年\t北米\t欧州\n2023\t10\t5\n2024\t20\t10');
    expect(longToTsv(t)).toBe(text);
    expect(valuesOf(t, 3)).toEqual(['Vol', 'Val']);
  });
});

describe('切り出し方を整える', () => {
  it('行と列が同じなら入れ替え、絞り込みを置き直し、割合の列が無くなれば割合をやめる', async () => {
    const { normalizePivot } = await import('./long');
    const t = detectLong(text)!;
    const p0 = { ...defaultPivot(t), share: 2 };
    // 列をタイプにする → タイプの絞り込みが消え、地域の絞り込みができ、割合はやめる
    const p1 = normalizePivot(t, { ...p0, col: 2 }, p0);
    expect(p1.filters.map((f) => f.col).sort()).toEqual([1, 3]);
    expect(p1.share).toBeNull();
    // 行を列と同じにした → 前の行と入れ替え
    const p2 = normalizePivot(t, { ...p0, row: 1 }, p0);
    expect([p2.row, p2.col]).toEqual([1, 0]);
    // 「すべて合計」にした列の割合はやめる
    expect(normalizePivot(t, { ...p0, filters: [{ col: 2, value: null }, { col: 3, value: 'Vol' }] }, p0).share).toBeNull();
  });
});

describe('スライドごとの切り出し方', () => {
  it('Vol と Val を別のスライドにできる。単位は元の値の単位を残す', async () => {
    const { fromBuilder, viewOf, withView, duplicateSlide } = await import('./project');
    const t = detectLong(text)!;
    const s0: BuilderState = { ...initialState(), chart: 'line', ...sampleFor('trend') };
    let p = fromBuilder(s0);
    p = withView(p, 0, applyLong(viewOf(p, 0), t, { ...defaultPivot(t), share: 2 }));
    p = duplicateSlide(p, 0);
    const v1 = viewOf(p, 1);
    p = withView(p, 1, applyLong(v1, t, { ...v1.dataset.long!.pivot, filters: [{ col: 2, value: 'スチーム' }, { col: 3, value: 'Val' }] }));
    expect(viewOf(p, 0).dataset.periods.current.values).toEqual([[10, 10], [20, 20]]);
    expect(viewOf(p, 1).dataset.periods.current.values).toEqual([[15, 10], [25, 25]]);
    // 割合をやめて単位を入れると、元の値の単位として残る
    const v0 = viewOf(p, 0);
    p = withView(p, 0, applyLong(v0, t, { ...v0.dataset.long!.pivot, share: null }));
    p = withView(p, 0, { ...viewOf(p, 0), dataset: { ...viewOf(p, 0).dataset, unit: '千台' } });
    expect(viewOf(p, 0).dataset.unit).toBe('千台');
    expect(viewOf(p, 1).dataset.unit).toBe('%');
    // 切り出しをやめると、ほかのスライドの切り出し方も外れる
    p = withView(p, 0, detachLong(viewOf(p, 0)));
    expect(p.slides.every((s) => !s.longPivot)).toBe(true);
    expect(viewOf(p, 1).dataset.long).toBeUndefined();
  });
});
