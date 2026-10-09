import type { Locale } from '@/registry/locale';
import type { Variant } from '@/lib/ab/variant';

/**
 * 紹介トップの A/B で変える文言だけ（docs/landing-ab-guide.md 5章）。
 * レイアウト・画像・CTA の位置と遷移先は両案で共通。ここ以外で A/B の差を作らない。
 * 日本語は指示書のまま。英語は下書き（要確認）。改行は \n。
 */
export interface VariantCopy {
  eyebrow: string;
  heading: string;
  description: string;
  primaryCta: string;
  problemHeading: string;
  problemBody: string;
  finalHeading: string;
  finalCta: string;
}

export const VARIANT_COPY: Record<Variant, Record<Locale, VariantCopy>> = {
  // A：課題起点
  a: {
    ja: {
      eyebrow: 'BEYOND AI-GENERATED SLIDES',
      heading: 'スライドも、考え方も、\n自分のものに。',
      description: 'それらしい一枚を生成して終わらない。専属コーチと問いを深め、データの切り口を選び、納得いくまで編集する。完成するのは、自由に使えるPowerPointと、次にも使える分析・プレゼンの型です。',
      primaryCta: '専属コーチと始める',
      problemHeading: 'とにかく作る、から\n伝わるように作る、へ。',
      problemBody: 'ExcelやPowerPointを開き、まずチャートを作る。けれど「結局、何が言いたいの？」となってしまう。Biz Slide Coachは、作図の前に問いと主張を整理し、相手に届く見せ方を一緒に考えます。',
      finalHeading: '作り始める前に、相談する。\n伝わる一枚は、そこから始まる。',
      finalCta: '相談して作り始める',
    },
    en: {
      eyebrow: 'BEYOND AI-GENERATED SLIDES',
      heading: 'Make the slide yours.\nMake the thinking yours.',
      description: 'Don’t stop at one plausible slide. Sharpen your question with a personal coach, choose how to cut the data, and edit until you’re satisfied. You finish with a PowerPoint you can use freely, and an analysis and presentation pattern you can use again.',
      primaryCta: 'Start with your coach',
      problemHeading: 'From “just make it”\nto “make it land.”',
      problemBody: 'You open Excel or PowerPoint and build a chart first. Then someone asks, “So what’s the point?” Biz Slide Coach helps you frame the question and the message before you draw, and works out a view your audience will get.',
      finalHeading: 'Consult before you build.\nThat is where a slide that lands begins.',
      finalCta: 'Start with a consultation',
    },
  },
  // B：成果起点
  b: {
    ja: {
      eyebrow: 'BEYOND AI-GENERATED SLIDES',
      heading: 'スライドも、考え方も、\n自分のものに。',
      description: 'それらしい一枚を生成して終わらない。専属コーチと問いを深め、データの切り口を選び、納得いくまで編集する。完成するのは、自由に使えるPowerPointと、次にも使える分析・プレゼンの型です。',
      primaryCta: '専属コーチと始める',
      problemHeading: '考え方も、見せ方も。\nプロの型を、誰にでも。',
      problemBody: '伝わるスライドには、問いの立て方、切り口の選び方、情報の組み合わせ方があります。Biz Slide Coachなら、そのプロセスをコーチと進めながら、実務で使える一枚に仕上げられます。',
      finalHeading: '考え方から整うから、\n誰でも、伝わる一枚へ。',
      finalCta: 'コンサル級の一枚を作る',
    },
    en: {
      eyebrow: 'BEYOND AI-GENERATED SLIDES',
      heading: 'Make the slide yours.\nMake the thinking yours.',
      description: 'Don’t stop at one plausible slide. Sharpen your question with a personal coach, choose how to cut the data, and edit until you’re satisfied. You finish with a PowerPoint you can use freely, and an analysis and presentation pattern you can use again.',
      primaryCta: 'Start with your coach',
      problemHeading: 'How to think, and how to show.\nThe pro playbook, for everyone.',
      problemBody: 'Slides that land follow a method: how to frame the question, choose the angle and combine the information. With Biz Slide Coach you work through that process with a coach and finish with a slide you can use at work.',
      finalHeading: 'Get the thinking right,\nand anyone can make a slide that lands.',
      finalCta: 'Make a consulting-grade slide',
    },
  },
};

export const copyFor = (v: Variant, locale: Locale): VariantCopy => VARIANT_COPY[v][locale];
