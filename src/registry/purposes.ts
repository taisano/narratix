import type { PurposeId } from './ids';
import type { PurposeDef } from './types';

export const PURPOSES: Record<PurposeId, PurposeDef> = {
  trend: {
    id: 'trend',
    label: { ja: 'Trend（推移）', en: 'Trend' },
    question: { ja: '時間とともにどう変わったか', en: 'How has it changed over time?' },
    schema: 'MATRIX_TIME_SERIES',
    wishPhrases: { ja: ['推移を見せたい', '伸びている', '減っている'], en: ['show the trend', 'it is growing', 'it is declining'] },
  },
  comparison: {
    id: 'comparison',
    label: { ja: 'Comparison（比較）', en: 'Comparison' },
    question: { ja: '項目間でどう違うか、どれが上位か', en: 'How do items differ, and which lead?' },
    schema: 'MATRIX_TIME_SERIES',
    wishPhrases: { ja: ['比べたい', 'ランキング', '予算と実績の差'], en: ['compare', 'ranking', 'budget vs actual'] },
  },
  composition: {
    id: 'composition',
    label: { ja: 'Composition（構成）', en: 'Composition' },
    question: { ja: '全体の大きさと、その内訳は', en: 'How big is the whole, and what is it made of?' },
    schema: 'MEKKO',
    wishPhrases: { ja: ['シェア', '構成', '誰がどれだけ取っているか'], en: ['share', 'mix', 'who takes how much'] },
  },
  contribution: {
    id: 'contribution',
    label: { ja: 'Contribution（要因）', en: 'Contribution' },
    question: { ja: '始点から終点への変化は何によるか', en: 'What drove the change from start to end?' },
    schema: 'DRIVER_BRIDGE',
    wishPhrases: { ja: ['なぜ増えた・減った', '要因を分解したい'], en: ['why did it rise or fall', 'break down the drivers'] },
  },
  relationship: {
    id: 'relationship',
    label: { ja: 'Relationship（関係）', en: 'Relationship' },
    question: { ja: '2つの指標はどう関係するか、どこに位置するか', en: 'How are two measures related, and where does each item sit?' },
    schema: 'BUBBLE',
    wishPhrases: { ja: ['相関', 'ポジショニング', '狙い所'], en: ['correlation', 'positioning', 'where to play'] },
  },
  evaluate: {
    id: 'evaluate',
    label: { ja: 'Evaluate（評価）', en: 'Evaluate' },
    question: { ja: '複数の指標で見てどうか', en: 'How do items perform across several metrics?' },
    schema: 'EVALUATION',
    wishPhrases: { ja: ['総合評価', '強み・弱み', '一覧で見たい'], en: ['overall assessment', 'strengths and weaknesses', 'see it all at once'] },
  },
};
