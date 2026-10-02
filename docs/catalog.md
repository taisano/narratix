# Chart Advisor：目的・チャート・レイアウト・組み合わせの一覧

2026-09-30 時点（コミット 747bc7d）。コードのレジストリ（`src/registry/`、`src/features/start/dishes.ts`、`src/features/editor/sides.ts`）から書き出したもの。Story 機能の議論用。

件数：目的 6、チャート 25（描画あり 22）、レイアウト 8、補完パーツ 15、レシピ 38、料理（伝えたいこと）20

用語：**レシピ**＝②で選ぶ単位（チャート＋構成＋付け合わせ）。**付け合わせ**＝主役の右（または下）に置く、同じデータから計算した2つ目のパネル。**補完パーツ（チャート内）**＝主役のチャートの中に足す要素。**料理**＝「今回、最も強く伝えたいこと」（`docs/dish-matrix.md`）。

## 1. 目的とチャート

### Trend（推移）（`trend`）— 時間とともにどう変わったか

| チャート | 見せられる | 見えにくい | 推奨の補完パーツ | 描画 |
|---|---|---|---|---|
| 折れ線（`line`） | 推移 | 構成・変化の理由 | 伸び率注記（CAGR）・吹き出し注釈・参照線 | ○ |
| 縦棒（`column_trend`） | 規模 | 成長率 | 増減ラベル・伸び率注記（CAGR） | ○ |
| 横棒（`bar_trend`） | 規模 | 成長率 | 増減ラベル | ○ |
| 積み上げ縦棒（`stacked_column`） | 推移・構成 | 成長率 | 合計ラベル・伸び率注記（CAGR）・揃えた表 | ○ |
| 100%積み上げ縦棒（`stacked_100`） | 構成の変化 | 規模 | 合計ラベル・増減ラベル | ○ |
| スロープ（`slope`） | 差・順位の変化 | 推移・規模 | 揃えた表 | ○ |
| 2指標スロープ（`slope_pair`） ※2つ目の表を使う | 差・順位の変化 | 推移・規模 | 合計の増減 | ○ |
| 縦棒＋折れ線（`combo`） | 推移・規模・絶対水準 | 構成・変化の理由 | 開始から終了までの変化・参照線・合計ラベル | ○ |

### Comparison（比較）（`comparison`）— 項目間でどう違うか、どれが上位か

| チャート | 見せられる | 見えにくい | 推奨の補完パーツ | 描画 |
|---|---|---|---|---|
| 横棒ランキング（`bar_rank`） | 順位・規模 | 時間の変化・成長率 | 揃えた表・参照線・順位変化 | ○ |
| 縦棒比較（`column_compare`） | 規模 | 時間の変化 | 参照線・揃えた表 | ○ |
| 集合縦棒（`clustered_column`） | 差 | 解釈・次のアクション | 増減ラベル・示唆ボックス | ○ |
| 差分バー（`variance_bar`） | 差 | 絶対水準 | 揃えた表 | ○ |
| 指標間の順位スロープ（`rank_slope`） ※2つ目の表を使う | 順位・順位の変化 | 推移・規模 | — | ○ |

### Composition（構成）（`composition`）— 全体の大きさと、その内訳は

| チャート | 見せられる | 見えにくい | 推奨の補完パーツ | 描画 |
|---|---|---|---|---|
| Mekko（`mekko`） | 規模・構成・差 | 成長率・時間の変化 | 揃えた表・増減ラベル・伸び率注記（CAGR） | ○ |
| 100%横棒（`bar_100`） | 構成・差 | 規模 | 揃えた表・合計ラベル | ○ |
| 2期間の積み上げ（`share_pair`） ※2つ目の表を使う | 構成・構成の変化・規模・成長率 | 時間の変化 | 全体（合計）のペア | ○ |

### Contribution（要因）（`contribution`）— 始点から終点への変化は何によるか

| チャート | 見せられる | 見えにくい | 推奨の補完パーツ | 描画 |
|---|---|---|---|---|
| ウォーターフォール（`waterfall`） | 要因の寄与 | 成長率・変化の理由 | 揃えた表・吹き出し注釈・示唆ボックス | ○ |
| 要因バー（`driver_bar`） | 要因の寄与 | 絶対水準 | 示唆ボックス | ○ |
| プラス・マイナスバー（`posneg_bar`） | 要因の寄与 | 正味の変化 | 参照線・示唆ボックス | ○ |

### Relationship（関係）（`relationship`）— 2つの指標はどう関係するか、どこに位置するか

| チャート | 見せられる | 見えにくい | 推奨の補完パーツ | 描画 |
|---|---|---|---|---|
| 散布図（`scatter`） | 相関・外れ値 | 規模・時間の変化 | 象限・参照線・軌跡矢印 | ○ |
| バブル（`bubble`） | 位置づけ・規模 | 時間の変化 | 象限・軌跡矢印 | ○ |
| 幅が変わる縦棒（`variable_width`） | 規模・絶対水準・良し悪しの基準 | 時間の変化・相関・外れ値 | 参照線 | ○ |

### Evaluate（評価）（`evaluate`）— 複数の指標で見てどうか

| チャート | 見せられる | 見えにくい | 推奨の補完パーツ | 描画 |
|---|---|---|---|---|
| ヒートマップ表（`heatmap`） | 全体像 | 規模 | 揃えた表・スパークライン | 準備中 |
| 小さな棒の並び（`small_multiples_bar`） | 順位 | 総合評価 | 参照線・示唆ボックス | 準備中 |
| 指標別ランキング（`leaderboard`） | 順位 | 差 | スパークライン・順位変化 | 準備中 |

