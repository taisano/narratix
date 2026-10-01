import { readCell, splitTsv, tableFromGrid, type ParsedTable } from './dataCheck';
import { dropDataBound, type BuilderState } from './state';

export type Tab = 'current' | 'base';

/** 入力文字列 → 数値（桁区切りの , や全角の ，、空白を除く）。空や数値でなければ null */
export function parseNumber(v: string): number | null {
  // ▲120・(120)・12%・1,200千円・全角数字なども読む（読み方は dataCheck.ts の readCell。% は 12% → 12）
  return readCell(v).value;
}

const clone = (s: BuilderState): BuilderState => structuredClone(s);

/** 設定の中で、行名・列名を指しているもの（強調、比較の対象、表示する行・列など）を書き換える */
function renameInControls(n: BuilderState, from: string, to: string | null) {
  for (const [k, v] of Object.entries(n.controls)) {
    if (v === from) { if (to == null) delete n.controls[k as keyof BuilderState['controls']]; else n.controls[k as keyof BuilderState['controls']] = to; }
    else if (Array.isArray(v)) n.controls[k as keyof BuilderState['controls']] = to == null ? v.filter((x) => x !== from) : v.map((x) => (x === from ? to : x));
  }
  n.mekko.growthRows = to == null
    ? n.mekko.growthRows.filter((g) => g !== `series:${from}`)
    : n.mekko.growthRows.map((g) => (g === `series:${from}` ? `series:${to}` : g));
}

export function setCell(s: BuilderState, tab: Tab, r: number, c: number, v: number | null): BuilderState {
  const n = clone(s);
  n.dataset.periods[tab].values[r]![c] = v;
  return n;
}

export function addRow(s: BuilderState, name: string): BuilderState {
  const n = clone(s);
  n.dataset.rows.push(name);
  for (const p of [n.dataset.periods.current, n.dataset.periods.base]) p.values.push(n.dataset.cols.map(() => null));
  if (n.dataset.groups) n.dataset.groups.push(null);
  // 表示する行を絞っていれば、足した行も表示する
  if (Array.isArray(n.controls.items)) n.controls.items = [...n.controls.items, name];
  return n;
}

export function addCol(s: BuilderState, name: string): BuilderState {
  const n = clone(s);
  n.dataset.cols.push(name);
  for (const p of [n.dataset.periods.current, n.dataset.periods.base]) p.values.forEach((r) => r.push(null));
  if (Array.isArray(n.controls.series)) n.controls.series = [...n.controls.series, name];
  return n;
}

export function deleteRow(s: BuilderState, i: number): BuilderState {
  const n = clone(s);
  const [name] = n.dataset.rows.splice(i, 1);
  for (const p of [n.dataset.periods.current, n.dataset.periods.base]) p.values.splice(i, 1);
  n.dataset.groups?.splice(i, 1);
  renameInControls(n, name!, null);
  return n;
}

export function deleteCol(s: BuilderState, k: number): BuilderState {
  const n = clone(s);
  const [name] = n.dataset.cols.splice(k, 1);
  for (const p of [n.dataset.periods.current, n.dataset.periods.base]) p.values.forEach((r) => r.splice(k, 1));
  renameInControls(n, name!, null);
  return n;
}

/** 行・列をまとめて消す（後ろから消すので、位置がずれない）。行・列はそれぞれ2つは残す */
export function deleteMany(s: BuilderState, rows: number[], cols: number[]): BuilderState {
  let n = s;
  const keep = (idx: number[], len: number) => [...new Set(idx)].filter((i) => i >= 0 && i < len).sort((a, b) => b - a).slice(0, Math.max(0, len - 2));
  for (const k of keep(cols, s.dataset.cols.length)) n = deleteCol(n, k);
  for (const i of keep(rows, s.dataset.rows.length)) n = deleteRow(n, i);
  return n;
}

/** 行名を変えたら、その行を指す設定も追従させる */
export function renameRow(s: BuilderState, i: number, name: string): BuilderState {
  const n = clone(s);
  const old = n.dataset.rows[i]!;
  n.dataset.rows[i] = name;
  renameInControls(n, old, name);
  return n;
}

/** 列名を変えたら、成長率の行・強調などの設定も追従させる */
export function renameCol(s: BuilderState, k: number, name: string): BuilderState {
  const n = clone(s);
  const old = n.dataset.cols[k]!;
  n.dataset.cols[k] = name;
  renameInControls(n, old, name);
  return n;
}

/**
 * Excel などからの貼り付け（タブ区切り・改行区切り）。
 * c0 = -1 は行名の列から貼る。足りない行・列は増やす。
 */
