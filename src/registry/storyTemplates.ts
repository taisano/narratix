import type { LocalizedText } from './locale';

const L = (ja: string, en: string): LocalizedText => ({ ja, en });

/**
 * スライドの主役になる「表・言葉」の型（docs/story-spec.md 9章・表で整理／言葉でまとめる MVP 実装指示）。
 * チャートに付ける表（成長率表など、TABLES）とは別物。グラフの代わりにスライド全体をこの型で描く。
 * 型を足す時は、ここに足し、engine/layout/templates に描き方、features/templates に中身の形と入力欄を足す
 */
export const STORY_TEMPLATE_IDS = ['STORY_TABLE_COMPARISON', 'STORY_TEXT_CONCLUSION_REASONS'] as const;
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
  STORY_TEXT_CONCLUSION_REASONS: {
    id: 'STORY_TEXT_CONCLUSION_REASONS', kind: 'text', label: L('結論＋3つの根拠', 'Conclusion + three reasons'),
    purpose: L('ご自身で書いた結論を、最大3つの根拠で支えます。', 'Support your own conclusion with up to three reasons.'),
  },
};

/** 表で整理／言葉でまとめる、を選んだ時に最初に出す型（今は各1つ） */
export const TEMPLATE_OF_KIND: Record<StoryTemplateKind, StoryTemplateId> = {
  table: 'STORY_TABLE_COMPARISON',
  text: 'STORY_TEXT_CONCLUSION_REASONS',
};

/** 比較表の推奨の大きさ（超えても消さず、読みにくくなることを知らせる） */
export const COMPARISON_LIMITS = { maxCandidates: 5, minCandidates: 2, maxCriteria: 8, minCriteria: 3 } as const;

/** 結論＋根拠の推奨の文字数（日本語。超えても切らず、知らせる） */
export const CONCLUSION_LIMITS = { title: 60, heading: 20, body: 80, maxReasons: 3 } as const;

export const isStoryTemplateId = (v: unknown): v is StoryTemplateId => (STORY_TEMPLATE_IDS as readonly string[]).includes(v as string);