## 2. レイアウト（8パターン）

| ID | 名前 | 使っているレシピの数 |
|---|---|---|
| `p01_single` | 1つ（シングル） | 27 |
| `p02_top_bottom` | 2つ（上下分割） | 0 |
| `p03_left_right` | 2つ（左右並列） | 10 |
| `p04_three_columns` | 3つ（横並び3等分） | 0 |
| `p05_left_main_bottom` | 3つ（左1/3 ＋ 右上下3:1） | 1 |
| `p06_main_top_two_bottom` | 3つ（上主軸＋左右下） | 0 |
| `p07_two_top_conclusion` | 3つ（左右上＋下主軸） | 0 |
| `p08_grid_2x2` | 4つ（4分割グリッド） | 0 |

- 左右構成（`p03_left_right`）の幅：基本は主役 2/3・付け合わせ 1/3。右が主な答え、または左右が対等な時は 1/2：1/2。利用者は「幅」で 2/3・1/2・上下（`p02_top_bottom`、主役が上 62%）を選び直せる（行をそろえる付け合わせは上下にできない）。
- 右の上限：1/3 幅なら表8行・棒6項目、1/2 幅なら表10行・棒8項目、上下なら12項目。

## 3. レシピ一覧（チャート＋構成＋付け合わせ）

付け合わせの差分バー（`variance_bar`）は「中身」で、前回からの増減・伸び率（CAGR）・2つ目の指標を描き分ける。「料理専用」＝一品料理の表（料理×材料）からだけ出すレシピ（相談の一般の並べ方には入れない）。

### Trend（推移）

| レシピ | 問い | 主役 | 構成 | 付け合わせ（右・左・下） | チャート内の補完 | 必要なデータ | 備考 |
|---|---|---|---|---|---|---|---|
| 推移を見る（`TREND_LINE`） | 各系列はどう推移したか | 折れ線（`line`） | 1つ（シングル） | — | — | 行2以上 | — |
| 平均と比べた推移（`TREND_LINE_AVG`） | 平均より伸びているのはどこか | 折れ線（`line`） | 1つ（シングル） | — | 参照線 | 行2以上 | 目的：trend・comparison |
| 成長の軌跡と速さを見る（`TREND_CAGR_TABLE`） | 継続して伸びているのはどこか | 折れ線（`line`） | 2つ（左右並列）（2/3：1/3） | 右：表：CAGR表（`cagr_table`） | — | 時間の行・行2以上 | — |
| 成長の軌跡と牽引役を1枚で（`TREND_LINE_DELTA`） | いつ・どこが伸び（停滞し）、どこが成長を牽引したか | 折れ線（`line`） | 2つ（左右並列）（2/3：1/3） | 右：差分バー（`variance_bar`）・中身＝前回からの増減 | — | 時間の行・行3以上 | 目的：trend・comparison |
| 期間ごとの大きさを比べる（`TREND_COLUMN`） | 期間ごとの大きさはどう違うか | 縦棒（`column_trend`） | 1つ（シングル） | — | — | 行2以上 | — |
| 横向きで期間を並べる（`TREND_BAR`） | 期間ごとの大きさはどう違うか | 横棒（`bar_trend`） | 1つ（シングル） | — | — | 行2以上 | — |
| 全体と内訳の推移を見る（`TREND_STACKED`） | 全体の伸びは、どの内訳が支えたか | 積み上げ縦棒（`stacked_column`） | 1つ（シングル） | — | 合計ラベル | 行2以上 | 目的：trend・composition |
| 量と率を1枚で（`TREND_COMBO`） | 量が伸びる中で、率（利益率など）はどう動いたか | 縦棒＋折れ線（`combo`） | 1つ（シングル） | — | — | 時間の行・行2以上 | 相談からは出さない |
| 構成比の変化と、増加への寄与を1枚で（`TREND_SHARE_DELTA`） | どの項目が全体の増加に寄与し、構成比はどう変わったか | 100%積み上げ縦棒（`stacked_100`） | 2つ（左右並列）（2/3：1/3） | 右：差分バー（`variance_bar`）・中身＝前回からの増減 | — | 行2以上 | 料理専用、目的：trend・composition |
| 構成比の変化と、伸びの速さを1枚で（`TREND_SHARE_CAGR`） | 構成比はどう変わり、どの項目がどれだけの速さで伸びたか | 100%積み上げ縦棒（`stacked_100`） | 2つ（左右並列）（2/3：1/3） | 右：表：CAGR表（`cagr_table`） | — | 時間の行・行2以上 | 料理専用、目的：trend・composition |
| 全体の拡大と、増加への寄与を1枚で（`TREND_STACKED_DELTA`） | 全体はどれだけ伸び、どの項目が最も寄与したか | 積み上げ縦棒（`stacked_column`） | 2つ（左右並列）（2/3：1/3） | 右：差分バー（`variance_bar`）・中身＝前回からの増減 | 合計ラベル | 行2以上 | 料理専用、目的：trend・composition |
| 全体の拡大と、項目ごとの伸び率を1枚で（`TREND_STACKED_CAGR`） | 全体はどれだけ伸び、どの項目が速く伸びたか | 積み上げ縦棒（`stacked_column`） | 2つ（左右並列）（2/3：1/3） | 右：表：CAGR表（`cagr_table`） | 合計ラベル | 時間の行・行2以上 | 料理専用、目的：trend・composition |

### Comparison（比較）

