import { describe, expect, it } from 'vitest';
import { storyUrl } from './storyUrl';

describe('編集画面のURL', () => {
  it('ストーリーを開いている間は ?story= を残し、再読込で同じストーリーを開き直せる', () => {
    expect(storyUrl({ kind: 'story', id: 'abc-123' }, '/editor')).toBe('/editor?story=abc-123');
    expect(storyUrl({ kind: 'story', id: 'a b' }, '/editor')).toBe('/editor?story=a%20b');
  });
  it('ほかの指示（チャート・新規・下書き）や指示なしでは消す', () => {
    for (const intent of [{ kind: 'open', id: 'x' }, { kind: 'new' }, { kind: 'plan' }, { kind: 'draft', id: 'd' }, null, undefined]) {
      expect(storyUrl(intent, '/editor')).toBe('/editor');
    }
  });
});
