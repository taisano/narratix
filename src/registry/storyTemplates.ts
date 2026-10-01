import type { LocalizedText } from './locale';

const L = (ja: string, en: string): LocalizedText => ({ ja, en });

/**
 * スライドの主役になる「表・言葉」の型（docs/story-spec.md 9章・表で整理／言葉でまとめる MVP 実装指示）。
 * チャートに付ける表（成長率表など、TABLES）とは別物。グラフの代わりにスライド全体をこの型で描く。
 * 型を足す時は、ここに足し、engine/layout/templates に描き方、features/templates に中身の形と入力欄を足す
 */
export const STORY_TEMPLATE_IDS = ['STORY_TABLE_COMPARISON', 'STORY_TABLE_KPI', 'STORY_TABLE_DELTA', 'STORY_TABLE_HEATMAP', 'STORY_TEXT_CONCLUSION_REASONS', 'STORY_TEXT_EXECUTIVE_SUMMARY', 'STORY_TEXT_ISSUE_INSIGHT_ACTION'] as const;
export type StoryTemplateId = (typeof STORY_TEMPLATE_IDS)[number];

/** 表で整理／言葉でまとめる */
export type StoryTemplateKind = 'table' | 'text';

export interface StoryTemplateDef {
  id: StoryTemplateId;
  kind: StoryTemplateKind;
  label: LocalizedText;
  /** 何のための型か（右の見せ方の欄に出す） */
  purpose: LocalizedText;
}

export const STORY_TEMPLATES: Record<StoryTemplateId, StoryTemplateDef> = {
  STORY_TABLE_COMPARISON: {
    id: 'STORY_TABLE_COMPARISON', kind: 'table', label: L('比較表', 'Comparison table'),
    purpose: L('複数の市場・商品・選択肢などを、同じ項目で比べます。', 'Compare several markets, products or options on the same criteria.'),
  },
  STORY_TABLE_KPI: {
    id: 'STORY_TABLE_KPI', kind: 'table', label: L('KPI スコアカード', 'KPI scorecard'),
    purpose: L('少数の重要な指標を、比較基準と増減と一緒にまとめます。', 'Sum up a few key indicators with their comparison and change.'),
  },
  STORY_TABLE_DELTA: {
    id: 'STORY_TABLE_DELTA', kind: 'table', label: L('増減付き表', 'Table with changes'),
    purpose: L('項目ごとの今の値と、前年・計画との差と率を並べます。', 'Show each item’s current value with its change against last year or plan.'),
  },
  STORY_TABLE_HEATMAP: {
    id: 'STORY_TABLE_HEATMAP', kind: 'table', label: L('ヒートマップ型の表', 'Heatmap table'),
    purpose: L('多くの項目を、値の大きさの色の濃さで見比べ、特徴を見つけます。', 'Spot patterns across many items by shading values by size.'),
  },
  STORY_TEXT_CONCLUSION_REASONS: {
    id: 'STORY_TEXT_CONCLUSION_REASONS', kind: 'text', label: L('結論＋3つの根拠', 'Conclusion + three reasons'),
    purpose: L('ご自身で書いた結論を、最大3つの根拠で支えます。', 'Support your own conclusion with up to three reasons.'),
  },
  STORY_TEXT_EXECUTIVE_SUMMARY: {
    id: 'STORY_TEXT_EXECUTIVE_SUMMARY', kind: 'text', label: L('Executive Summary', 'Executive summary'),
    purpose: L('ストーリー全体を1枚で：確認されたこと・差と例外・根拠・判断すること・前提。', 'The whole story on one slide: findings, exceptions, evidence, the decision and the boundary.'),
  },
  STORY_TEXT_ISSUE_INSIGHT_ACTION: {
    id: 'STORY_TEXT_ISSUE_INSIGHT_ACTION', kind: 'text', label: L('課題→示唆→アクション', 'Issue → insight → action'),
    purpose: L('課題から、そこから言えること、次に打つ手までを1枚でつなぎます。', 'Connect the issue, what it tells us and what to do next on one slide.'),
  },
};

