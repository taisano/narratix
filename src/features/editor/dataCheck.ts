/**
 * 貼り付けたデータの健康診断（docs/decisions.md「実データ耐性」）。
 * 方針：間違ったチャートを、もっともらしく出さない。読めない・紛らわしいものは黙って変えず、
 * どのセルが・なぜ・どうするかを Coach の言葉で見せ、利用者が選べるようにする（AI は使わない。データはどこにも送らない）。
 *
 *   貼り付け（TSV・引用符・セル内改行）→ 表の範囲（タイトル・注記・空行）→ セルの読み方（数・%・負数・単位・欠損）
 *   → 構造（合計行・重複）→ 表（tableFromGrid）
 */

// ──────────── 1. セルの読み方 ────────────

export type CellKind = 'blank' | 'number' | 'missing' | 'error' | 'text';

export interface CellRead {
  kind: CellKind;
  /** 読めた数（% は 12% → 12。単位は掛けない：1,200千円 → 1200） */
  value: number | null;
  percent?: boolean;
  /** 規模の単位（千・百万・億・K・M…）と基本の単位（円・ドル…）を合わせたもの。例：千円、M、億 */
  unit?: string;
  /** 読み方の手がかり（診断で「▲120 をマイナスとして読みました」などと出す） */
  negative?: 'triangle' | 'paren';
  /** 1.200 のように、欧州式（. が桁区切り）とも読めるもの。その時の値 */
  europe?: number;
}

const MISSING = new Set(['-', '–', '—', '―', 'ー', '−', 'n/a', 'na', 'n.a.', 'none', 'null', '未定', 'なし', '該当なし', '不明', '…', '...', '*']);
const EXCEL_ERROR = /^#(DIV\/0!|VALUE!|REF!|NAME\?|NUM!|NULL!|N\/A|SPILL!|CALC!)$/i;
/** 規模の単位（大きい順に照合する） */
export const SCALES: [string, number][] = [
  ['百万', 1e6], ['千万', 1e7], ['兆', 1e12], ['億', 1e8], ['万', 1e4], ['千', 1e3],
  ['bn', 1e9], ['mn', 1e6], ['B', 1e9], ['M', 1e6], ['K', 1e3], ['k', 1e3],
];
const BASES = ['円', 'ドル', 'ユーロ', '元', 'ウォン', '人', '件', '台', '個', '社', '店', '回', 'kg', 't'];
const CURRENCY_PREFIX = /^(¥|\$|€|£|US\$|JPY|USD|EUR)\s*/i;

/** 全角の数字・記号を半角に。ノーブレークスペース・細いスペースは普通の空白に */
export function normalize(v: string): string {
  return v
    .replace(/[   　]/g, ' ')
    .replace(/[０-９．，－＋％（）]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[−‐‑–]/g, (c, i, s) => (/\d/.test(s[i + 1] ?? '') ? '-' : c))
    .trim();
}

export function readCell(raw: string): CellRead {
  let t = normalize(raw);
  if (t === '') return { kind: 'blank', value: null };
  if (EXCEL_ERROR.test(t)) return { kind: 'error', value: null };
  if (MISSING.has(t.toLowerCase())) return { kind: 'missing', value: null };
  let sign = 1;
  let negative: CellRead['negative'];
  if (/^[▲△]/.test(t)) { sign = -1; negative = 'triangle'; t = t.slice(1).trim(); }
  if (/^\(.*\)$/.test(t)) { sign = -1; negative = 'paren'; t = t.slice(1, -1).trim(); }
  t = t.replace(CURRENCY_PREFIX, '');
  let percent = false;
  if (/%$/.test(t)) { percent = true; t = t.slice(0, -1).trim(); }
  // 後ろの単位（規模＋基本）。例：千円、百万円、億、M、K、万人
  let unit = '';
  const base = BASES.find((b) => t.endsWith(b));
  if (base) { unit = base; t = t.slice(0, -base.length).trim(); }
  const scale = SCALES.find(([s]) => t.endsWith(s) && /[\d.]$/.test(t.slice(0, -s.length).trim()));
  if (scale) { unit = scale[0] + unit; t = t.slice(0, -scale[0].length).trim(); }
  if (/^-/.test(t) && sign === -1) return { kind: 'text', value: null };
  // 数：1,200 / 1 200（桁区切りの空白）/ 1.2e3
  const europe = /^-?\d{1,3}(\.\d{3})+$/.test(t) ? Number(t.replace(/\./g, '')) * sign : undefined;
  const plain = t.replace(/(\d)[ ,](?=\d{3}\b)/g, '$1');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(plain)) return { kind: 'text', value: null };
  const n = Number(plain) * sign;
  if (!Number.isFinite(n)) return { kind: 'text', value: null };
  return { kind: 'number', value: n, ...(percent ? { percent } : {}), ...(unit ? { unit } : {}), ...(negative ? { negative } : {}), ...(europe != null ? { europe } : {}) };
}

