import { rankRecipes, type ConsultationClassification } from '@/registry';
import { availableRecipes } from '@/features/start/plan';
import { classifyConsultation } from './classify';

/**
 * AI の分類で案が1つも出ない時（「案を出す」のに合う切り口が0件）は、ルール版の分類に切り替える。
 * ルール版でも出なければ AI のまま（「まだ作れない」と正直に出す）。
 */
export function pickClassification(ai: ConsultationClassification, text: string): { classification: ConsultationClassification; used: 'ai' | 'rules' } {
  if (ai.expected_action !== 'RECOMMEND' || rankRecipes(ai, availableRecipes()).length) return { classification: ai, used: 'ai' };
  const rules = classifyConsultation(text);
  const rulesWorks = rules.expected_action !== 'RECOMMEND' || rankRecipes(rules, availableRecipes()).length > 0;
  return rulesWorks ? { classification: rules, used: 'rules' } : { classification: ai, used: 'ai' };
}
