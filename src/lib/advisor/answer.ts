import { rankRecipes, type ConsultationClassification } from '@/registry';
import { availableRecipes } from '@/features/start/plan';
import type { AdvisorAnswer } from './score';

/** 分類から、正解表で採点する答えを作る（ルール版・AI 版で共通）。推薦なのに案が0件なら「まだ作れない」 */
export function answerFromClassification(cls: ConsultationClassification): AdvisorAnswer & { cls: ConsultationClassification } {
  const top = rankRecipes(cls, availableRecipes()).map((x) => x.recipe.id);
  const action = cls.expected_action === 'RECOMMEND' && !top.length ? 'UNSUPPORTED' : cls.expected_action;
  return { cls, action, goal: cls.primary_goal, top };
}