/** 欧州式（1.234,5）で読む時の値。読めなければ null */
export function readEuropean(raw: string): number | null {
  const t = normalize(raw).replace(/[▲△()%]/g, '');
  if (!/^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/.test(t)) return null;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  const neg = /^[▲△]|^\(/.test(normalize(raw)) ? -1 : 1;
  return Number.isFinite(n) ? n * neg : null;
}

// ──────────── 2. 貼り付け（TSV） ────────────

/** Excel の貼り付けを表に（タブ区切り。引用符の中の改行・タブも読む）。セル内の改行は空白にする */
export function splitTsv(text: string): { grid: string[][]; inCellBreaks: number } {
  const s = text.replace(/\r\n?/g, '\n');
  const grid: string[][] = [];
  let row: string[] = [], cell = '', q = false, breaks = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else if (c === '\n') { cell += ' '; breaks++; }
      else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === '\t') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); grid.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); grid.push(row); }
  return { grid: grid.map((r) => r.map((c) => c.trim())), inCellBreaks: breaks };
}

// ──────────── 3. 診断 ────────────

export type Level = 'error' | 'warning' | 'confirm' | 'info';

/** 利用者が選べること（既定はおすすめの方） */
export interface CheckOptions {
  /** 表の上のタイトル行・下の注記を外す */
  dropFrame: boolean;
  /** 合計・小計の行と列を外す */
  dropTotals: boolean;
  /** % の列にある 0.15 のような小数を 15% として読む */
  percentFix: boolean;
  /** 混ざった単位（千円と百万円など）を一番多い単位にそろえる */
  unitAlign: boolean;
  /** 欧州式（1.234,5）で読む */
  european: boolean;
}
export const DEFAULT_OPTIONS: CheckOptions = { dropFrame: true, dropTotals: true, percentFix: true, unitAlign: true, european: false };

export interface DataIssue {
  code: string;
  level: Level;
  /** メッセージの差し込み（件数・セル・名前など） */
  vars?: Record<string, string | number>;
  /** 問題のセル（A1 形式。貼った表の位置） */
  cells?: string[];
  /** 選べることがあれば、その設定 */
  option?: keyof CheckOptions;
}

export interface CheckResult {
  /** 表（読めなければ null） */
  table: ParsedTable | null;
  issues: DataIssue[];
  /** 表の大きさ・数値セル・単位の要約 */
  summary: { rows: number; cols: number; numbers: number; blanks: number; unit: string | null; percent: boolean };
}

export interface ParsedTable {
  rows: string[]; cols: string[]; values: (number | null)[][]; corner: string | null;
  hasColNames: boolean; hasRowNames: boolean; raw: string[][];
}

/** 列の文字（A, B, …, Z, AA） */
const colName = (k: number): string => (k < 26 ? String.fromCharCode(65 + k) : colName(Math.floor(k / 26) - 1) + String.fromCharCode(65 + (k % 26)));
const ref = (r: number, c: number) => `${colName(c)}${r + 1}`;
const TOTAL = /^(合計|総計|小計|総合計|計|全体計|total|totals|subtotal|sub-total|grand total|sum|all)$/i;
const NOTE = /^(出典|出所|資料|注|注記|備考|※|\*|source|sources|note|notes)[\s:：)）]?/i;
const isYear = (v: string) => /^(19|20)\d{2}$/.test(v);
export const LIMITS = { rows: 2000, cols: 200, warnRows: 300, warnCols: 50 };

