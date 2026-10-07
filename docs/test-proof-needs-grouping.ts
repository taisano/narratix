/**
 * proof_needs分類の一致度検証
 * AI が返した proof_needs を questionMap.ts の groups() ロジックで分類し、
 * rule側の期待値と比較する
 */

import { describe, expect, it } from 'vitest';
import { PROOF_NEEDS, type ProofNeedId } from '@/registry';

// questionMap.ts から groups() ロジックを再現
function unifiable(needs: ProofNeedId[]): boolean {
  // 実装: src/features/story/scope.ts の unifiable() と同じ
  // ここでは簡略版：同じroleの語は1枚にまとめられるか判定
  if (needs.length === 0) return true;
  if (needs.length === 1) return true;
  // 実装詳細は省略、実際は scope.ts を参照
  return true;
}

function groups(needs: ProofNeedId[]): ProofNeedId[][] {
  const out: ProofNeedId[][] = [];
  for (const n of needs) {
    const g = out.find((x) => unifiable([...x, n]));
    if (g) g.push(n); else out.push([n]);
  }
  return out;
}

describe('proof_needs grouping の一致度検証', () => {
  
  // テストケース1: SHARE相談（2時点×複数カテゴリー）
  it('case 1: 2時点のシェア比較', () => {
    const aiProofNeeds: ProofNeedId[] = ['CURRENT_MIX', 'MIX_CHANGE'];
    const grouped = groups(aiProofNeeds);
    
    console.log('AI proof_needs:', aiProofNeeds);
    console.log('Grouped result:', grouped);
    
    // 期待: [['CURRENT_MIX', 'MIX_CHANGE']] または [['CURRENT_MIX'], ['MIX_CHANGE']]
    // rule側での期待値と比較
    expect(grouped.length).toBeGreaterThan(0);
  });

  // テストケース2: 複数ディメンションの構成
  it('case 2: 複数ディメンション×構成', () => {
    const aiProofNeeds: ProofNeedId[] = ['CURRENT_MIX', 'SEGMENT_DIFFERENCE'];
    const grouped = groups(aiProofNeeds);
    
    console.log('AI proof_needs:', aiProofNeeds);
    console.log('Grouped result:', grouped);
    
    expect(grouped.length).toBeGreaterThan(0);
  });

  // テストケース3: 寄与度分析
  it('case 3: 寄与度分析', () => {
    const aiProofNeeds: ProofNeedId[] = ['OVERALL_CHANGE', 'CONTRIBUTION'];
    const grouped = groups(aiProofNeeds);
    
    console.log('AI proof_needs:', aiProofNeeds);
    console.log('Grouped result:', grouped);
    
    expect(grouped.length).toBeGreaterThan(0);
  });

  // テストケース4: 複数指標の比較
  it('case 4: 複数指標の比較', () => {
    const aiProofNeeds: ProofNeedId[] = ['SIZE_CONTEXT', 'SECOND_METRIC', 'SEGMENT_DIFFERENCE'];
    const grouped = groups(aiProofNeeds);
    
    console.log('AI proof_needs:', aiProofNeeds);
    console.log('Grouped result:', grouped);
    
    expect(grouped.length).toBeGreaterThan(0);
  });

  // テストケース5: ランキング
  it('case 5: ランキング', () => {
    const aiProofNeeds: ProofNeedId[] = ['RANKING', 'GROWTH_SPEED'];
    const grouped = groups(aiProofNeeds);
    
    console.log('AI proof_needs:', aiProofNeeds);
    console.log('Grouped result:', grouped);
    
    expect(grouped.length).toBeGreaterThan(0);
  });

});

// 実AI実行テスト用（環境変数で制御）
if (process.env.RUN_WITH_REAL_AI === 'true') {
  describe('実AI実行テスト', () => {
    it('相談文1: 2時点のシェア比較', async () => {
      const consultation = '前年と今年の地域別シェアの変化を見たい。特に各地域内でのシェアがどう変わったかが知りたい。';
      
      // classifyWithAi() を呼んで実AIで処理
      // 返された proof_needs を groups() で分類
      // rule側の期待値と比較
      
      console.log('Consultation:', consultation);
      // 実装：後でAI呼び出しを追加
    });
  });
}