export function pasteTsv(
  s: BuilderState, tab: Tab, r0: number, c0: number, text: string,
  names: { row: (n: number) => string; col: (n: number) => string },
): BuilderState {
  const lines = text.replace(/\r/g, '').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  let n = s;
  lines.forEach((ln, i) => {
    const r = r0 + i;
    while (r >= n.dataset.rows.length) n = addRow(n, names.row(n.dataset.rows.length + 1));
    ln.split('\t').forEach((v, j) => {
      const c = c0 + j;
      if (c === -1) { if (v.trim()) n = renameRow(n, r, v.trim()); return; }
      while (c >= n.dataset.cols.length) n = addCol(n, names.col(n.dataset.cols.length + 1));
      n = setCell(n, tab, r, c, parseNumber(v));
    });
  });
  // 行の名前を全部貼り替えた＝別のデータ。前のデータに結びついた文字の設定（軸の名前・左右の出典・合計の名前など）は外す
  const before = s.dataset.rows;
  if (c0 === -1 && r0 === 0 && before.length > 0 && before.every((name, i) => n.dataset.rows[i] !== name)) n = { ...n, controls: dropDataBound(n.controls) };
  return n;
}

/** 貼り付けとして扱うか（タブか改行を含む） */
export const isTabular = (text: string) => /[\t\n]/.test(text.replace(/\n$/, ''));

/**
 * 貼り付けた表で、データを置き換える（「Excel・表から貼り付け」）。
 * 1行目が数字でなければ列の名前、1列目が数字でなければ行の名前として読む。左上のセルは行が表すもの（例：地域）。
 */
export function parseTable(text: string): ParsedTable | null {
  const { grid } = splitTsv(text);
  return tableFromGrid(grid.filter((r) => r.some((c) => c !== '')));
}

/** 1行（1項目）ごとのグループ名を設定する（散布図・バブルの色分け）。空なら消す */
export function setGroup(s: BuilderState, i: number, v: string): BuilderState {
  const n = clone(s);
  const g = n.dataset.groups ?? n.dataset.rows.map(() => null);
  g[i] = v.trim() ? v : null;
  n.dataset.groups = g.some((x) => x) ? g : undefined;
  if (!n.dataset.groups) delete n.dataset.groups;
  return n;
}

/**
 * 文字だけの列（数値が1つも無く、文字がある列）。散布図・バブルでは、これをグループとして読む
 */
export function textColumns(t: NonNullable<ReturnType<typeof parseTable>>): number[] {
  return t.cols.map((_, k) => k).filter((k) => t.values.every((r) => r[k] == null) && t.raw.some((r) => (r[k] ?? '').trim() !== ''));
}

export function replaceWithTable(s: BuilderState, tab: Tab, t0: NonNullable<ReturnType<typeof parseTable>>, opts: { groupsFromText?: boolean } = {}): BuilderState {
  const n = clone(s);
  // 横長の表として貼り直したら、縦長の表からの切り出しはやめる
  delete n.dataset.long;
  // 散布図・バブル：文字だけの列の最初の1つをグループとして取り出す
  let t = t0;
  const gk = opts.groupsFromText ? textColumns(t0)[0] : undefined;
  delete n.dataset.groups;
  if (gk != null) {
    const keep = t0.cols.map((_, k) => k).filter((k) => k !== gk);
    t = { ...t0, cols: keep.map((k) => t0.cols[k]!), values: t0.values.map((r) => keep.map((k) => r[k] ?? null)), raw: t0.raw.map((r) => keep.map((k) => r[k] ?? '')) };
    n.dataset.groups = t0.raw.map((r) => (r[gk] ?? '').trim() || null);
  }
  const empty = () => t.rows.map(() => t.cols.map(() => null as number | null));
  const sameShape = t.rows.length === s.dataset.rows.length && t.cols.length === s.dataset.cols.length;
  n.dataset.rows = [...t.rows];
  n.dataset.cols = [...t.cols];
  // 左上の見出しは行の名前。列の名前は貼った表からは分からないので空にする（前のデータの名前を残さない）
  if (t.corner) n.dataset.dimensions = { rows: t.corner, cols: sameShape ? n.dataset.dimensions?.cols ?? '' : '' };
  if (gk != null) n.dataset.dimensions = { ...(n.dataset.dimensions ?? {}), group: t0.cols[gk] };
  const other: Tab = tab === 'current' ? 'base' : 'current';
  n.dataset.periods[tab] = { ...n.dataset.periods[tab], values: t.values };
  // 形の違う新しいデータ：もう一方の表は空にし、期間（2指標スロープでは指標）の名前も前のデータのものを残さない
  if (!sameShape) {
    n.dataset.periods[other] = { label: '', values: empty() };
    if (t.rows.join('\u0000') !== s.dataset.rows.join('\u0000') && t.cols.join('\u0000') !== s.dataset.cols.join('\u0000')) n.dataset.periods[tab].label = '';
  }
  // 表示する行・列の絞り込みは外す（名前が変わるため）。名前が変わったら、データに結びついた設定（軸の名前・出典・合計の名前など）も外す
  delete n.controls.items;
  delete n.controls.series;
  const renamed = t.rows.join('\u0000') !== s.dataset.rows.join('\u0000') || t.cols.join('\u0000') !== s.dataset.cols.join('\u0000');
  if (renamed) n.controls = dropDataBound(n.controls);
  return n;
}