/** 表（見出しの行・列を見分けて、値の表にする）。値の読み方は read で決める */
export function tableFromGrid(cells0: string[][], read: (raw: string, r: number, c: number) => number | null = (v) => readCell(v).value): ParsedTable | null {
  if (!cells0.length) return null;
  const width = Math.max(...cells0.map((r) => r.length));
  const cells = cells0.map((r) => [...r, ...Array(width - r.length).fill('')]);
  const isText = (v: string) => readCell(v).kind === 'text';
  const row0 = cells[0]!.slice(1);
  // 1行目：文字があれば列名。数字だけでも、すべて年で左上が空か文字なら列名（年が横に並ぶ表）
  const hasColNames = row0.some(isText) || (cells.length > 1 && row0.length > 0 && row0.every(isYear) && !(/\d/.test(cells[0]![0]!) && !isText(cells[0]![0]!)));
  const body = hasColNames ? cells.slice(1) : cells;
  const off = hasColNames ? 1 : 0;
  // 1列目：文字があれば行名。数字だけでも、すべて年なら行名（年が縦に並ぶ表）
  const col0 = body.map((r) => r[0]!);
  const hasRowNames = width > 1 && (col0.some(isText) || (col0.length > 0 && col0.every(isYear)));
  const c0 = hasRowNames ? 1 : 0;
  const cols = (hasColNames ? cells[0]!.slice(c0) : Array.from({ length: width - c0 }, () => '')).map((v, k) => v || `#${k + 1}`);
  const rows = body.map((r, i) => (hasRowNames ? r[0]! : '') || `#${i + 1}`);
  const values = body.map((r, i) => r.slice(c0).map((v, k) => read(v, i + off, k + c0)));
  if (!cols.length || !rows.length) return null;
  return { rows, cols, values, corner: hasColNames && hasRowNames ? cells[0]![0] || null : null, hasColNames, hasRowNames, raw: body.map((r) => r.slice(c0)) };
}

/**
 * 貼り付けを診断して、表にする。黙って変えることはせず、変えたこと・気になることを issues に並べる
 */
