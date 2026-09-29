import type { LocalizedText } from './locale';

const L = (ja: string, en: string): LocalizedText => ({ ja, en });

/**
 * proof_needs（証明要求）の共通語彙（docs/proof-needs-vocabulary.md v1.0）。
 * Story Route・一品料理・Visual Recipe が同じ enum を参照する。1つの問いは複数を持てる（配列）。
 * チャート名・レイアウト名・メッセージ・Route の役割は入れない。UI には内部 ID を出さず、label を出す
 */
export const PROOF_NEED_IDS = [
  'OVERALL_CHANGE', 'GROWTH_SPEED', 'CONTRIBUTION', 'CURRENT_MIX', 'MIX_CHANGE', 'SIZE_CONTEXT', 'SEGMENT_DIFFERENCE',
  'RANKING', 'TARGET_GAP', 'SECOND_METRIC', 'ITEM_SHARE', 'BRIDGE', 'RELATIONSHIP', 'POSITIONING',
] as const;
export type ProofNeedId = (typeof PROOF_NEED_IDS)[number];

export const PROOF_NEEDS: Record<ProofNeedId, { label: LocalizedText; question: LocalizedText }> = {
  OVERALL_CHANGE: { label: L('全体の変化', 'Overall change'), question: L('全体はどう変わってきたか', 'How has the whole changed?') },
  GROWTH_SPEED: { label: L('伸びの速さ', 'Speed of growth'), question: L('どれくらいの速さで伸びたか', 'How fast did it grow?') },
  // 算術的な寄与（増加額）。原因ではない（原因は将来の CAUSAL_DRIVER）
  CONTRIBUTION: { label: L('増加への寄与', 'Contribution to the change'), question: L('どの項目が全体の増加に寄与したか', 'Which parts contributed to the change?') },
  CURRENT_MIX: { label: L('現在の構成', 'Current mix'), question: L('今は何で構成されているか', 'What is it made of now?') },
  MIX_CHANGE: { label: L('構成比の変化', 'Change in mix'), question: L('内訳の比率はどう動いたか', 'How did the mix shift?') },
  SIZE_CONTEXT: { label: L('規模', 'Size'), question: L('大きさはどの程度か', 'How big is it?') },
  SEGMENT_DIFFERENCE: { label: L('項目間の差', 'Differences between segments'), question: L('どの項目が異なるか', 'Which segments differ?') },
  RANKING: { label: L('順位', 'Ranking'), question: L('どこが最も大きいか', 'Which is largest?') },
  TARGET_GAP: { label: L('基準との差', 'Gap to a benchmark'), question: L('基準からどれだけ離れているか', 'How far from the benchmark?') },
  SECOND_METRIC: { label: L('別の指標での見え方', 'Another metric'), question: L('別の指標でも同じ結果か', 'Does another metric agree?') },
  ITEM_SHARE: { label: L('特定項目の比率', 'Share of one item'), question: L('○○の占める割合は', 'What share does one item hold?') },
  BRIDGE: { label: L('始点から終点への内訳', 'Start-to-end bridge'), question: L('AからBへ何が変化を生んだか', 'What moved it from A to B?') },
  // 関連であって因果ではない
  RELATIONSHIP: { label: L('指標の関連', 'Relationship'), question: L('2つの指標は連動しているか', 'Do the two metrics move together?') },
  POSITIONING: { label: L('位置づけ', 'Positioning'), question: L('どの領域に位置づけられるか', 'Where does each item sit?') },
};
