/**
 * 「汚れた実データ」のテストセット（すべて架空）。| はタブ（Excel からの貼り付け）。
 * expect：読み取った表（行・列・値）と、出すべき診断（codes）・出してはいけない診断（not）
 */
export interface DirtyCase {
  name: string;
  group: 'basic' | 'dirty' | 'broken';
  text: string;
  expect: {
    rows?: string[]; cols?: string[]; values?: (number | null)[][];
    codes?: string[]; not?: string[]; unit?: string | null; error?: boolean;
  };
}
const T = (s: string) => s.trim().split('\n').map((l) => l.split('|').join('\t')).join('\n');

export const DIRTY_CASES: DirtyCase[] = [
  // ── A. 基本（10） ──
  { name: '年×地域の売上', group: 'basic', text: T('年|北米|欧州|中国\n2023|100|80|60\n2024|110|82|75\n2025|125|85|90'), expect: { rows: ['2023', '2024', '2025'], cols: ['北米', '欧州', '中国'], codes: [], not: ['unreadable'] } },
  { name: '部門×費目', group: 'basic', text: T('部門|人件費|広告費|その他\n営業|500|120|30\n開発|800|10|50'), expect: { rows: ['営業', '開発'], values: [[500, 120, 30], [800, 10, 50]], codes: [] } },
  { name: '製品×売上・利益率', group: 'basic', text: T('製品|売上|利益率\nA|1,200|12%\nB|800|8.5%'), expect: { values: [[1200, 12], [800, 8.5]], not: ['percentMix', 'unreadable'] } },
  { name: '月次推移', group: 'basic', text: T('月|売上\n1月|100\n2月|120\n3月|90'), expect: { rows: ['1月', '2月', '3月'], values: [[100], [120], [90]] } },
  { name: '予算対実績', group: 'basic', text: T('部門|予算|実績\n営業|100|95\n開発|80|88'), expect: { cols: ['予算', '実績'], codes: [] } },
  { name: '構成比（%）', group: 'basic', text: T('製品|シェア\nA|45%\nB|35%\nC|20%'), expect: { values: [[45], [35], [20]], unit: '%', codes: ['unitRead'] } },
  { name: '営業利益ブリッジ（▲）', group: 'basic', text: T('項目|金額\n前年|500\n価格|30\n数量|▲20\n費用|▲15\n今年|495'), expect: { values: [[500], [30], [-20], [-15], [495]], codes: ['negatives'] } },
  { name: 'アンケート結果', group: 'basic', text: T('設問|満足|普通|不満\nQ1|60%|30%|10%\nQ2|40%|40%|20%'), expect: { values: [[60, 30, 10], [40, 40, 20]], unit: '%' } },
  { name: '市場規模（億円）', group: 'basic', text: T('地域|2025\n日本|120億円\n米国|480億円'), expect: { values: [[120], [480]], unit: '億円', not: ['unitMix'] } },
  { name: '複数年（年が横）', group: 'basic', text: T('地域|2021|2022|2023|2024|2025\n北米|320|345|372|398|430\n欧州|280|286|295|301|310'), expect: { cols: ['2021', '2022', '2023', '2024', '2025'], rows: ['北米', '欧州'] } },

  // ── B. 汚れたデータ（14） ──
  { name: 'タイトル行と出典', group: 'dirty', text: T('2025年 地域別売上（億円）\n地域|2024|2025\n北米|100|120\n欧州|90|95\n出典：社内データ'), expect: { rows: ['北米', '欧州'], codes: ['titleRows', 'noteRows'] } },
  { name: '空白行・空白列', group: 'dirty', text: T('地域||2024|2025\n北米||100|120\n\n欧州||90|95'), expect: { rows: ['北米', '欧州'], cols: ['2024', '2025'], codes: ['blankLines', 'blankCols'] } },
  { name: '合計・小計の行', group: 'dirty', text: T('地域|売上\n北米|100\n欧州|90\n小計|190\n中国|60\n合計|250'), expect: { rows: ['北米', '欧州', '中国'], codes: ['totalRows'] } },
  { name: '合計の列', group: 'dirty', text: T('地域|A|B|Total\n北米|10|20|30\n欧州|5|5|10'), expect: { cols: ['A', 'B'], codes: ['totalCols'] } },
  { name: '同じ列名', group: 'dirty', text: T('地域|売上|売上\n北米|1|2'), expect: { codes: ['dupCols'] } },
  { name: '同じ項目名（合算しない）', group: 'dirty', text: T('地域|売上\n北米|1\n北米|2\n欧州|3'), expect: { rows: ['北米', '北米', '欧州'], values: [[1], [2], [3]], codes: ['dupRows'] } },
  { name: '負数の表記いろいろ', group: 'dirty', text: T('項目|値\nA|▲120\nB|(120)\nC|−120\nD|△5'), expect: { values: [[-120], [-120], [-120], [-5]], codes: ['negatives'] } },
  { name: '% と小数の混在', group: 'dirty', text: T('製品|シェア\nA|12%\nB|0.15\nC|30%'), expect: { values: [[12], [15], [30]], codes: ['percentMix'], unit: '%' } },
  { name: '千円と百万円の混在', group: 'dirty', text: T('製品|売上\nA|1,200千円\nB|1.5百万円\nC|2百万円'), expect: { values: [[1.2], [1.5], [2]], codes: ['unitMix'], unit: '百万円' } },
  { name: '違う種類の単位', group: 'dirty', text: T('項目|値\n売上|120億円\n社員|300人'), expect: { codes: ['unitConflict'] } },
  { name: '値が無い印（-・N/A・未定）', group: 'dirty', text: T('地域|2024|2025\n北米|100|-\n欧州|N/A|未定'), expect: { values: [[100, null], [null, null]], codes: ['missing'], not: ['unreadable'] } },
  { name: 'Excel のエラー', group: 'dirty', text: T('地域|成長率\n北米|#DIV/0!\n欧州|5'), expect: { values: [[null], [5]], codes: ['excelErrors'] } },
  { name: '全角数字・ノーブレークスペース', group: 'dirty', text: T('地域|売上\n北米|１２０\n欧州|1 200'), expect: { values: [[120], [1200]], not: ['unreadable'] } },
  { name: '欧州式の数', group: 'dirty', text: T('地域|a|b\nA|1.234,5|2.000\nB|3,5|4'), expect: { codes: ['european'] } },
  { name: 'セル内改行（引用符）', group: 'dirty', text: '地域\t売上\n"北米\n東部"\t100\n欧州\t90', expect: { rows: ['北米 東部', '欧州'], codes: ['inCellBreaks'] } },
  { name: '読めない文字', group: 'dirty', text: T('地域|売上\n北米|約100\n欧州|90'), expect: { values: [[null], [90]], codes: ['unreadable'] } },

  // ── C. 壊れたデータ（6） ──
  { name: '空', group: 'broken', text: '   \n\n', expect: { error: true, codes: ['empty'] } },
  { name: '数値が1つも無い', group: 'broken', text: T('地域|売上\n北米|高い\n欧州|低い'), expect: { error: true, codes: ['noNumbers'] } },
  { name: '1つだけ桁違い', group: 'broken', text: T('地域|売上\nA|100\nB|120\nC|90\nD|110000000'), expect: { codes: ['outlier'] } },
  { name: '大きすぎる貼り付け', group: 'broken', text: Array.from({ length: 2100 }, (_, i) => `r${i}\t${i}`).join('\n'), expect: { error: true, codes: ['tooLarge'] } },
  { name: '1e-12 と 1e12', group: 'broken', text: T('x|v\nA|1e-12\nB|1e12\nC|5'), expect: { values: [[1e-12], [1e12], [5]] } },
  { name: '全部同じ値', group: 'broken', text: T('x|v\nA|5\nB|5\nC|5'), expect: { values: [[5], [5], [5]], codes: [] } },
];