export function checkPaste(text: string, opts: CheckOptions = DEFAULT_OPTIONS): CheckResult {
  const issues: DataIssue[] = [];
  const empty: CheckResult = { table: null, issues, summary: { rows: 0, cols: 0, numbers: 0, blanks: 0, unit: null, percent: false } };
  const { grid: g0, inCellBreaks } = splitTsv(text);
  // 元の行番号を持ったまま、空の行を外す
  let lines = g0.map((cells, r) => ({ r, cells })).filter((l) => l.cells.some((c) => c !== ''));
  const blankLines = g0.length - lines.length;
  if (!lines.length) { issues.push({ code: 'empty', level: 'error' }); return empty; }
  if (lines.length > LIMITS.rows || Math.max(...lines.map((l) => l.cells.length)) > LIMITS.cols) {
    issues.push({ code: 'tooLarge', level: 'error', vars: { rows: lines.length, maxRows: LIMITS.rows, maxCols: LIMITS.cols } });
    return empty;
  }
  if (blankLines > 0) issues.push({ code: 'blankLines', level: 'info', vars: { n: blankLines } });
  if (inCellBreaks > 0) issues.push({ code: 'inCellBreaks', level: 'info', vars: { n: inCellBreaks } });

  // 列の空の列（全行が空）を外す
  const width0 = Math.max(...lines.map((l) => l.cells.length));
  const usedCols = Array.from({ length: width0 }, (_, k) => k).filter((k) => lines.some((l) => (l.cells[k] ?? '') !== ''));
  if (usedCols.length < width0) issues.push({ code: 'blankCols', level: 'info', vars: { n: width0 - usedCols.length } });
  lines = lines.map((l) => ({ r: l.r, cells: usedCols.map((k) => l.cells[k] ?? '') }));
  const origCol = (k: number) => usedCols[k] ?? k;

  // 表の上のタイトル・下の注記（1つのセルだけの行。注記は「出典」「注」などで始まる行も）
  const width = usedCols.length;
  const single = (l: { cells: string[] }) => width > 1 && l.cells.filter((c) => c !== '').length === 1 && l.cells[0] !== '';
  const top: typeof lines = [];
  while (lines.length > 2 && single(lines[0]!)) top.push(lines.shift()!);
  const bottom: typeof lines = [];
  while (lines.length > 2 && (single(lines[lines.length - 1]!) || NOTE.test(lines[lines.length - 1]!.cells[0]!))) bottom.unshift(lines.pop()!);
  if (top.length) issues.push({ code: 'titleRows', level: 'confirm', option: 'dropFrame', vars: { text: top.map((l) => l.cells[0]).join('／') }, cells: top.map((l) => ref(l.r, origCol(0))) });
  // タイトルと注記の両方がある時は、切り替えは1つ（タイトルの方）にまとめる
  if (bottom.length) issues.push({ code: 'noteRows', level: 'confirm', ...(top.length ? {} : { option: 'dropFrame' as const }), vars: { text: bottom.map((l) => l.cells.find((c) => c) ?? '').join('／').slice(0, 60) }, cells: bottom.map((l) => ref(l.r, origCol(0))) });
  if (!opts.dropFrame) lines = [...top, ...lines, ...bottom];

  // 欧州式の数（1.234,5）かもしれない
  const allCells = lines.flatMap((l) => l.cells);
  const euroLike = allCells.some((c) => /^\(?[▲△-]?\d{1,3}(\.\d{3})+(,\d+)?\)?%?$/.test(normalize(c)) || /^\(?[▲△-]?\d+,\d{1,2}\)?%?$/.test(normalize(c)));
  const usLike = allCells.some((c) => /^\(?[▲△-]?\d{1,3}(,\d{3})+(\.\d+)?\)?%?$/.test(normalize(c)) || /^\(?[▲△-]?\d+\.\d{1,2}\)?%?$/.test(normalize(c)));
  if (euroLike && !usLike) issues.push({ code: 'european', level: 'confirm', option: 'european' });

  // セルを読む（元の位置も持つ）
  type Cell = { raw: string; read: CellRead; r: number; c: number };
  const cellAt = (li: number, k: number): Cell => {
    const l = lines[li]!;
    const raw = l.cells[k] ?? '';
    const read = readCell(raw);
    if (opts.european && read.kind !== 'blank') {
      const e = readEuropean(raw);
      if (e != null) return { raw, read: { ...read, kind: 'number', value: e, europe: undefined }, r: l.r, c: origCol(k) };
    }
    return { raw, read, r: l.r, c: origCol(k) };
  };

  // 見出しを決めるため、まず読み方を変えずに表にする
  const plain = tableFromGrid(lines.map((l) => l.cells));
  if (!plain) { issues.push({ code: 'noTable', level: 'error' }); return empty; }
  const rOff = plain.hasColNames ? 1 : 0;
  const cOff = plain.hasRowNames ? 1 : 0;
  const nR = plain.rows.length, nC = plain.cols.length;
  const body: Cell[][] = Array.from({ length: nR }, (_, i) => Array.from({ length: nC }, (_, k) => cellAt(i + rOff, k + cOff)));

  // 合計・小計の行と列
  const totalRows = plain.hasRowNames ? plain.rows.map((n, i) => (TOTAL.test(normalize(n)) || /(合計|小計|total)$/i.test(normalize(n)) ? i : -1)).filter((i) => i >= 0) : [];
  const totalCols = plain.hasColNames ? plain.cols.map((n, k) => (TOTAL.test(normalize(n)) || /(合計|小計|total)$/i.test(normalize(n)) ? k : -1)).filter((k) => k >= 0) : [];
  if (totalRows.length) issues.push({ code: 'totalRows', level: 'confirm', option: 'dropTotals', vars: { names: totalRows.map((i) => plain.rows[i]).join('・') }, cells: totalRows.map((i) => ref(body[i]![0]!.r, origCol(0))) });
  if (totalCols.length) issues.push({ code: 'totalCols', level: 'confirm', option: 'dropTotals', vars: { names: totalCols.map((k) => plain.cols[k]).join('・') }, cells: totalCols.map((k) => ref(lines[0]!.r, body[0]?.[k]?.c ?? k)) });
  const keepR = plain.rows.map((_, i) => i).filter((i) => !(opts.dropTotals && totalRows.includes(i)));
  const keepC = plain.cols.map((_, k) => k).filter((k) => !(opts.dropTotals && totalCols.includes(k)));

  // 読めないセル・Excel のエラー・「-」「N/A」
  const kept = keepR.flatMap((i) => keepC.map((k) => body[i]![k]!));
  const unread = kept.filter((x) => x.read.kind === 'text');
  const errors = kept.filter((x) => x.read.kind === 'error');
  const missing = kept.filter((x) => x.read.kind === 'missing');
  const cellsOf = (xs: Cell[]) => xs.map((x) => ref(x.r, x.c));
  if (unread.length) issues.push({ code: 'unreadable', level: 'warning', cells: cellsOf(unread), vars: { n: unread.length, sample: unread[0]!.raw.slice(0, 20) } });
  if (errors.length) issues.push({ code: 'excelErrors', level: 'warning', cells: cellsOf(errors), vars: { n: errors.length, sample: errors[0]!.raw } });
  if (missing.length) issues.push({ code: 'missing', level: 'info', cells: cellsOf(missing), vars: { n: missing.length, sample: missing[0]!.raw } });
  const negs = kept.filter((x) => x.read.negative);
  if (negs.length) issues.push({ code: 'negatives', level: 'info', cells: cellsOf(negs), vars: { n: negs.length, sample: negs[0]!.raw } });

  // % と小数の混在（列ごと）
  const fixPct = new Set<Cell>();
  for (const k of keepC) {
    const col = keepR.map((i) => body[i]![k]!).filter((x) => x.read.kind === 'number');
    const pct = col.filter((x) => x.read.percent);
    const dec = col.filter((x) => !x.read.percent && Math.abs(x.read.value!) <= 1.5);
    if (pct.length && dec.length && pct.length + dec.length === col.length) {
      dec.forEach((x) => fixPct.add(x));
      issues.push({ code: 'percentMix', level: 'confirm', option: 'percentFix', cells: cellsOf(dec), vars: { col: plain.cols[k]!, pct: pct[0]!.raw, dec: dec[0]!.raw, as: fmtPct(dec[0]!.read.value! * 100) } });
    }
  }

  // 単位の混在（同じ基本単位で規模が違えば、そろえられる。基本単位が違えばそろえない）
  const unitCells = kept.filter((x) => x.read.kind === 'number' && x.read.unit);
  const units = [...new Set(unitCells.map((x) => x.read.unit!))];
  let unitTo: { unit: string; scale: number } | null = null;
  if (units.length > 1) {
    const baseOf = (u: string) => u.replace(/^(百万|千万|兆|億|万|千|bn|mn|B|M|K|k)/, '');
    const bases = new Set(units.map(baseOf));
    if (bases.size === 1) {
      const count = (u: string) => unitCells.filter((x) => x.read.unit === u).length;
      const top1 = [...units].sort((a, b) => count(b) - count(a))[0]!;
      unitTo = { unit: top1, scale: scaleOf(top1) };
      issues.push({ code: 'unitMix', level: 'confirm', option: 'unitAlign', vars: { units: units.join('・'), to: top1 }, cells: cellsOf(unitCells.filter((x) => x.read.unit !== top1)) });
    } else issues.push({ code: 'unitConflict', level: 'warning', vars: { units: units.join('・') }, cells: cellsOf(unitCells) });
  }
  // 単位の付いていない数と付いた数が混ざる
  const numCells = kept.filter((x) => x.read.kind === 'number');
  if (units.length && unitCells.length < numCells.length && unitCells.length > 0) {
    issues.push({ code: 'unitPartial', level: 'warning', vars: { unit: units[0]! }, cells: cellsOf(numCells.filter((x) => !x.read.unit).slice(0, 20)) });
  }

  // 重複した名前
  const dup = (xs: string[]) => [...new Set(xs.filter((x, i) => xs.indexOf(x) !== i))];
  const dupRows = plain.hasRowNames ? dup(keepR.map((i) => plain.rows[i]!)) : [];
  const dupCols = plain.hasColNames ? dup(keepC.map((k) => plain.cols[k]!)) : [];
  if (dupRows.length) issues.push({ code: 'dupRows', level: 'warning', vars: { names: dupRows.join('・') } });
  if (dupCols.length) issues.push({ code: 'dupCols', level: 'warning', vars: { names: dupCols.join('・') } });

  // 大きな表・極端な値
  if (keepR.length > LIMITS.warnRows || keepC.length > LIMITS.warnCols) issues.push({ code: 'large', level: 'warning', vars: { rows: keepR.length, cols: keepC.length } });
  const nums = numCells.map((x) => Math.abs(x.read.value!)).filter((v) => v > 0);
  if (nums.length >= 3) {
    const sorted = [...nums].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)]!;
    const big = numCells.filter((x) => med > 0 && Math.abs(x.read.value!) >= med * 1000);
    if (big.length && big.length <= 3) issues.push({ code: 'outlier', level: 'warning', cells: cellsOf(big), vars: { sample: big[0]!.raw } });
  }
  if (numCells.length === 0 && kept.length > 0) issues.push({ code: 'noNumbers', level: 'error' });

  // 表にする（選んだ読み方で）
  const valueOf = (x: Cell): number | null => {
    if (x.read.kind !== 'number') return null;
    let v = x.read.value!;
    if (opts.percentFix && fixPct.has(x)) v = round(v * 100);
    if (opts.unitAlign && unitTo && x.read.unit && x.read.unit !== unitTo.unit) v = round(v * scaleOf(x.read.unit) / unitTo.scale);
    return v;
  };
  const table: ParsedTable = {
    rows: keepR.map((i) => plain.rows[i]!), cols: keepC.map((k) => plain.cols[k]!),
    values: keepR.map((i) => keepC.map((k) => valueOf(body[i]![k]!))),
    corner: plain.corner, hasColNames: plain.hasColNames, hasRowNames: plain.hasRowNames,
    raw: keepR.map((i) => keepC.map((k) => body[i]![k]!.raw)),
  };
  const allPct = numCells.length > 0 && numCells.every((x) => x.read.percent || fixPct.has(x));
  const unit = allPct ? '%' : units.length === 1 && unitCells.length === numCells.length ? units[0]! : unitTo && opts.unitAlign && unitCells.length === numCells.length ? unitTo.unit : null;
  if (unit) issues.push({ code: 'unitRead', level: 'info', vars: { unit } });
  const values = table.values.flat();
  return {
    table: table.rows.length && table.cols.length ? table : null,
    issues,
    summary: { rows: table.rows.length, cols: table.cols.length, numbers: values.filter((v) => v != null).length, blanks: values.filter((v) => v == null).length, unit, percent: allPct },
  };
}

function scaleOf(unit: string): number {
  const s = SCALES.find(([p]) => unit.startsWith(p));
  return s ? s[1] : 1;
}
const round = (v: number) => Math.round(v * 1e9) / 1e9;
const fmtPct = (v: number) => `${Math.round(v * 100) / 100}%`;

/** 重さの順（エラー → 警告 → 確認 → 情報） */
export const LEVEL_ORDER: Level[] = ['error', 'warning', 'confirm', 'info'];
export const sortIssues = (xs: DataIssue[]) => [...xs].sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level));