/** 課題→示唆→アクションの枠。roles＝「参考」と「メッセージを入れる」で使う問いの役割 */
export const IIA_COL_IDS = ['issue', 'insight', 'action'] as const;
export type IiaColId = (typeof IIA_COL_IDS)[number];
export const IIA_COLS: Record<IiaColId, { label: LocalizedText; roles: string[] }> = {
  issue: { label: L('課題', 'Issue'), roles: ['AIMED.IMPACT', 'AIMED.MISMATCH'] },
  insight: { label: L('示唆', 'Insight'), roles: ['AIMED.EXPLANATION'] },
  action: { label: L('アクション', 'Action'), roles: ['AIMED.DECISION'] },
};
/** 1つの枠の推奨の行数・1行の文字数（超えても切らず、知らせる） */
export const IIA_LIMITS = { items: 4, text: 50, input: 8 } as const;

/**
 * Executive Summary の項目（docs/story-spec.md 14章）。名前は変えられるが、足したり消したりはしない。
 * roles＝「参考」と「メッセージを入れる」で使う問いの役割（AIMED）
 */
export const EXEC_BLOCK_IDS = ['overall', 'exceptions', 'evidence', 'decision', 'boundary'] as const;
export type ExecBlockId = (typeof EXEC_BLOCK_IDS)[number];
export const EXEC_BLOCKS: Record<ExecBlockId, { label: LocalizedText; roles: string[] }> = {
  overall: { label: L('全体として確認されたこと', 'What we found overall'), roles: ['AIMED.IMPACT'] },
  exceptions: { label: L('判断を変える差・例外', 'Differences and exceptions that matter'), roles: ['AIMED.MISMATCH'] },
  evidence: { label: L('重要な根拠', 'Key evidence'), roles: ['AIMED.EXPLANATION'] },
  decision: { label: L('今回判断・確認すること', 'What to decide or check now'), roles: ['AIMED.DECISION'] },
  boundary: { label: L('前提・範囲', 'Assumptions and scope'), roles: [] },
};

/** ストーリーの Executive Summary の問い（routeRole）。メインストーリーの先頭に置く */
export const EXEC_SUMMARY_ROLE = 'STORY.EXECUTIVE_SUMMARY';

/** Executive Summary の推奨の文字数（1項目。超えても切らず、知らせる） */
export const EXEC_LIMITS = { body: 120, free: 400 } as const;

/** 表で整理／言葉でまとめる、を選んだ時に最初に出す型（今は各1つ） */
export const TEMPLATE_OF_KIND: Record<StoryTemplateKind, StoryTemplateId> = {
  table: 'STORY_TABLE_COMPARISON',
  text: 'STORY_TEXT_CONCLUSION_REASONS',
};

/** 比較表の推奨の大きさ（超えても消さず、読みにくくなることを知らせる） */
export const COMPARISON_LIMITS = { maxCandidates: 5, minCandidates: 2, maxCriteria: 8, minCriteria: 3 } as const;

/** ヒートマップ型の表の推奨の大きさ（多くの項目を見比べるので、比較表より大きい） */
export const HEAT_LIMITS = { maxCols: 10, maxRows: 15 } as const;

/** 増減付き表の推奨の行数（超えても消さず、知らせる） */
export const DELTA_LIMITS = { maxRows: 12, input: 30 } as const;

/** KPI スコアカードの推奨の数（超えても消さず、知らせる）。2段まで */
export const KPI_LIMITS = { max: 6, oneRow: 4, input: 8 } as const;

/** 結論＋根拠の推奨の文字数（日本語。超えても切らず、知らせる） */
export const CONCLUSION_LIMITS = { title: 60, heading: 20, body: 80, maxReasons: 3 } as const;

export const isStoryTemplateId = (v: unknown): v is StoryTemplateId => (STORY_TEMPLATE_IDS as readonly string[]).includes(v as string);
