import type { Locale, LocalizedText } from './locale';

/** 全スライド共通で選べるフォント。種類を増やしすぎず、保存するのは ID だけにする。 */
export const SLIDE_FONT_IDS = ['standard', 'modern', 'serif'] as const;
export type SlideFontId = (typeof SLIDE_FONT_IDS)[number];

export interface SlideFontDef {
  id: SlideFontId;
  label: LocalizedText;
  ppt: Record<Locale, string>;
  svg: Record<Locale, string>;
}

export const SLIDE_FONTS: Record<SlideFontId, SlideFontDef> = {
  standard: {
    id: 'standard', label: { ja: '標準ゴシック', en: 'Standard sans' },
    ppt: { ja: 'Meiryo', en: 'Arial' },
    svg: {
      ja: "'Hiragino Sans','Yu Gothic','Meiryo','IBM Plex Sans JP',sans-serif",
      en: "Arial,'Helvetica Neue',sans-serif",
    },
  },
  modern: {
    id: 'modern', label: { ja: 'モダン', en: 'Modern' },
    ppt: { ja: 'Yu Gothic', en: 'Aptos' },
    svg: {
      ja: "'Yu Gothic','Hiragino Sans','Meiryo',sans-serif",
      en: "Aptos,'Segoe UI',Arial,sans-serif",
    },
  },
  serif: {
    id: 'serif', label: { ja: '明朝', en: 'Serif' },
    ppt: { ja: 'Yu Mincho', en: 'Georgia' },
    svg: {
      ja: "'Yu Mincho','Hiragino Mincho ProN','MS PMincho',serif",
      en: "Georgia,'Times New Roman',serif",
    },
  },
};

export const slideFontIdOf = (value: unknown): SlideFontId =>
  typeof value === 'string' && (SLIDE_FONT_IDS as readonly string[]).includes(value) ? value as SlideFontId : 'standard';

export const slidePptFont = (value: unknown, locale: Locale): string => SLIDE_FONTS[slideFontIdOf(value)].ppt[locale];
export const slideSvgFont = (value: unknown, locale: Locale): string => SLIDE_FONTS[slideFontIdOf(value)].svg[locale];
