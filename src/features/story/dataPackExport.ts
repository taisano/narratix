import { EXEC_SUMMARY_ROLE, type Locale } from '@/registry';
import { storyDisplayTitle, type StoryState } from './model';
import {
  DATA_PACK_LIMITS, overviewIncludes,
  type DataRequestImportance, type DataValueType, type StoryDataPackPlan, type StoryDataRequest, type StoryDataRequestField,
} from './dataPackPlan';

/**
 * Story データパックの中身（00_Overview と、依頼ごとの入力シート）を、Excel の形に依らない表として組み立てる。
 * 実際の .xlsx への書き出しは dataPackXlsx.ts。ここは計算だけなので、テストで中身を確かめられる。
 * 入力シートは「1行目＝列見出し、2行目から入力」の縦長の表にする（そのままエディタに貼り付けて読み込める形）。
 * 数値の項目は空欄にし、入力例は Dimension（項目名など）にだけ置く
 */

/** 文字だけ（数式として読まれないよう、書き出しでも文字列として書く） */
export interface PackCell { value: string; bold?: boolean; fill?: string; wrap?: boolean; muted?: boolean }
export interface PackSheet { name: string; widths: number[]; rows: (PackCell | null)[][]; stickyRows: number }
export interface DataPackBook { sheets: PackSheet[] }

// ──────────── 文言（ブックの言語は Story の slideLocale に従う） ────────────

const TEXT = {
  ja: {
    overview: '00_Overview', fallbackSheet: 'データ', story: 'Story', purpose: '明らかにしたいこと', background: '背景', consultation: '元の相談',
    questions: 'Storyの流れ', datasets: 'Dataset一覧', sharedKeys: '共通キー', rules: '入力ルール', fields: '各シートの項目',
    colSheet: 'シート', colRole: 'Storyでの役割', colGrain: '1行の粒度', colImportance: '重要度', colQuestions: '使うQuestion',
    colField: '列名', colDesc: '説明', colType: '型', colUnit: '単位', colRequired: '必須', yes: '必須', no: '任意', example: '例：',
    required: '必須', recommended: '推奨', optional: '任意', text: '文字', number: '数値', percent: '割合（%）', date: '期間・日付',
    keyLine: '{sheet}：{keys}', keyNote: '共通キーの名称や分類は、シートをまたいで同じ表記に揃えてください。',
    defaultRules: [
      '値は集計済みの実数で入力してください（率や構成比はアプリで計算します）。',
      '取得できない項目は、空欄にせず N/A と入力してください。',
      '行の名称（市場・地域・商品など）は、他のシートと同じ表記に揃えてください。',
    ],
  },
  en: {
    overview: '00_Overview', fallbackSheet: 'Data', story: 'Story', purpose: 'What we want to clarify', background: 'Background', consultation: 'Original request',
    questions: 'Story flow', datasets: 'Datasets', sharedKeys: 'Shared keys', rules: 'Input rules', fields: 'Fields by sheet',
    colSheet: 'Sheet', colRole: 'Role in the Story', colGrain: 'One row is', colImportance: 'Priority', colQuestions: 'Questions served',
    colField: 'Column', colDesc: 'Description', colType: 'Type', colUnit: 'Unit', colRequired: 'Required', yes: 'Required', no: 'Optional', example: 'e.g. ',
    required: 'Required', recommended: 'Recommended', optional: 'Optional', text: 'Text', number: 'Number', percent: 'Percent (%)', date: 'Period / date',
    keyLine: '{sheet}: {keys}', keyNote: 'Use the same names and categories for shared keys across sheets.',
    defaultRules: [
      'Enter aggregated actual numbers (the app calculates rates and shares).',
      'If a value is not available, enter N/A instead of leaving it blank.',
      'Use the same spelling for row names (market, region, product, …) across sheets.',
    ],
  },
} as const;

