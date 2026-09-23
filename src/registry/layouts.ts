import type { LayoutId } from './ids';
import type { LayoutRatioParam, SlideLayoutDef } from './types';

const L = (ja: string, en: string) => ({ ja, en });
const half = (ja: string, en: string, min = 0.25, max = 0.8): LayoutRatioParam => ({ label: L(ja, en), default: 0.5, min, max });

/** スライドの外枠（インチ、16:9）。タイトルと出典の領域は全レイアウト共通。 */
export const SLIDE_FRAME = {
  width: 13.333,
  height: 7.5,
  margin: { left: 0.5, right: 0.5, top: 0.32, bottom: 0.2 },
  titleHeight: 0.86,
  sourceHeight: 0.26,
  /** パネル同士の間隔 */
  gutter: 0.25,
} as const;

/** 8パターン（docs/layouts.pdf）。自由配置にせず、ひな形＋比率の調整に限定する。 */
export const LAYOUTS: Record<LayoutId, SlideLayoutDef> = {
  p01_single: {
    id: 'p01_single', label: L('1つ（シングル）', 'Single'),
    useCase: L('最重要メッセージを1つの図で', 'One key message in one chart'),
    slots: ['main'],
    tree: { slot: 'main' },
    ratios: [],
  },
  p02_top_bottom: {
    id: 'p02_top_bottom', label: L('2つ（上下分割）', 'Top / bottom'),
    useCase: L('前年と今年、原因と結果', 'Before and after, cause and effect'),
    slots: ['top', 'bottom'],
    tree: { split: 'rows', ratio: 0, children: [{ slot: 'top' }, { slot: 'bottom' }] },
    ratios: [half('上の高さ', 'Top height')],
  },
  p03_left_right: {
    id: 'p03_left_right', label: L('2つ（左右並列）', 'Left / right'),
    useCase: L('A/B比較、2指標、チャート＋示唆ボックス（3:1）', 'A/B comparison, two metrics, chart + insight box (3:1)'),
    slots: ['left', 'right'],
    tree: { split: 'cols', ratio: 0, children: [{ slot: 'left' }, { slot: 'right' }] },
    ratios: [half('左の幅', 'Left width')],
  },
  p04_three_columns: {
    id: 'p04_three_columns', label: L('3つ（横並び3等分）', 'Three columns'),
    useCase: L('3ステップ、3つの柱', 'Three steps or pillars'),
    slots: ['col1', 'col2', 'col3'],
    tree: { split: 'cols', ratio: 'equal', children: [{ slot: 'col1' }, { slot: 'col2' }, { slot: 'col3' }] },
    ratios: [],
  },
  p05_left_main_bottom: {
    id: 'p05_left_main_bottom', label: L('3つ（左1/3 ＋ 右上下3:1）', 'Left + main + bottom table'),
    useCase: L('全体像＋内訳＋補足表（Mekkoの複合構成）', 'Overview + breakdown + supporting table'),
    slots: ['left', 'main', 'bottom'],
    tree: {
      split: 'cols', ratio: 0,
      children: [{ slot: 'left' }, { split: 'rows', ratio: 1, children: [{ slot: 'main' }, { slot: 'bottom' }] }],
    },
    ratios: [
      { label: L('左の幅', 'Left width'), default: 1 / 3, min: 1 / 6, max: 1 / 2 },
      { label: L('右上の高さ', 'Main height'), default: 0.75, min: 0.5, max: 0.9 },
    ],
  },
  p06_main_top_two_bottom: {
    id: 'p06_main_top_two_bottom', label: L('3つ（上主軸＋左右下）', 'Main top + two below'),
    useCase: L('全体サマリーと2つの内訳', 'Summary with two breakdowns'),
    slots: ['main', 'sub_a', 'sub_b'],
    tree: {
      split: 'rows', ratio: 0,
      children: [{ slot: 'main' }, { split: 'cols', ratio: 1, children: [{ slot: 'sub_a' }, { slot: 'sub_b' }] }],
    },
    ratios: [half('上の高さ', 'Top height'), half('左下の幅', 'Bottom-left width')],
  },
  p07_two_top_conclusion: {
    id: 'p07_two_top_conclusion', label: L('3つ（左右上＋下主軸）', 'Two above + conclusion'),
    useCase: L('前提2つから結論を導く', 'Two premises leading to a conclusion'),
    slots: ['context_a', 'context_b', 'conclusion'],
    tree: {
      split: 'rows', ratio: 0,
      children: [{ split: 'cols', ratio: 1, children: [{ slot: 'context_a' }, { slot: 'context_b' }] }, { slot: 'conclusion' }],
    },
    ratios: [half('上の高さ', 'Top height'), half('左上の幅', 'Top-left width')],
  },
  p08_grid_2x2: {
    id: 'p08_grid_2x2', label: L('4つ（4分割グリッド）', '2 × 2 grid'),
    useCase: L('SWOT、4つの独立した要素', 'SWOT, four independent elements'),
    slots: ['q1', 'q2', 'q3', 'q4'],
    tree: {
      split: 'rows', ratio: 1,
      children: [
        { split: 'cols', ratio: 0, children: [{ slot: 'q1' }, { slot: 'q2' }] },
        { split: 'cols', ratio: 0, children: [{ slot: 'q3' }, { slot: 'q4' }] },
      ],
    },
    ratios: [half('左の幅', 'Left width'), half('上の高さ', 'Top height')],
  },
};
