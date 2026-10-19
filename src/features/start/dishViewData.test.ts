import { describe, expect, it } from 'vitest';
import { sampleFor } from '@/features/editor/state';
import { proposalSvg } from './dishView';

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
});