| レシピ | 問い | 主役 | 構成 | 付け合わせ（右・左・下） | チャート内の補完 | 必要なデータ | 備考 |
|---|---|---|---|---|---|---|---|
| 2時点の入れ替わりを見る（`TREND_SLOPE`） | 最初と最後で、順位や差はどう変わったか | スロープ（`slope`） | 1つ（シングル） | — | — | 時間の行・行2以上 | 目的：comparison・trend |
| 2つの指標の変化を並べる（`TREND_SLOPE_PAIR`） | 2つの指標で、伸びた項目は同じか | 2指標スロープ（`slope_pair`） | 1つ（シングル） | — | — | 時間の行・行2以上 | 相談からは出さない、目的：comparison・trend |
| 順位を見る（`COMP_RANK`） | 最新の時点で、上位はどこか | 横棒ランキング（`bar_rank`） | 1つ（シングル） | — | — | 行1以上 | — |
| 今の順位と、前回からの増減を1枚で（`COMP_RANK_DELTA`） | 今どこが大きく、前回からどれだけ動いたか | 横棒ランキング（`bar_rank`） | 2つ（左右並列）（2/3：1/3） | 右：差分バー（`variance_bar`）・中身＝前回からの増減・行をそろえる | — | 行2以上 | 料理専用、目的：comparison・trend |
| 今の順位と、伸びの速さを1枚で（`COMP_RANK_CAGR`） | 今どこが大きく、どこが速く伸びているか | 横棒ランキング（`bar_rank`） | 2つ（左右並列）（2/3：1/3） | 右：差分バー（`variance_bar`）・中身＝伸び率（CAGR）・行をそろえる | — | 時間の行・行2以上 | 料理専用、目的：comparison・trend |
| 2つの指標を、同じ行で比べる（`COMP_RANK_METRIC2`） | 別の指標で見ても、同じ順位か | 横棒ランキング（`bar_rank`） | 2つ（左右並列）（1/2：1/2） | 右：差分バー（`variance_bar`）・中身＝2つ目の指標・行をそろえる | — | 行1以上・2つ目の表 | 料理専用、相談からは出さない |
| 指標を変えると、順位はどう動くか（`COMP_RANK_SLOPE`） | 別の指標で見ると、順位は入れ替わるか | 指標間の順位スロープ（`rank_slope`） | 1つ（シングル） | — | — | 行1以上・2つ目の表 | 相談からは出さない |
| 平均と比べた順位（`COMP_RANK_AVG`） | 平均を上回っているのはどこか | 横棒ランキング（`bar_rank`） | 1つ（シングル） | — | 参照線 | 行1以上 | — |
| 大小を並べて比べる（`COMP_COLUMN`） | 項目の大小はどう違うか | 縦棒比較（`column_compare`） | 1つ（シングル） | — | — | 行1以上 | — |
| 開始と終了の変化を強調する（`START_END_CAGR`） | 期間の最初と最後で、どこがどれだけ変わったか | 集合縦棒（`clustered_column`） | 1つ（シングル） | — | 伸び率注記（CAGR） | 時間の行・行2以上 | 目的：comparison・trend |
| 2つの差を比べる（`COMP_TWO_DELTA`） | 2つ（計画と実績、前年と今年など）で、項目ごとにどれだけ違うか | 集合縦棒（`clustered_column`） | 1つ（シングル） | — | 増減ラベル | 行2以上 | — |
| 増えた・減ったを分けて見る（`COMP_VARIANCE`） | どこが増えて、どこが減ったか | 差分バー（`variance_bar`） | 1つ（シングル） | — | — | 行2以上 | — |

### Composition（構成）

| レシピ | 問い | 主役 | 構成 | 付け合わせ（右・左・下） | チャート内の補完 | 必要なデータ | 備考 |
|---|---|---|---|---|---|---|---|
| 構成比の変化を見る（`TREND_SHARE`） | 構成比はどう変わったか | 100%積み上げ縦棒（`stacked_100`） | 1つ（シングル） | — | — | 行2以上 | 目的：composition・trend |
| 全体の拡大と構成の変化を見る（`SIZE_MIX_CAGR`） | 全体の成長を、どの内訳が支えているか | 積み上げ縦棒（`stacked_column`） | 2つ（左右並列）（2/3：1/3） | 右：表：CAGR表（`cagr_table`） | 合計ラベル | 時間の行・行2以上 | 目的：composition・trend |
| 1時点の構成を見る（`MIX_SNAPSHOT`） | 最新の時点で、内訳はどうなっているか | 100%横棒（`bar_100`） | 1つ（シングル） | — | — | 行1以上 | — |
| 2時点の構成を比べる（`MIX_BAR100`） | 最初と最後で、構成はどう違うか | 100%横棒（`bar_100`） | 1つ（シングル） | — | — | 行2以上 | 目的：composition・comparison |
| 規模と構成を1枚で（`MIX_MEKKO`） | どこが大きく、中身はどうなっているか | Mekko（`mekko`） | 1つ（シングル） | — | — | 行2以上 | — |
| 規模と構成に成長率を添える（`MIX_MEKKO_GROWTH`） | どこが大きく、どこが伸びているか | Mekko（`mekko`） | 3つ（左1/3 ＋ 右上下3:1） | 左：100%積み上げ縦棒（`stacked_100`）・行をそろえる<br>下：表：成長率表（`growth_table`） | — | 行2以上・2つ目の表 | — |
| カテゴリごとにシェアの変化を見る（`MIX_PAIR_SHARE`） | カテゴリごとに、誰のシェアが増えて誰が減ったか | 2期間の積み上げ（`share_pair`） | 1つ（シングル） | — | — | 行1以上・2つ目の表 | 目的：composition・comparison |

