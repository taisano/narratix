import { describe, expect, it } from 'vitest';
import { youtubeId } from './config';
import { landingSlides } from './slides';

describe('紹介トップ', () => {
  it('絵はどれも本物のエンジンで描けている（空の SVG が無い）', () => {
    const s = landingSlides();
    const all = [s.hero, ...s.examples.map((e) => e.svg), ...Object.values(s.prebuilt)];
    expect(all).toHaveLength(9);
    for (const svg of all) expect(svg.startsWith('<svg')).toBe(true);
    expect(s.hero).toContain('東南アジアが年率20%');
  });
  it('YouTube の URL から動画 ID を取り出す', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=abcdefghijk&t=3')).toBe('abcdefghijk');
    expect(youtubeId('https://youtu.be/abcdefghijk')).toBe('abcdefghijk');
    expect(youtubeId('https://www.youtube.com/embed/abcdefghijk')).toBe('abcdefghijk');
    expect(youtubeId('https://example.com/')).toBeNull();
  });
});
