import type { GoalCode, RecipeId } from '@/registry';
import { VARIANTS, type AdvisorAction, type AdvisorCase } from './cases';

/** 分類器（ルール版・AI 版）の答え。案は最大3件 */
export interface AdvisorAnswer {
  action: AdvisorAction;
  goal: GoalCode | null;
  top: RecipeId[];
}

/** 向きだけ違う案を、同じ案（グループの先頭）にそろえる */
export const canon = (id: RecipeId): RecipeId => VARIANTS.find((g) => g.includes(id))?.[0] ?? id;
const uniq = (ids: RecipeId[]) => [...new Set(ids.map(canon))];

export interface CaseScore {
  id: string;
  action: AdvisorAction;
  actionOk: boolean;
  /** 目的を採点しない相談（目的が決められない確認）は null */
  goalOk: boolean | null;
  /** 1番目が最優先の期待案と一致（RECOMMEND のみ） */
  top1Strict: boolean | null;
  /** 1番目が期待案のどれか（RECOMMEND のみ） */
  top1: boolean | null;
  /** 期待案（最大3件）のうち、上位3件に入った割合（RECOMMEND のみ） */
  recall: number | null;
  /** 出した案のうち、期待・許容の割合（RECOMMEND で案を出した時のみ） */
  precision: number | null;
  ngHit: RecipeId[];
  /** 必須条件：NG なし・未対応を装わない・根拠なく推薦しない（行動が正しい） */
  safe: boolean;
  /** 合格：必須条件＋（RECOMMEND なら）目的と1番目が期待どおり */
  pass: boolean;
}

export function scoreCase(c: AdvisorCase, got: AdvisorAnswer): CaseScore {
  const top3 = uniq(got.top.slice(0, 3));
  const ng = new Set((c.ng ?? []).map(canon));
  const ngHit = top3.filter((id) => ng.has(id));
  const actionOk = got.action === c.action && (got.action === 'RECOMMEND' ? top3.length > 0 : top3.length === 0);
  const goalOk = c.goal == null ? null : got.goal === c.goal;
  const safe = actionOk && ngHit.length === 0;
  if (c.action !== 'RECOMMEND') {
    return { id: c.id, action: c.action, actionOk, goalOk, top1Strict: null, top1: null, recall: null, precision: null, ngHit, safe, pass: safe && goalOk !== false };
  }
  const exp = uniq(c.expected);
  const good = new Set(uniq([...c.expected, ...(c.ok ?? [])]));
  const first = top3[0];
  const top1Strict = first != null && first === exp[0];
  const top1 = first != null && exp.includes(first);
  const want = exp.slice(0, 3);
  const recall = want.length ? want.filter((id) => top3.includes(id)).length / want.length : null;
  const precision = top3.length ? top3.filter((id) => good.has(id)).length / top3.length : null;
  return { id: c.id, action: c.action, actionOk, goalOk, top1Strict, top1, recall, precision, ngHit, safe, pass: safe && goalOk !== false && top1 };
}

const rate = (xs: (boolean | null)[]) => { const v = xs.filter((x): x is boolean => x != null); return { ok: v.filter(Boolean).length, n: v.length }; };
const mean = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };

/** 指標ごとの集計（レビューの推奨指標） */
export function summarizeScores(s: CaseScore[]) {
  const rec = s.filter((x) => x.action === 'RECOMMEND');
  return {
    n: s.length,
    pass: s.filter((x) => x.pass).length,
    safe: s.filter((x) => x.safe).length,
    action: rate(s.map((x) => x.actionOk)),
    purpose: rate(s.map((x) => x.goalOk)),
    top1Strict: rate(rec.map((x) => x.top1Strict)),
    top1: rate(rec.map((x) => x.top1)),
    recall3: mean(rec.map((x) => x.recall)),
    precision3: mean(rec.map((x) => x.precision)),
    forbidden: { hit: s.filter((x) => x.ngHit.length).length, n: s.length },
    clarify: rate(s.filter((x) => x.action === 'CLARIFY').map((x) => x.actionOk)),
    unsupported: rate(s.filter((x) => x.action === 'UNSUPPORTED').map((x) => x.actionOk)),
  };
}