### Contribution（要因）

| レシピ | 問い | 主役 | 構成 | 付け合わせ（右・左・下） | チャート内の補完 | 必要なデータ | 備考 |
|---|---|---|---|---|---|---|---|
| 増減を要因に分解する（`CONTRIB_WATERFALL`） | 始点から終点まで、何がどれだけ効いたか | ウォーターフォール（`waterfall`） | 1つ（シングル） | — | — | 行3以上 | — |
| 一番効いた要因を見る（`CONTRIB_DRIVERS`） | どの要因が一番効いたか | 要因バー（`driver_bar`） | 1つ（シングル） | — | — | 行3以上 | — |
| 増加要因と減少要因を分けて見る（`CONTRIB_POSNEG`） | 何が押し上げ、何が押し下げたか | プラス・マイナスバー（`posneg_bar`） | 1つ（シングル） | — | — | 行3以上 | — |

### Relationship（関係）

| レシピ | 問い | 主役 | 構成 | 付け合わせ（右・左・下） | チャート内の補完 | 必要なデータ | 備考 |
|---|---|---|---|---|---|---|---|
| 2つの指標の関係を見る（`REL_SCATTER`） | 一方が大きいほど、もう一方も大きいか | 散布図（`scatter`） | 1つ（シングル） | — | — | 行3以上 | — |
| 4つに分けて位置づける（`REL_QUADRANT`） | どの項目が、どの位置（象限）にいるか | 散布図（`scatter`） | 1つ（シングル） | — | 象限 | 行4以上 | — |
| 関係と規模を1枚で（`REL_BUBBLE`） | 関係の中で、規模の大きい項目はどこにいるか | バブル（`bubble`） | 1つ（シングル） | — | — | 行3以上 | — |
| 規模と水準を1枚で（`REL_VARIABLE_WIDTH`） | 規模の大きい項目は、水準が高いのか低いのか | 幅が変わる縦棒（`variable_width`） | 1つ（シングル） | — | 参照線 | 行3以上 | 目的：relationship・comparison |

## 4. エディタで付け合わせを付け替えられるチャート

補完パーツ「右側に並べる」で、付ける・外す・替える。付け替えてもデータは変わらず、レシピ（レイアウト）だけが変わる。

| 主役のチャート | 付け合わせ（中身） | 形（先頭が既定） |
|---|---|---|
| 折れ線（`line`） | 増加額（前回からの増減） | 差分バー／増減表／ウォーターフォール（項目が全体を構成する時だけ） |
| 折れ線（`line`） | 伸び率（CAGR） | 表／横棒 |
| 積み上げ縦棒（`stacked_column`） | 増加額（前回からの増減） | 差分バー／増減表／ウォーターフォール（項目が全体を構成する時だけ） |
| 積み上げ縦棒（`stacked_column`） | 伸び率（CAGR） | 表／横棒 |
| 100%積み上げ縦棒（`stacked_100`） | 増加額（前回からの増減） | 差分バー／増減表／ウォーターフォール（項目が全体を構成する時だけ） |
| 100%積み上げ縦棒（`stacked_100`） | 伸び率（CAGR） | 表／横棒 |
| 横棒ランキング（`bar_rank`） | 増加額（前回からの増減） | 棒／数値だけ（行をそろえる） |
| 横棒ランキング（`bar_rank`） | 伸び率（CAGR） | 棒／数値だけ（行をそろえる） |
| 横棒ランキング（`bar_rank`） | 2つ目の指標 | 棒／数値だけ（行をそろえる） |

## 5. チャート内の補完パーツ（描画済み）

| チャート | 補完パーツ |
|---|---|
| Mekko（`mekko`） | 揃えた表（`aligned_table`）・増減ラベル（`delta_labels`） |
| 折れ線（`line`） | 伸び率注記（CAGR）（`cagr_note`）・参照線（`reference_line`） |
| 積み上げ縦棒（`stacked_column`） | 伸び率注記（CAGR）（`cagr_note`）・合計ラベル（`total_labels`） |
| 100%積み上げ縦棒（`stacked_100`） | 合計ラベル（`total_labels`） |
| 横棒ランキング（`bar_rank`） | 参照線（`reference_line`） |
| 縦棒比較（`column_compare`） | 参照線（`reference_line`） |
| 集合縦棒（`clustered_column`） | 増減ラベル（`delta_labels`）・伸び率注記（CAGR）（`cagr_note`）・合計の増減（`total_change`） |
| 差分バー（`variance_bar`） | 合計の増減（`total_change`） |
| スロープ（`slope`） | 合計の増減（`total_change`） |
| 2指標スロープ（`slope_pair`） | 合計の増減（`total_change`） |
| 2期間の積み上げ（`share_pair`） | 全体（合計）のペア（`total_category`） |
| 100%横棒（`bar_100`） | 合計ラベル（`total_labels`） |
| 散布図（`scatter`） | 象限（`quadrants`） |
| バブル（`bubble`） | 象限（`quadrants`） |
| 幅が変わる縦棒（`variable_width`） | 参照線（`reference_line`） |
| 縦棒＋折れ線（`combo`） | 開始から終了までの変化（`series_change`）・参照線（`reference_line`）・合計ラベル（`total_labels`） |

## 6. 料理（伝えたいこと）× 材料（チャート）

適合度：DIRECT_FIT＝そのまま／CONDITIONAL_FIT＝条件を満たす時だけ／SWITCH_RECOMMENDED＝勧め先をリードにし、選んだチャートは別案に残す。条件 ID は `docs/dish-matrix.md` 3章。Story の Route の役割（roles）もここに持っている。

