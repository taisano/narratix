import { describe, expect, it } from 'vitest';
import {
  CHART_TYPE_IDS, COMPLEMENT_IDS, CONTROL_IDS, DATA_SCHEMA_IDS, LAYOUT_IDS, PURPOSE_IDS, TRANSFORM_IDS,
  TransformSchema, chartsForPurpose, complementPlacement, complementsFor, controlsFor, registry, viewSpecJsonSchema,
  type LayoutNode,
} from './index';

const keysMatch = (rec: Record<string, { id: string }>, ids: readonly string[]) => {
  expect(Object.keys(rec).sort()).toEqual([...ids].sort());
  for (const [k, v] of Object.entries(rec)) expect(v.id).toBe(k);
};

const slotsOf = (n: LayoutNode): string[] => ('slot' in n ? [n.slot] : n.children.flatMap(slotsOf));
const ratioRefs = (n: LayoutNode): number[] =>
  'slot' in n ? [] : [...(typeof n.ratio === 'number' ? [n.ratio] : []), ...n.children.flatMap(ratioRefs)];

describe('レジストリの件数（設計書どおり）', () => {
  it('6目的・21チャート・13補完パーツ・8レイアウト・5スキーマ', () => {
    expect(PURPOSE_IDS).toHaveLength(6);
    expect(CHART_TYPE_IDS).toHaveLength(21);
    expect(COMPLEMENT_IDS).toHaveLength(13);
    expect(LAYOUT_IDS).toHaveLength(8);
    expect(DATA_SCHEMA_IDS).toHaveLength(5);
  });
  it('目的ごとのチャート数', () => {
    const count = Object.fromEntries(PURPOSE_IDS.map((p) => [p, chartsForPurpose(p).length]));
    expect(count).toEqual({ trend: 6, comparison: 4, composition: 3, contribution: 3, relationship: 2, evaluate: 3 });
  });
});

describe('キーと id の一致', () => {
  it('すべての表', () => {
    keysMatch(registry.purposes, PURPOSE_IDS);
    keysMatch(registry.charts, CHART_TYPE_IDS);
    keysMatch(registry.controls, CONTROL_IDS);
    keysMatch(registry.complements, COMPLEMENT_IDS);
    keysMatch(registry.layouts, LAYOUT_IDS);
    keysMatch(registry.transforms, TRANSFORM_IDS);
    keysMatch(registry.dataSchemas, DATA_SCHEMA_IDS);
  });
});

describe('チャート', () => {
  it.each(CHART_TYPE_IDS)('%s の参照が整合している', (id) => {
    const c = registry.charts[id];
    expect(c.label.ja && c.label.en).toBeTruthy();
    expect(c.exports).toContain(c.defaultExport);
    expect(c.shows.filter((a) => c.cannotShow.includes(a))).toEqual([]);
    for (const comp of c.complements) {
      expect(registry.complements[comp].appliesTo, `${comp} should apply to ${id}`).toContain(id);
    }
    expect(controlsFor(id).map((x) => x.id)).toEqual(expect.arrayContaining(['title', 'source', 'items']));
  });
  it('Mekko の設定と補完は設計書の例と一致する', () => {
    expect(controlsFor('mekko').map((c) => c.id)).toEqual(
      expect.arrayContaining(['items', 'series', 'highlight', 'mekko_labels', 'sort_by_size']),
    );
    expect(controlsFor('mekko').map((c) => c.id)).not.toContain('gridlines');
    expect(complementsFor('mekko').filter((c) => c.recommended).map((c) => c.def.id)).toEqual(['aligned_table', 'delta_labels', 'cagr_note']);
  });
});

describe('設定', () => {
  it.each(CONTROL_IDS)('%s の選択肢と既定値', (id) => {
    const c = registry.controls[id];
    if (c.type === 'select') {
      expect(c.options?.length).toBeGreaterThan(1);
      if (c.defaultValue !== undefined) expect(c.options!.map((o) => o.value)).toContain(c.defaultValue);
    }
    if (c.type === 'toggle' && c.defaultValue !== undefined) expect(typeof c.defaultValue).toBe('boolean');
  });
});

describe('レイアウト', () => {
  it.each(LAYOUT_IDS)('%s の分割木・スロット・比率', (id) => {
    const l = registry.layouts[id];
    expect(slotsOf(l.tree).sort()).toEqual([...l.slots].sort());
    expect(new Set(l.slots).size).toBe(l.slots.length);
    for (const r of ratioRefs(l.tree)) expect(r).toBeLessThan(l.ratios.length);
    for (const p of l.ratios) {
      expect(p.min).toBeLessThanOrEqual(p.default);
      expect(p.default).toBeLessThanOrEqual(p.max);
    }
  });
  it('パネル数は1〜4', () => {
    expect(LAYOUT_IDS.map((id) => registry.layouts[id].slots.length)).toEqual([1, 2, 2, 3, 3, 3, 3, 4]);
  });
});

describe('補完パーツ', () => {
  it.each(COMPLEMENT_IDS)('%s', (id) => {
    const c = registry.complements[id];
    expect(c.placement === 'panel').toBe(!!c.panel);
    if (!c.panel) return;
    const placements = [c.panel.default, ...Object.values(c.panel.byChart ?? {})];
    for (const k of Object.keys(c.panel.byChart ?? {})) expect(c.appliesTo).toContain(k);
    for (const pl of placements) {
      const l = registry.layouts[pl!.layout];
      expect(l.slots).toContain(pl!.hostSlot);
      expect(l.slots).toContain(pl!.slot);
      expect(pl!.hostSlot).not.toBe(pl!.slot);
      if (pl!.ratios) {
        expect(pl!.ratios).toHaveLength(l.ratios.length);
        pl!.ratios.forEach((r, i) => {
          expect(r).toBeGreaterThanOrEqual(l.ratios[i]!.min);
          expect(r).toBeLessThanOrEqual(l.ratios[i]!.max);
        });
      }
    }
  });
  it('Mekko に揃えた表を足すと p05 の右側構成になる', () => {
    expect(complementPlacement('aligned_table', 'mekko')).toMatchObject({ layout: 'p05_left_main_bottom', hostSlot: 'main', slot: 'bottom', align: 'columns' });
    expect(complementPlacement('delta_labels', 'mekko')).toBeNull();
  });
});

describe('transform と JSON Schema', () => {
  it('TransformSchema の type は TRANSFORM_IDS と一致', () => {
    const types = TransformSchema.options.map((o) => o.shape.type.value);
    expect([...types].sort()).toEqual([...TRANSFORM_IDS].sort());
  });
  it('ViewSpec の JSON Schema を生成できる', () => {
    const js = viewSpecJsonSchema() as { type: string; properties: Record<string, unknown> };
    expect(js.type).toBe('object');
    expect(Object.keys(js.properties)).toEqual(expect.arrayContaining(['layout', 'panels', 'slide', 'slideLocale']));
  });
});