const fmt = (tpl: string, vars: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');

// ──────────── シート名（Excel の決まり：31文字まで・使えない文字あり・重複不可・大文字小文字を区別しない） ────────────

const SHEET_NAME_MAX = 31;
const FORBIDDEN = /[\\/?*[\]:]/g;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;

/** 31文字（UTF-16）までに切る。サロゲートペアの途中では切らない */
const cut = (s: string, max: number): string => {
  let out = '';
  for (const ch of s) {
    if (out.length + ch.length > max) break;
    out += ch;
  }
  return out;
};

/** 使えない文字を _ に、前後の空白と ' を外し、31文字に収め、既に使った名前（大文字小文字を区別しない）と重ならないようにする。taken に追記する */
export function safeSheetName(raw: string, taken: Set<string>, fallback = 'Data'): string {
  let base = raw.replace(CONTROL, ' ').replace(FORBIDDEN, '_').trim().replace(/^'+|'+$/g, '').trim();
  // Excel は "History" をシート名に使えない
  if (!base || base.toLowerCase() === 'history') base = base ? `${base}_` : fallback;
  base = cut(base, SHEET_NAME_MAX);
  let name = base;
  for (let n = 2; taken.has(name.toLowerCase()); n++) {
    const suffix = `_${n}`;
    name = cut(base, SHEET_NAME_MAX - suffix.length) + suffix;
  }
  taken.add(name.toLowerCase());
  return name;
}

// ──────────── 組み立て ────────────

const HEAD_FILL = '#DDE6F0';
const H = (value: string): PackCell => ({ value, bold: true, fill: HEAD_FILL, wrap: true });
const C = (value: string): PackCell => ({ value, wrap: true });

/** 列幅の目安：全角は2、半角は1として数え、狭すぎず広すぎないようにする */
const widthOf = (s: string, min = 14, max = 40): number => {
  let w = 0;
  for (const ch of s) w += /[\u0000-ÿ]/.test(ch) ? 1 : 2;
  return Math.max(min, Math.min(max, w + 6));
};

const headerLabel = (f: StoryDataRequestField): string => (f.unit ? `${f.label}（${f.unit}）` : f.label);

/** Overview に出す「Storyの流れ」：メインの Question を並びの順に（確認事項・Executive Summary は除く） */
function questionFlow(story: StoryState): string[] {
  return story.slides
    .filter((s) => s.section === 'MAIN' && s.questionPriority !== 'COACHING_ONLY' && s.routeRole !== EXEC_SUMMARY_ROLE && s.question.trim())
    .map((s, i) => `${i + 1}. ${s.question.trim()}`);
}

const importanceText = (t: (typeof TEXT)[Locale], v: DataRequestImportance): string => t[v];
const typeText = (t: (typeof TEXT)[Locale], v: DataValueType): string => t[v];

/**
 * データパックの全シートを組み立てる。
 * Overview は plan.overview の公開の指定に従う（元の相談文は既定で入らない）。
 * シートの並びは 00_Overview → 依頼の順（01_…）。依頼が無ければ Overview だけになる
 */
export function buildDataPackBook(story: StoryState, plan: StoryDataPackPlan, locale: Locale = story.slideLocale): DataPackBook {
  const t = TEXT[locale];
  const taken = new Set<string>();
  const overviewName = safeSheetName(t.overview, taken);
  const requests = plan.requests;
  const sheetNames = requests.map((r, i) => safeSheetName(`${String(i + 1).padStart(2, '0')}_${r.label.trim() || t.fallbackSheet}`, taken, t.fallbackSheet));
  const questionText = (r: StoryDataRequest): string =>
    r.questionRefs.map((id) => story.slides.find((s) => s.id === id)?.question.trim()).filter(Boolean).join(' / ');

  // ── 00_Overview
  const rows: (PackCell | null)[][] = [];
  const row = (...cells: (PackCell | null)[]) => rows.push(cells);
  const gap = () => rows.push([null]);
  const cap = (s: string) => s.slice(0, DATA_PACK_LIMITS.long);

  row(H(t.story), C(plan.overview.titleOverride || storyDisplayTitle(story)));
  const purpose = plan.overview.purposeOverride ?? story.decisionQuestion;
  if (overviewIncludes(plan, 'purpose') && purpose.trim()) row(H(t.purpose), C(cap(purpose)));
  const background = plan.overview.backgroundOverride ?? '';
  if (overviewIncludes(plan, 'background') && background.trim()) row(H(t.background), C(cap(background)));
  if (overviewIncludes(plan, 'consultation') && story.consultation.trim()) row(H(t.consultation), C(cap(story.consultation)));
  const flow = questionFlow(story);
  if (overviewIncludes(plan, 'questions') && flow.length) row(H(t.questions), C(flow.join('\n')));

  if (overviewIncludes(plan, 'datasets') && requests.length) {
    gap();
    row(H(t.datasets));
    row(H(t.colSheet), H(t.colRole), H(t.colGrain), H(t.colImportance), H(t.colQuestions));
    requests.forEach((r, i) => row(C(sheetNames[i]!), C(r.role), C(r.grain.join(' × ')), C(importanceText(t, r.importance)), C(questionText(r))));
    const keyLines = requests
      .map((r, i) => ({ r, name: sheetNames[i]!, keys: r.sharedKeys.map((id) => r.fields.find((f) => f.id === id)?.label).filter(Boolean) as string[] }))
      .filter((x) => x.keys.length)
      .map((x) => fmt(t.keyLine, { sheet: x.name, keys: x.keys.join(', ') }));
    if (keyLines.length) { gap(); row(H(t.sharedKeys), C([...keyLines, t.keyNote].join('\n'))); }
  }

  if (overviewIncludes(plan, 'rules')) {
    gap();
    row(H(t.rules), C(cap(plan.overview.rulesOverride ?? t.defaultRules.join('\n'))));
  }

  // 各シートの項目（説明・型・単位・必須）。入力シートは見出しだけにして、貼り付けやすさを保つ
  if (overviewIncludes(plan, 'datasets') && requests.length) {
    gap();
    row(H(t.fields));
    requests.forEach((r, i) => {
      row(H(sheetNames[i]!), C(r.label));
      row(H(t.colField), H(t.colDesc), H(t.colType), H(t.colUnit), H(t.colRequired));
      for (const f of r.fields) row(C(f.label), C(f.description), C(typeText(t, f.valueType)), C(f.unit ?? ''), C(f.required ? t.yes : t.no));
    });
  }

  const overview: PackSheet = { name: overviewName, widths: [20, 40, 28, 14, 30], rows, stickyRows: 0 };

  // ── 入力シート
  const inputs: PackSheet[] = requests.map((r, i) => {
    const hasExample = r.fields.some((f) => f.kind === 'dimension' && f.example);
    const body: (PackCell | null)[][] = [r.fields.map((f) => ({ value: headerLabel(f), bold: true, fill: HEAD_FILL, wrap: true }))];
    // 入力例は Dimension にだけ（数値の欄は空のまま。例を実際の値と取り違えさせない）
    if (hasExample) body.push(r.fields.map((f) => (f.kind === 'dimension' && f.example ? { value: `${t.example}${f.example}`, muted: true } : null)));
    return { name: sheetNames[i]!, widths: r.fields.map((f) => widthOf(headerLabel(f))), rows: body, stickyRows: 1 };
  });

  return { sheets: [overview, ...inputs] };
}

/** メールで依頼する時の件名と本文（Workbook はダウンロードしたものを添付してもらう）。公開してよい情報だけ使う */
export function dataPackMail(story: StoryState, plan: StoryDataPackPlan, locale: Locale = story.slideLocale): { subject: string; body: string; filename: string } {
  const title = plan.overview.titleOverride || storyDisplayTitle(story) || TEXT[locale].story;
  const names = plan.requests.map((r) => r.label.trim()).filter(Boolean);
  const list = names.map((n) => `- ${n}`).join('\n');
  return locale === 'ja'
    ? {
        subject: `【データ提供のお願い】${title}`,
        body: `${title} のために、次のデータをご提供いただけますか。\n\n${list}\n\n添付の Excel の先頭シート（00_Overview）に、背景と入力のルールを書いています。各シートの1行目の列名に合わせて入力してください。`,
        filename: `${title}_データパック.xlsx`,
      }
    : {
        subject: `[Data request] ${title}`,
        body: `Could you provide the following data for ${title}?\n\n${list}\n\nThe first sheet (00_Overview) of the attached Excel file explains the background and the input rules. Please fill in each sheet using the column names in its first row.`,
        filename: `${title}_data-pack.xlsx`,
      };
}