### Trend（推移）

#### 変化の軌跡（`trajectory`）— 全体はどう変わってきたか

proof_needs：`OVERALL_CHANGE`　／　Route の役割：AIMED.IMPACT、DIAGNOSIS.SYMPTOM、URGENCY.INFLECTION

| 材料 | 適合度 | 条件 | 構成（plate） | 別案 | 勧め先 |
|---|---|---|---|---|---|
| 折れ線（`line`） | DIRECT_FIT | PERIODS_3PLUS | TREND_LINE | TREND_STACKED | TREND_SLOPE slope_change=none |
| 縦棒（`column_trend`） | DIRECT_FIT | — | TREND_COLUMN | TREND_LINE | TREND_LINE |
| 積み上げ縦棒（`stacked_column`） | DIRECT_FIT | ADDITIVE | TREND_STACKED | TREND_LINE | TREND_LINE |
| 100%積み上げ縦棒（`stacked_100`） | SWITCH_RECOMMENDED | — | TREND_SHARE | — | TREND_STACKED<br>TREND_LINE |
| スロープ（`slope`） | CONDITIONAL_FIT | PERIODS_2 | TREND_SLOPE slope_change=none | — | TREND_LINE |

#### 伸びの速さ（`growth_rate`）— どれくらいの速さで伸びたか

proof_needs：`GROWTH_SPEED`　／　Route の役割：URGENCY.INFLECTION、BUSINESS_CASE.VALUE_POOL

| 材料 | 適合度 | 条件 | 構成（plate） | 別案 | 勧め先 |
|---|---|---|---|---|---|
| 折れ線（`line`） | DIRECT_FIT | PERIODS_3PLUS＋CAGR_CALCULABLE | TREND_LINE＋cagr_note | TREND_CAGR_TABLE | TREND_SLOPE slope_change=cagr |
| 縦棒（`column_trend`） | SWITCH_RECOMMENDED | — | TREND_COLUMN | — | TREND_LINE＋cagr_note<br>TREND_CAGR_TABLE |
| 積み上げ縦棒（`stacked_column`） | DIRECT_FIT | ADDITIVE＋CAGR_CALCULABLE | TREND_STACKED_CAGR<br>（FEW_SERIES の時：TREND_STACKED＋cagr_note） | TREND_LINE＋cagr_note | TREND_LINE＋cagr_note |
| 100%積み上げ縦棒（`stacked_100`） | CONDITIONAL_FIT | WITH_MIX_CHANGE＋ABSOLUTE_BASE_AVAILABLE＋CAGR_CALCULABLE（確認：with_mix） | TREND_SHARE_CAGR | — | TREND_STACKED＋cagr_note<br>TREND_LINE＋cagr_note |
| スロープ（`slope`） | CONDITIONAL_FIT | PERIODS_2 | TREND_SLOPE slope_change=cagr | — | TREND_LINE＋cagr_note |

#### 成長の牽引役（`growth_driver`）— どの項目が全体の増加に寄与したか

proof_needs：`CONTRIBUTION`＋`OVERALL_CHANGE`　／　Route の役割：AIMED.EXPLANATION、DIAGNOSIS.DRIVER

| 材料 | 適合度 | 条件 | 構成（plate） | 別案 | 勧め先 |
|---|---|---|---|---|---|
| 折れ線（`line`） | DIRECT_FIT | MULTI_SERIES＋PARTS_FORM_WHOLE | TREND_LINE_DELTA | TREND_STACKED_DELTA | TREND_LINE |
| 積み上げ縦棒（`stacked_column`） | DIRECT_FIT | MULTI_SERIES＋PARTS_FORM_WHOLE | TREND_STACKED_DELTA | TREND_LINE_DELTA | TREND_STACKED |
| 100%積み上げ縦棒（`stacked_100`） | CONDITIONAL_FIT | WITH_MIX_CHANGE＋ABSOLUTE_BASE_AVAILABLE＋MULTI_SERIES＋PARTS_FORM_WHOLE（確認：with_mix） | TREND_SHARE_DELTA | — | TREND_STACKED_DELTA<br>TREND_LINE_DELTA |
| 縦棒（`column_trend`） | SWITCH_RECOMMENDED | — | TREND_COLUMN | — | TREND_STACKED_DELTA<br>TREND_LINE_DELTA |
| スロープ（`slope`） | CONDITIONAL_FIT | PERIODS_2＋MULTI_SERIES | TREND_SLOPE＋total_change slope_change=diff | — | TREND_LINE_DELTA |

#### 構成の変化（`mix_change`）— 内訳の比率はどう動いたか

proof_needs：`MIX_CHANGE`　／　Route の役割：AIMED.MISMATCH

| 材料 | 適合度 | 条件 | 構成（plate） | 別案 | 勧め先 |
|---|---|---|---|---|---|
| 100%積み上げ縦棒（`stacked_100`） | DIRECT_FIT | MULTI_SERIES | TREND_SHARE | TREND_STACKED | TREND_STACKED |
| 積み上げ縦棒（`stacked_column`） | SWITCH_RECOMMENDED | — | TREND_STACKED | — | TREND_SHARE |
| 折れ線（`line`） | SWITCH_RECOMMENDED | — | TREND_LINE | — | TREND_SHARE |
| 縦棒（`column_trend`） | SWITCH_RECOMMENDED | — | TREND_COLUMN | — | TREND_SHARE |
| スロープ（`slope`） | SWITCH_RECOMMENDED | — | TREND_SLOPE | — | TREND_SHARE |

