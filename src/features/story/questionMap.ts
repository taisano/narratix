/**
 * Story 質問マップ
 * 相談の route_role + proof_needs に基づいて質問をパーソナライズ
 * 
 * 正確なマッチング（ランタイムIDに依存しない）
 */

export interface ProofNeeds {
  needs: Set<string>;
}

export interface PersonalizedQuestion {
  questionId: string;
  text: string;
  hints: string[];
}

export interface QuestionMapEntry {
  question: string;
  route_role: string;
  proof_needs: Set<string>;
  personalization: PersonalizedQuestion[];
}

/**
 * route_role と proof_needs の正確なマッチングで個別化を取得
 */
export function personalizationFor(
  routeRole: string,
  proofNeeds: Set<string>,
  questionMap: QuestionMapEntry[]
): PersonalizedQuestion[] {
  const entry = questionMap.find(e => 
    e.route_role === routeRole && 
    setsEqual(e.proof_needs, proofNeeds)
  );
  
  return entry?.personalization ?? [];
}

/**
 * proof_needs を統一可能性ルールでグループ化
 */
export function groups(allProofNeeds: Set<string>[]): Map<string, Set<string>[]> {
  const grouped = new Map<string, Set<string>[]>();
  
  allProofNeeds.forEach(needs => {
    // グループキーを生成（canonical form）
    const key = Array.from(needs).sort().join('|');
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(needs);
  });
  
  return grouped;
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}
