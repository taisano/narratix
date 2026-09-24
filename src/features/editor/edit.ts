import type { BuilderState } from './state';

export type Tab = 'current' | 'base';

/** 入力文字列 → 数値（桁区切りの , や全角の ，、空白を除く）。空や数値でなければ null */
export function parseNumber(v: string): number | null {
  const t = v.replace(/[,\s，]/g, '');
  if (t === '') return null;
  const n = Number(t.replace(/[０-９．－]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)));
  return Number.isFinite(n) ? n : null;
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
  return n;
}

/** 貼り付けとして扱うか（タブか改行を含む） */
export const isTabular = (text: string) => /[\t\n]/.test(text.replace(/\n$/, ''));
