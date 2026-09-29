/** パネルが他のパネルに公開する位置情報（揃えに使う） */
export interface PanelAnchors {
  /** 列の位置と幅（Mekko の列など）。keys は列の名前 */
  columns?: { keys: string[]; x: number[]; w: number[] };
  /** 縦軸 0〜100% の位置 */
  yScale?: { y: number; h: number };
  /** 行ラベル用の左の余白 */
  gutter?: { x: number; w: number };
  /**
   * 系列の色（強調の前の色）。主役のチャートが出し、付け合わせ（右の差分バーなど）が同じ色で描く。
   * 左右で色の役割を一つにする（色＝項目）。docs/decisions.md「左右構成の色」
   */
  seriesColors?: Record<string, string>;
  /** 強調した項目を主役で実際に描いた色（強調色を選んでいればその色）。付け合わせの強調もこの色にする */
  focusColor?: string;
}
