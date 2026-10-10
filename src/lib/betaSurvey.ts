/** ベータ登録のかんたんなアンケート（職種・知ったきっかけ）。supabase/migrations/20261012000000_beta_survey.sql */
export const OCCUPATIONS = ['planner', 'consultant', 'sales', 'finance', 'engineer', 'student', 'other'] as const;
export const REFERRALS = ['x', 'facebook', 'linkedin', 'substack', 'ai', 'friend', 'search', 'article', 'event', 'other'] as const;
export type Occupation = typeof OCCUPATIONS[number];
export type Referral = typeof REFERRALS[number];

export interface BetaSurvey {
  occupation: Occupation | '';
  occupationOther: string;
  referral: Referral | '';
  referralOther: string;
}
export const EMPTY_SURVEY: BetaSurvey = { occupation: '', occupationOther: '', referral: '', referralOther: '' };

/** 「その他」は自由記入が入っていること */
export function surveyComplete(s: BetaSurvey): boolean {
  return !!s.occupation && !!s.referral
    && (s.occupation !== 'other' || !!s.occupationOther.trim())
    && (s.referral !== 'other' || !!s.referralOther.trim());
}

/** DB に入れる文字：選択肢の記号、または「other:自由記入」 */
export function encodeSurvey(s: BetaSurvey): { occupation: string; referral: string } {
  const enc = (v: string, other: string) => (v === 'other' ? `other:${other.trim().slice(0, 100)}` : v);
  return { occupation: enc(s.occupation, s.occupationOther), referral: enc(s.referral, s.referralOther) };
}
