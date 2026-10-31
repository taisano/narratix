import { describe, expect, it } from 'vitest';
import { notesFromText, notesToText, type NoteItem } from './notes';

describe('補足・検討事項のその場の編集', () => {
  const items: NoteItem[] = [{ head: '売上 ＋17.2%', body: '前年度145億円から170億円。\n増収額は25億円。', tone: 'up' }, { head: '論点', body: '内訳を確認。', tone: 'plain' }];
  it('書き出して読み戻すと同じ（色は並びの順で引き継ぐ）', () => {
    expect(notesFromText(notesToText(items), items)).toEqual(items);
  });
  it('項目は最大4つ、空行で区切る。見出しだけの項目も可', () => {
    const t = ['A', 'B', 'C', 'D', 'E'].join('\n\n');
    const r = notesFromText(t, []);
    expect(r).toHaveLength(4);
    expect(r[0]).toEqual({ head: 'A', body: '', tone: 'plain' });
  });
  it('項目を足すと色は通常、消すと詰める', () => {
    expect(notesFromText('x\n本文\n\ny', [{ head: '', body: '', tone: 'down' }]).map((i) => i.tone)).toEqual(['down', 'plain']);
    expect(notesFromText('', items)).toEqual([]);
  });
});
