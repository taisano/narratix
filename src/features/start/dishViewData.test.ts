import { describe, expect, it } from 'vitest';
import { sampleFor } from '@/features/editor/state';
import { proposalState, proposalSvg } from './dishView';

describe('proposalSvg：データを渡すと、見本ではなくそのデータで描く', () => {
  it('渡した行の名前がプレビューに出る。渡さなければ今までどおり（見本）', () => {
    const d = structuredClone(sampleFor('trend', 'ja').dataset);
    d.rows = d.rows.map((_, i) => `ZZROW${i + 1}`);
    d.cols = d.cols.map((_, i) => `ZZCOL${i + 1}`);
    const own = proposalSvg({ recipe: 'COMP_RANK' }, 'ja', d);
    expect(own).toContain('ZZCOL1');
    const sample = proposalSvg({ recipe: 'COMP_RANK' }, 'ja');
    expect(sample).not.toContain('ZZCOL1');
    expect(sample).toBeTruthy();
  });
  it('実データで描いたプレビューの出典は「貼り付けたデータ」（見本の出典を出さない）', () => {
    const d = structuredClone(sampleFor('trend', 'ja').dataset);
    d.cols = d.cols.map((_, i) => `ZZCOL${i + 1}`);
    expect(proposalSvg({ recipe: 'COMP_RANK' }, 'ja', d)).not.toContain('サンプルデータ');
    expect(proposalState({ recipe: 'COMP_RANK' }, 'ja', d).source).toBe('出典：貼り付けたデータ');
    expect(proposalState({ recipe: 'COMP_RANK' }, 'en', d).source).toBe('Source: pasted data');
  });
});