### Comparison（比較）

#### 順位（`ranking`）— どこが最も大きいか

proof_needs：`RANKING`　／　Route の役割：CHOICE.OPTIONS

| 材料 | 適合度 | 条件 | 構成（plate） | 別案 | 勧め先 |
|---|---|---|---|---|---|
| 横棒ランキング（`bar_rank`） | DIRECT_FIT | — | COMP_RANK | COMP_RANK_DELTA<br>COMP_RANK_CAGR | COMP_RANK |
| 縦棒比較（`column_compare`） | DIRECT_FIT | — | COMP_COLUMN | COMP_RANK | COMP_RANK |
| 集合縦棒（`clustered_column`） | SWITCH_RECOMMENDED | — | START_END_CAGR | — | COMP_RANK<br>COMP_RANK_DELTA |
| 差分バー（`variance_bar`） | SWITCH_RECOMMENDED | — | COMP_VARIANCE | — | COMP_RANK<br>COMP_RANK_DELTA |
| 指標間の順位スロープ（`rank_slope`） | SWITCH_RECOMMENDED | — | COMP_RANK_SLOPE highlight=@max_rank_shift | — | COMP_RANK |

#### 差の大きさ（`gap`）— どれだけ差があるか

proof_needs：`SEGMENT_DIFFERENCE`　／　Route の役割：AIMED.MISMATCH、DIAGNOSIS.LOCATION

| 材料 | 適合度 | 条件 | 構成（plate） | 別案 | 勧め先 |
|---|---|---|---|---|---|
| 横棒ランキング（`bar_rank`） | DIRECT_FIT | PERIODS_2PLUS | COMP_RANK_DELTA side_ratio=half | COMP_VARIANCE | COMP_RANK |
| 差分バー（`variance_bar`） | DIRECT_FIT | PERIODS_2PLUS | COMP_VARIANCE | COMP_RANK_DELTA<br>COMP_TWO_DELTA | COMP_RANK |
| 集合縦棒（`clustered_column`） | DIRECT_FIT | PERIODS_2PLUS | COMP_TWO_DELTA | COMP_VARIANCE | COMP_RANK |
| 縦棒比較（`column_compare`） | SWITCH_RECOMMENDED | — | COMP_COLUMN | — | COMP_TWO_DELTA<br>COMP_VARIANCE |
| 指標間の順位スロープ（`rank_slope`） | SWITCH_RECOMMENDED | — | COMP_RANK_SLOPE highlight=@max_rank_shift | — | COMP_RANK_DELTA<br>COMP_VARIANCE |

#### 目標・平均との差（`target_gap`）— 基準からどれだけ離れているか

proof_needs：`TARGET_GAP`　／　Route の役割：DIAGNOSIS.SYMPTOM、TRANSFORMATION.GAP

| 材料 | 適合度 | 条件 | 構成（plate） | 別案 | 勧め先 |
|---|---|---|---|---|---|
| 横棒ランキング（`bar_rank`） | DIRECT_FIT | — | COMP_RANK_AVG | COMP_VARIANCE | COMP_RANK_AVG |
| 縦棒比較（`column_compare`） | DIRECT_FIT | — | COMP_COLUMN＋reference_line | COMP_RANK_AVG | COMP_RANK_AVG |
| 差分バー（`variance_bar`） | DIRECT_FIT | PERIODS_2PLUS | COMP_VARIANCE variance_sort=asc | COMP_RANK_AVG | COMP_RANK_AVG |
| 集合縦棒（`clustered_column`） | SWITCH_RECOMMENDED | — | START_END_CAGR | — | COMP_RANK_AVG<br>COMP_VARIANCE |
| 指標間の順位スロープ（`rank_slope`） | SWITCH_RECOMMENDED | — | COMP_RANK_SLOPE highlight=@max_rank_shift | — | COMP_RANK_AVG |

#### 2つの指標のバランス（`balance`）— 別の指標でも同じ結果か

proof_needs：`SECOND_METRIC`　／　Route の役割：AIMED.MISMATCH、CHOICE.TRADE_OFFS

| 材料 | 適合度 | 条件 | 構成（plate） | 別案 | 勧め先 |
|---|---|---|---|---|---|
| 横棒ランキング（`bar_rank`） | DIRECT_FIT | — | COMP_RANK_METRIC2 | COMP_RANK_SLOPE highlight=@max_rank_shift | COMP_RANK_METRIC2 |
| 縦棒比較（`column_compare`） | SWITCH_RECOMMENDED | — | COMP_COLUMN | — | COMP_RANK_METRIC2<br>COMP_RANK_SLOPE highlight=@max_rank_shift |
| 集合縦棒（`clustered_column`） | SWITCH_RECOMMENDED | — | START_END_CAGR | — | COMP_RANK_METRIC2<br>COMP_RANK_SLOPE highlight=@max_rank_shift |
| 差分バー（`variance_bar`） | SWITCH_RECOMMENDED | — | COMP_VARIANCE | — | COMP_RANK_METRIC2<br>COMP_RANK_SLOPE highlight=@max_rank_shift |
| 指標間の順位スロープ（`rank_slope`） | DIRECT_FIT | — | COMP_RANK_SLOPE highlight=@max_rank_shift | COMP_RANK_METRIC2 | COMP_RANK_SLOPE highlight=@max_rank_shift |

### Composition（構成）

#### 現在の構成（`current_mix`）— 今は何で構成されているか

