import type { GoalCode, RecipeId } from '@/registry';
import type { AdvisorCase } from './cases';

/** 1件の採点（目的・1番目・上位3案・NG・まだ作れない相談） */
export interface CaseScore {
  id: string;
  goalOk: boolean;
  top1Ok: boolean;
  /** 上位3案のうち、期待または許容に入っている数（0〜3） */
  hits: number;
  ngHit: RecipeId[];
  /** 満点か（目的・1番目・NG なし。まだ作れない相談は案が0件なら満点、確認を促す相談は目的を問わない） */
  pass: boolean;
}

export function scoreCase(c: AdvisorCase, got: { goal: GoalCode; top: RecipeId[]; confidence: number }): CaseScore {
  const good = new Set<RecipeId>([...c.expected, ...(c.ok ?? [])]);
  const top3 = got.top.slice(0, 3);
  const ngHit = top3.filter((id) => c.ng?.includes(id));
  const goalOk = got.goal === c.goal;
  if (c.unsupported) {
    return { id: c.id, goalOk, top1Ok: top3.length === 0, hits: 0, ngHit, pass: goalOk && top3.length === 0 };
  }
  if (c.vague && !c.expected.length) {
    return { id: c.id, goalOk: true, top1Ok: true, hits: 0, ngHit, pass: got.confidence < 0.5 };
  }
  const top1Ok = top3[0] != null && c.expected.includes(top3[0]);
  const hits = top3.filter((id) => good.has(id)).length;
  const pass = (goalOk || !!c.vague) && top1Ok && ngHit.length === 0;
  return { id: c.id, goalOk, top1Ok, hits, ngHit, pass };
}

export function summarizeScores(s: CaseScore[]) {
  const n = s.length;
  return {
    n,
    pass: s.filter((x) => x.pass).length,
    goal: s.filter((x) => x.goalOk).length,
    top1: s.filter((x) => x.top1Ok).length,
    hits: s.reduce((a, x) => a + x.hits, 0),
    ng: s.filter((x) => x.ngHit.length).length,
  };
}
