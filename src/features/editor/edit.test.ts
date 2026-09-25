import { describe, expect, it } from 'vitest';
import { addCol, deleteCol, isTabular, parseNumber, parseTable, pasteTsv, renameCol, renameRow, replaceWithTable } from './edit';
import { initialState, type BuilderState } from './state';

const names = { row: (n: number) => `項目${n}`, col: (n: number) => `系列${n}` };

describe('データ編集', () => {
  it('数値の読み取り', () => {
    expect(parseNumber('1,234')).toBe(1234);
    expect(parseNumber(' 1 234 ')).toBe(1234);
    expect(parseNumber('１２，３４５')).toBe(12345);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
  });

  it('Excel からの貼り付けで行・列を増やす', () => {
    const s = initialState();
    const out = pasteTsv(s, 'current', 4, 3, '1\t2\n3\t4\n', names);
    expect(out.dataset.rows).toHaveLength(6);
    expect(out.dataset.cols).toHaveLength(5);
    expect(out.dataset.periods.current.values[4]!.slice(3)).toEqual([1, 2]);
    expect(out.dataset.periods.current.values[5]!.slice(3)).toEqual([3, 4]);
    expect(out.dataset.periods.base.values[5]).toEqual([null, null, null, null, null]);
    expect(s.dataset.rows).toHaveLength(5); // 元の状態は変えない
  });

  it('行名の列から貼ると、名前も入る', () => {
    const out = pasteTsv(initialState(), 'base', 0, -1, 'US\t1,000\t2,000', names);
    expect(out.dataset.rows[0]).toBe('US');
    expect(out.dataset.periods.base.values[0]!.slice(0, 2)).toEqual([1000, 2000]);
  });

  it('列名の変更・削除に成長率の行と強調が追従する', () => {
    let s: BuilderState = { ...initialState(), controls: { ...initialState().controls, highlight: 'デュアル' } };
    s = renameCol(s, 1, 'Dual');
    expect(s.mekko.growthRows).toContain('series:Dual');
    expect(s.controls.highlight).toBe('Dual');
    s = deleteCol(s, 1);
    expect(s.mekko.growthRows).toEqual(['market']);
    expect(s.controls.highlight).toBeUndefined();
    expect(addCol(s, 'X').dataset.periods.current.values[0]).toHaveLength(4);
  });

  it('行名の変更に、比較の対象や表示する行が追従する', () => {
    let s: BuilderState = { ...initialState(), controls: { compare_target: '中国', items: ['中国', '日本'] } };
    s = renameRow(s, 2, 'China');
    expect(s.controls.compare_target).toBe('China');
    expect(s.controls.items).toEqual(['China', '日本']);
  });

  it('1セルだけの貼り付けは通常の入力として扱う', () => {
    expect(isTabular('123')).toBe(false);
    expect(isTabular('123\n')).toBe(false);
    expect(isTabular('1\t2')).toBe(true);
  });
});

describe('貼り付けた表で置き換える', () => {
  it('1行目＝列名、1列目＝行名、左上＝行が表すもの', () => {
    const t = parseTable('地域\tシングル\tデュアル\n東京\t20\t45\n横浜\t30\t15\n')!;
    expect(t).toMatchObject({ rows: ['東京', '横浜'], cols: ['シングル', 'デュアル'], values: [[20, 45], [30, 15]], corner: '地域', hasColNames: true, hasRowNames: true });
    const s = replaceWithTable(initialState(), 'current', t);
    expect(s.dataset.rows).toEqual(['東京', '横浜']);
    expect(s.dataset.periods.base.values).toEqual([[null, null], [null, null]]);
    expect(s.dataset.dimensions?.rows).toBe('地域');
  });
  it('年が見出しの表', () => {
    const t = parseTable('\t北米\t欧州\n2021\t320\t280\n2022\t345\t286')!;
    expect(t.rows).toEqual(['2021', '2022']);
    expect(t.cols).toEqual(['北米', '欧州']);
  });
  it('数字だけ', () => {
    const t = parseTable('1\t2\n3\t4')!;
    expect(t).toMatchObject({ hasColNames: false, hasRowNames: false, values: [[1, 2], [3, 4]], rows: ['#1', '#2'] });
    expect(parseTable('')).toBeNull();
  });
});

describe('散布図・バブルのグループ（文字の列）', async () => {
  const { parseTable, replaceWithTable, setGroup, addRow, deleteRow } = await import('./edit');
  const { initialState, sampleFor } = await import('./state');
  it('貼り付けた表の文字だけの列をグループとして取り出す', () => {
    const t = parseTable('製品\t成長率\t利益率\t売上\t事業\nA\t12\t18\t240\t消費財\nB\t8\t11\t420\t産業財\nC\t3\t7\t610\t')!;
    const s = replaceWithTable({ ...initialState(), ...sampleFor('relationship'), chart: 'bubble' }, 'current', t, { groupsFromText: true });
    expect(s.dataset.cols).toEqual(['成長率', '利益率', '売上']);
    expect(s.dataset.groups).toEqual(['消費財', '産業財', null]);
    expect(s.dataset.dimensions?.group).toBe('事業');
    const g = setGroup(s, 2, '消費財');
    expect(g.dataset.groups).toEqual(['消費財', '産業財', '消費財']);
    expect(addRow(g, 'D').dataset.groups).toHaveLength(4);
    expect(deleteRow(g, 0).dataset.groups).toEqual(['産業財', '消費財']);
  });
});