proof_needs：`CURRENT_MIX`　／　Route の役割：AIMED.IMPACT

| 材料 | 適合度 | 条件 | 構成（plate） | 別案 | 勧め先 |
|---|---|---|---|---|---|
| 100%横棒（`bar_100`） | DIRECT_FIT | — | MIX_SNAPSHOT | MIX_BAR100 | MIX_SNAPSHOT |
| Mekko（`mekko`） | DIRECT_FIT | — | MIX_MEKKO | MIX_SNAPSHOT | MIX_MEKKO |
| 2期間の積み上げ（`share_pair`） | SWITCH_RECOMMENDED | — | MIX_PAIR_SHARE | — | MIX_SNAPSHOT<br>MIX_MEKKO |

#### 構成の変化（`mix_shift`）— 比率はどう動いたか

proof_needs：`MIX_CHANGE`　／　Route の役割：AIMED.MISMATCH

| 材料 | 適合度 | 条件 | 構成（plate） | 別案 | 勧め先 |
|---|---|---|---|---|---|
| 100%横棒（`bar_100`） | DIRECT_FIT | PERIODS_2PLUS | MIX_BAR100 | TREND_SHARE | MIX_SNAPSHOT |
| 2期間の積み上げ（`share_pair`） | DIRECT_FIT | — | MIX_PAIR_SHARE | MIX_BAR100 | MIX_PAIR_SHARE |
| Mekko（`mekko`） | SWITCH_RECOMMENDED | — | MIX_MEKKO | — | MIX_BAR100<br>TREND_SHARE |

#### 全体規模と構成（`size_and_mix`）— 大きさと中身を1枚で

proof_needs：`SIZE_CONTEXT`＋`CURRENT_MIX`　／　Route の役割：BUSINESS_CASE.VALUE_POOL

| 材料 | 適合度 | 条件 | 構成（plate） | 別案 | 勧め先 |
|---|---|---|---|---|---|
| Mekko（`mekko`） | DIRECT_FIT | — | MIX_MEKKO mekko_labels=abs_pct | MIX_MEKKO_GROWTH | MIX_MEKKO |
| 100%横棒（`bar_100`） | SWITCH_RECOMMENDED | — | MIX_SNAPSHOT | — | MIX_MEKKO<br>SIZE_MIX_CAGR |
| 2期間の積み上げ（`share_pair`） | SWITCH_RECOMMENDED | — | MIX_PAIR_SHARE | — | MIX_MEKKO<br>SIZE_MIX_CAGR |

#### 特定項目の比率（`item_share`）— 特定の項目の占める割合は

proof_needs：`ITEM_SHARE`　／　Route の役割：DIAGNOSIS.LOCATION

| 材料 | 適合度 | 条件 | 構成（plate） | 別案 | 勧め先 |
|---|---|---|---|---|---|
| 100%横棒（`bar_100`） | DIRECT_FIT | PERIODS_2PLUS | MIX_BAR100 highlight=@max_share_change | TREND_SHARE highlight=@max_share_change<br>MIX_SNAPSHOT | MIX_SNAPSHOT highlight=@max_share_change |
| 2期間の積み上げ（`share_pair`） | DIRECT_FIT | — | MIX_PAIR_SHARE highlight=@max_share_change | MIX_BAR100 highlight=@max_share_change | MIX_PAIR_SHARE highlight=@max_share_change |
| Mekko（`mekko`） | SWITCH_RECOMMENDED | — | MIX_MEKKO | — | MIX_BAR100 highlight=@max_share_change<br>MIX_SNAPSHOT |

### Contribution（要因）

#### 増加要因（`increase`）— 何が増加に寄与したか

proof_needs：`CONTRIBUTION`　／　Route の役割：DIAGNOSIS.DRIVER

| 材料 | 適合度 | 条件 | 構成（plate） | 別案 | 勧め先 |
|---|---|---|---|---|---|
| ウォーターフォール（`waterfall`） | DIRECT_FIT | — | CONTRIB_WATERFALL driver_sort=positive_first | CONTRIB_DRIVERS driver_sort=positive_first | CONTRIB_WATERFALL |
| 要因バー（`driver_bar`） | DIRECT_FIT | — | CONTRIB_DRIVERS driver_sort=positive_first | CONTRIB_WATERFALL driver_sort=positive_first | CONTRIB_DRIVERS |
| プラス・マイナスバー（`posneg_bar`） | SWITCH_RECOMMENDED | — | CONTRIB_POSNEG | — | CONTRIB_DRIVERS driver_sort=positive_first<br>CONTRIB_WATERFALL driver_sort=positive_first |

#### 減少要因（`decrease`）— 何が減少に寄与したか

proof_needs：`CONTRIBUTION`　／　Route の役割：DIAGNOSIS.DRIVER

| 材料 | 適合度 | 条件 | 構成（plate） | 別案 | 勧め先 |
|---|---|---|---|---|---|
| ウォーターフォール（`waterfall`） | DIRECT_FIT | — | CONTRIB_WATERFALL driver_sort=negative_first | CONTRIB_DRIVERS driver_sort=negative_first | CONTRIB_WATERFALL |
| 要因バー（`driver_bar`） | DIRECT_FIT | — | CONTRIB_DRIVERS driver_sort=negative_first | CONTRIB_POSNEG | CONTRIB_DRIVERS |
| プラス・マイナスバー（`posneg_bar`） | SWITCH_RECOMMENDED | — | CONTRIB_POSNEG | — | CONTRIB_DRIVERS driver_sort=negative_first<br>CONTRIB_WATERFALL driver_sort=negative_first |

