/** パネルが他のパネルに公開する位置情報（揃えに使う） */
export interface PanelAnchors {
  /** 列の位置と幅（Mekko の列など）。keys は列の名前 */
  columns?: { keys: string[]; x: number[]; w: number[] };
  /** 縦軸 0〜100% の位置 */
  yScale?: { y: number; h: number };
  /** 行ラベル用の左の余白 */
  gutter?: { x: number; w: number };
}
