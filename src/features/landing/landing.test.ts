import { describe, expect, it } from 'vitest';
import { youtubeId } from './config';
import { landingSlides } from './slides';

describe('紹介トップ', () => {
  it('絵はどれも本物のエンジンで描けている（空の SVG が無い）', () => {
    const s = landingSlides();
    const all = (['ja', 'en'] as const).flatMap((l) => [s.mekko[l], ...s.examples[l].map((e) => e.svg), ...Object.values(s.prebuilt[l])]);
    expect(all).toHaveLength(16);
    for (const svg of all) expect(svg.startsWith('<svg')).toBe(true);
    expect(s.mekko.ja).toContain('生成AIの利用は2年で3.8倍');
    expect(s.mekko.en).toContain('Generative AI usage grew 3.8');
    // 元のスライドと同じ数字（CAGR と構成比）
    // 英語の画面の見本は、項目名も英語（日本語の地域名が残らない）
    for (const svg of [...s.examples.en.map((e) => e.svg), ...Object.values(s.prebuilt.en)]) {
      expect(svg).not.toMatch(/[\u3040-\u30ff\u4e00-\u9fff]/);
    }
    for (const t of ['65.8%', '123.6%', '182.8%', '104.1%', '69.3%']) expect(s.mekko.ja).toContain(t);
  });
  it('YouTube の URL から動画 ID を取り出す', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=abcdefghijk&t=3')).toBe('abcdefghijk');
    expect(youtubeId('https://youtu.be/abcdefghijk')).toBe('abcdefghijk');
    expect(youtubeId('https://www.youtube.com/embed/abcdefghijk')).toBe('abcdefghijk');
    expect(youtubeId('https://example.com/')).toBeNull();
  });
});