#### 始点から終点への変化（`bridge`）— AからBへ何が変化を生んだか

proof_needs：`BRIDGE`　／　Route の役割：AIMED.EXPLANATION、DIAGNOSIS.DRIVER

| 材料 | 適合度 | 条件 | 構成（plate） | 別案 | 勧め先 |
|---|---|---|---|---|---|
| ウォーターフォール（`waterfall`） | DIRECT_FIT | — | CONTRIB_WATERFALL driver_sort=input | CONTRIB_WATERFALL<br>CONTRIB_DRIVERS | CONTRIB_WATERFALL |
| 要因バー（`driver_bar`） | SWITCH_RECOMMENDED | — | CONTRIB_DRIVERS | — | CONTRIB_WATERFALL driver_sort=input |
| プラス・マイナスバー（`posneg_bar`） | SWITCH_RECOMMENDED | — | CONTRIB_POSNEG | — | CONTRIB_WATERFALL driver_sort=input |

#### プラス・マイナスのバランス（`posneg`）— 増やした項目と減らした項目は

proof_needs：`BRIDGE`　／　Route の役割：PROOF.EVIDENCE

| 材料 | 適合度 | 条件 | 構成（plate） | 別案 | 勧め先 |
|---|---|---|---|---|---|
| プラス・マイナスバー（`posneg_bar`） | DIRECT_FIT | — | CONTRIB_POSNEG | CONTRIB_WATERFALL | CONTRIB_POSNEG |
| ウォーターフォール（`waterfall`） | SWITCH_RECOMMENDED | — | CONTRIB_WATERFALL | — | CONTRIB_POSNEG<br>CONTRIB_DRIVERS |
| 要因バー（`driver_bar`） | SWITCH_RECOMMENDED | — | CONTRIB_DRIVERS | — | CONTRIB_POSNEG |

### Relationship（関係）

#### 相関（`correlation`）— 2つの指標は連動しているか

proof_needs：`RELATIONSHIP`　／　Route の役割：PROOF.EVIDENCE

| 材料 | 適合度 | 条件 | 構成（plate） | 別案 | 勧め先 |
|---|---|---|---|---|---|
| 散布図（`scatter`） | DIRECT_FIT | — | REL_SCATTER show_corr=true | REL_QUADRANT | REL_SCATTER show_corr=true |
| バブル（`bubble`） | DIRECT_FIT | — | REL_BUBBLE show_corr=true | REL_SCATTER show_corr=true | REL_BUBBLE |
| 幅が変わる縦棒（`variable_width`） | SWITCH_RECOMMENDED | — | REL_VARIABLE_WIDTH | — | REL_SCATTER show_corr=true |

#### 重点領域（`focus_area`）— どの領域に位置づけられるか

proof_needs：`POSITIONING`　／　Route の役割：CHOICE.OPTIONS

| 材料 | 適合度 | 条件 | 構成（plate） | 別案 | 勧め先 |
|---|---|---|---|---|---|
| 散布図（`scatter`） | DIRECT_FIT | — | REL_QUADRANT highlight=@top_right | REL_BUBBLE＋quadrants | REL_QUADRANT |
| バブル（`bubble`） | DIRECT_FIT | — | REL_BUBBLE＋quadrants highlight=@top_right | REL_QUADRANT | REL_BUBBLE＋quadrants |
| 幅が変わる縦棒（`variable_width`） | SWITCH_RECOMMENDED | — | REL_VARIABLE_WIDTH | — | REL_QUADRANT highlight=@top_right |

#### 規模を含めた位置づけ（`size_position`）— 大きさも含めてどこにいるか

proof_needs：`POSITIONING`＋`SIZE_CONTEXT`　／　Route の役割：CHOICE.TRADE_OFFS

| 材料 | 適合度 | 条件 | 構成（plate） | 別案 | 勧め先 |
|---|---|---|---|---|---|
| バブル（`bubble`） | DIRECT_FIT | — | REL_BUBBLE | REL_VARIABLE_WIDTH | REL_BUBBLE |
| 幅が変わる縦棒（`variable_width`） | DIRECT_FIT | — | REL_VARIABLE_WIDTH | REL_BUBBLE | REL_VARIABLE_WIDTH |
| 散布図（`scatter`） | SWITCH_RECOMMENDED | — | REL_SCATTER | — | REL_BUBBLE<br>REL_VARIABLE_WIDTH |

#### 象限別の分類（`quadrant`）— どのグループに入るか

proof_needs：`POSITIONING`　／　Route の役割：CHOICE.CRITERIA

| 材料 | 適合度 | 条件 | 構成（plate） | 別案 | 勧め先 |
|---|---|---|---|---|---|
| 散布図（`scatter`） | DIRECT_FIT | — | REL_QUADRANT | REL_BUBBLE＋quadrants | REL_QUADRANT |
| バブル（`bubble`） | DIRECT_FIT | — | REL_BUBBLE＋quadrants | REL_QUADRANT | REL_BUBBLE＋quadrants |
| 幅が変わる縦棒（`variable_width`） | SWITCH_RECOMMENDED | — | REL_VARIABLE_WIDTH | — | REL_QUADRANT |

## 7. 関連ドキュメント

- `docs/registry-spec.md`：設計書（9/23 版。レシピの追加分は未反映）
- `docs/layouts.pdf`：レイアウト8パターンの図
- `docs/composition-review.md`：主役×付け合わせの精査と決定
- `docs/dish-matrix.md`：料理の表（v0.7）
- `docs/proof-needs-vocabulary.md`：proof_needs の語彙
