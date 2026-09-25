import type { ConsultationClassification, LocalizedText, MissingInfo } from '@/registry';

/**
 * 確認の質問（決まった文と選択肢。AI には書かせない）。
 * 分類が「確認」の時、足りない項目（missing_info）ごとに1問ずつ出す。選んだ答えは分類に上書きし、切り口を並べ直す。
 */
export interface ClarifyOption {
  label: LocalizedText;
  patch: Partial<ConsultationClassification>;
  /** 選んだ時に添える注意（まだ作れない見せ方など） */
  note?: LocalizedText;
}
export interface ClarifyQuestion {
  id: MissingInfo;
  text: LocalizedText;
  options: ClarifyOption[];
}

const L = (ja: string, en: string) => ({ ja, en });

export const CLARIFY_QUESTIONS: Record<MissingInfo, ClarifyQuestion> = {
  VIEW: {
    id: 'VIEW', text: L('何を見せたいですか', 'What do you want to show?'),
    options: [
      { label: L('時間の流れ（推移）', 'Change over time'), patch: { primary_goal: 'TREND', time_mode: 'MULTI_PERIOD' } },
      { label: L('項目どうしの大小・順位', 'Size or rank of items'), patch: { primary_goal: 'COMPARISON', comparison_intent: 'LEVEL', time_mode: 'NONE' } },
      { label: L('2つの差（計画と実績、前年と今年など）', 'Difference between two (plan vs actual, year over year)'), patch: { primary_goal: 'COMPARISON', comparison_intent: 'DELTA' } },
      { label: L('内訳・構成比', 'Breakdown or share'), patch: { primary_goal: 'COMPOSITION', composition_intent: 'SHARE' } },
    ],
  },
  MEASURE: {
    id: 'MEASURE', text: L('何の数字ですか', 'What kind of number is it?'),
    options: [
      { label: L('売上・金額', 'Sales or amounts'), patch: { measure: '売上', measure_additivity: 'ADDITIVE' } },
      { label: L('件数・人数・数量', 'Counts or volumes'), patch: { measure: '件数', measure_additivity: 'ADDITIVE' } },
      { label: L('率・平均・スコア', 'Rates, averages or scores'), patch: { measure: '率', measure_additivity: 'NON_ADDITIVE' } },
    ],
  },
  DECISION: {
    id: 'DECISION', text: L('誰に見せますか', 'Who will see it?'),
    options: [
      { label: L('経営会議・役員', 'Executives'), patch: { audience: 'EXECUTIVE_MEETING' } },
      { label: L('営業・顧客', 'Sales or clients'), patch: { audience: 'SALES_MEETING' } },
      { label: L('レポート・資料', 'A report'), patch: { audience: 'REPORT' } },
      { label: L('まだ決めていない', 'Not decided yet'), patch: {} },
    ],
  },
  AVERAGE_BASIS: {
    id: 'AVERAGE_BASIS', text: L('比べる「平均」は、何の平均ですか', 'Which average do you want to compare against?'),
    options: [
      { label: L('売上などの水準の平均', 'The average level (e.g. sales)'), patch: { comparison_intent: 'AVERAGE_GAP' } },
      {
        label: L('伸び率の平均', 'The average growth rate'), patch: { comparison_intent: 'UNKNOWN', needs_rate_context: true },
        note: L('伸び率の平均と比べる切り口はまだありません。各系列の伸び率（CAGR）を並べる案を出します。', 'There is no angle yet that compares against the average growth rate. We will suggest angles that line up each series’ growth rate (CAGR).'),
      },
    ],
  },
};

/** 答え（質問ごとに選んだ選択肢の位置）を分類に反映し、「案を出す」にする */
export function applyClarify(c: ConsultationClassification, answers: Partial<Record<MissingInfo, number>>): ConsultationClassification {
  let next: ConsultationClassification = { ...c };
  for (const id of c.missing_info) {
    const i = answers[id];
    const opt = i == null ? undefined : CLARIFY_QUESTIONS[id].options[i];
    if (opt) next = { ...next, ...opt.patch };
  }
  return { ...next, expected_action: 'RECOMMEND', missing_info: [] };
}
