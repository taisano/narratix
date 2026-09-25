import { describe, expect, it } from 'vitest';
import { DatasetSchema, validateViewSpec, type Dataset } from './index';

const regions = ['北米', '欧州', '中国', '日本'];
const shapes = ['バスケット', 'デュアル', 'オーブン'];
const mekkoData = (withBase = true): Dataset => ({
  schema: 'MEKKO',
  unit: '百万ドル',
  rows: regions,
  cols: shapes,
  periods: {
    current: { label: '2025', values: [[500, 300, 200], [300, 150, 100], [250, 200, 50], [80, 40, 30]] },
    ...(withBase ? { base: { label: '2021', values: [[400, 100, 150], [250, 50, 80], [200, 60, 40], [70, 10, 25]] } } : {}),
  },
});

/** registry-spec.md「例：Mekkoの複合構成（p05）」そのもの */
const p05Example = {
  datasetId: 'airfryer_region_shape',
  angle: { kind: 'hypothesis', text: '成長の大半は、大きな市場のデュアルが生んでいる' },
  layout: { id: 'p05_left_main_bottom', ratios: [0.17, 0.75] },
  panels: [
    {
      id: 'total', slot: 'left', kind: 'chart', chart: 'stacked_100',
      transform: [{ type: 'aggregate_rows' }, { type: 'select_periods', periods: ['base', 'current'] }],
      align: [{ to: 'main', axis: 'y_scale' }],
    },
    {
      id: 'main', slot: 'main', kind: 'chart', chart: 'mekko',
      controls: { mekko_labels: 'pct', sort_by_size: true },
      inChartComplements: [{ id: 'delta_labels' }],
    },
    {
      id: 'growth', slot: 'bottom', kind: 'table', table: 'growth_table',
      transform: [{ type: 'growth', mode: 'cagr', rows: ['market', 'series:デュアル'] }],
      align: [{ to: 'main', axis: 'columns' }],
    },
  ],
  slide: { title: '[メッセージ：データ入力後に確定]', source: '[データ出典]' },
  slideLocale: 'ja',
};

const clone = <T,>(v: T): T => structuredClone(v);
const codes = (r: ReturnType<typeof validateViewSpec>) => r.issues.map((i) => i.code);

describe('validateViewSpec', () => {
  it('設計書の p05 の例が通る', () => {
    const r = validateViewSpec(p05Example, mekkoData());
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('比較期間がなければ、通るが警告を出す', () => {
    const r = validateViewSpec(p05Example, mekkoData(false));
    expect(r.ok).toBe(true);
    expect(r.issues.every((i) => i.severity === 'warning' && i.code === 'requires_base')).toBe(true);
    expect(r.issues.length).toBeGreaterThanOrEqual(3); // delta_labels, growth transform, growth_table
  });

  it('存在しないチャート ID を弾く', () => {
    const s = clone(p05Example);
    (s.panels[1] as { chart: string }).chart = 'pie';
    expect(validateViewSpec(s).ok).toBe(false);
  });

  it('5パネル以上を弾く', () => {
    const s = clone(p05Example);
    s.panels = [...s.panels, ...s.panels];
    expect(validateViewSpec(s).ok).toBe(false);
  });

  it('レイアウトのパネル数を超える指定を弾く', () => {
    const s = clone(p05Example);
    s.layout = { id: 'p01_single' } as typeof s.layout;
    const r = validateViewSpec(s);
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain('too_many_panels');
    expect(codes(r)).toContain('unknown_slot');
  });

  it('比率の範囲外を弾く', () => {
    const s = clone(p05Example);
    s.layout.ratios = [0.05, 0.75];
    expect(codes(validateViewSpec(s))).toContain('layout_ratio_range');
  });

  it('チャートに効かない設定を弾く', () => {
    const s = clone(p05Example);
    (s.panels[1] as { controls: Record<string, unknown> }).controls = { line_markers: true };
    expect(codes(validateViewSpec(s))).toContain('control_not_applicable');
  });

  it('選択肢にない値・存在しない設定を弾く', () => {
    const s = clone(p05Example);
    (s.panels[1] as { controls: Record<string, unknown> }).controls = { mekko_labels: 'percent', foo: 1 };
    const c = codes(validateViewSpec(s));
    expect(c).toContain('invalid_control_value');
    expect(c).toContain('unknown_control');
  });

  it('データにない項目の強調を弾く', () => {
    const s = clone(p05Example);
    (s.panels[1] as { controls: Record<string, unknown> }).controls = { highlight: 'スチーム' };
    expect(codes(validateViewSpec(s, mekkoData()))).toContain('unknown_data_item');
  });

  it('適用外・パネル型の補完パーツをチャート内に置けない', () => {
    const s = clone(p05Example);
    (s.panels[1] as { inChartComplements: { id: string }[] }).inChartComplements = [{ id: 'quadrants' }, { id: 'aligned_table' }];
    const c = codes(validateViewSpec(s));
    expect(c).toContain('complement_not_applicable');
    expect(c).toContain('complement_is_panel');
  });

  it('存在しないパネルへの揃えを弾く', () => {
    const s = clone(p05Example);
    s.panels[2]!.align = [{ to: 'mekko', axis: 'columns' }];
    expect(codes(validateViewSpec(s))).toContain('align_unknown_panel');
  });

  it('チャートが対応しない出力方式を弾く', () => {
    const s = { ...clone(p05Example), export: 'native' };
    expect(codes(validateViewSpec(s))).toContain('export_not_supported');
  });

  it('データの形が合わないチャートを弾く', () => {
    const s = clone(p05Example);
    s.panels[1] = { id: 'main', slot: 'main', kind: 'chart', chart: 'waterfall' } as (typeof s.panels)[number];
    expect(codes(validateViewSpec(s, mekkoData()))).toContain('schema_mismatch');
  });

  it('目的とチャートの食い違いを弾く', () => {
    const s = clone(p05Example);
    (s.panels[1] as { purpose?: string }).purpose = 'trend';
    expect(codes(validateViewSpec(s))).toContain('purpose_mismatch');
  });
});

describe('DatasetSchema', () => {
  it('正しいデータを受け付ける', () => {
    expect(DatasetSchema.safeParse(mekkoData()).success).toBe(true);
  });
  it('行×列の形が合わないデータを弾く', () => {
    const d = mekkoData();
    d.periods.current.values[0] = [1, 2];
    expect(DatasetSchema.safeParse(d).success).toBe(false);
  });
  it('DRIVER_BRIDGE は表の1行目＝始点、最後の行＝終点として読む（bridge は任意）', () => {
    const d = { schema: 'DRIVER_BRIDGE', rows: ['FY24', '価格', 'FY25'], cols: ['value'], periods: { current: { label: 'FY25', values: [[100], [10], [110]] } } };
    expect(DatasetSchema.safeParse(d).success).toBe(true);
  });
});
