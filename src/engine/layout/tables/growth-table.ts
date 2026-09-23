import { formatPct1 } from '../../format';
import type { TableCell, TableItem } from '../../scene';
import { HEAT, INK, mixColor, textOn } from '../../theme';

export const GROWTH_TABLE = { rowH: 0.34 } as const;

export interface GrowthRow {
  label: string;
  vals: (number | null)[];
}

/**
 * 成長率表。色の濃さは行ごとに正規化する（市場全体と形状別で桁が違うため）。
 * colW は [行ラベル幅, 各列幅…]。列幅は揃え先（Mekko の列）から受け取る。
 */
export function layoutGrowthTable(p: { x: number; y: number; colW: number[]; rows: GrowthRow[] }): TableItem {
  const ncol = p.colW.length - 1;
  return {
    kind: 'table', x: p.x, y: p.y, colW: p.colW, rowH: GROWTH_TABLE.rowH,
    rows: p.rows.map((row): TableCell[] => {
      const vv = row.vals.filter((v): v is number => v != null);
      const maxP = Math.max(0.0001, ...vv.filter((v) => v > 0));
      const maxN = Math.max(0.0001, ...vv.filter((v) => v < 0).map((v) => -v));
      return [
        { text: row.label, fill: null, color: INK, align: 'left', size: 10, bold: true },
        ...row.vals.map((v): TableCell => {
          let fill = HEAT.empty;
          if (v != null) fill = v >= 0 ? mixColor(HEAT.posLow, HEAT.posHigh, Math.min(1, v / maxP)) : mixColor(HEAT.negLow, HEAT.negHigh, Math.min(1, -v / maxN));
          return { text: formatPct1(v), fill, color: textOn(fill), align: 'center', size: ncol > 7 ? 9 : 10.5, bold: false };
        }),
      ];
    }),
  };
}
