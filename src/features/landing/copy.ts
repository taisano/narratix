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
      eyebrow: "DON'T JUST MAKE A CHART. MAKE YOUR POINT.",
      heading: 'チャートは作れる。\nでも、伝わらない。',
      description: 'Slide Story Coachは、言いたいことの相談や伝える目的から、ふさわしい切り口とチャート構成へ導くスライド作成支援サービスです。形式を選ぶ前に「何を、どう伝えるか」を整理できます。',
      primaryCta: '相談して作り始める',
      problemHeading: 'とにかく作る、から\n伝わるように作る、へ。',
      problemBody: 'ExcelやPowerPointを開き、まずチャートを作る。けれど「結局、何が言いたいの？」となってしまう。Slide Story Coachは、作図の前に問いと主張を整理し、相手に届く見せ方を一緒に考えます。',
      finalHeading: '作り始める前に、相談する。\n伝わる一枚は、そこから始まる。',
      finalCta: '相談して作り始める',
    },
    en: {
      eyebrow: "DON'T JUST MAKE A CHART. MAKE YOUR POINT.",
      heading: 'You can make the chart.\nBut does it land?',
      description: 'Slide Story Coach starts from what you want to say, or the purpose of your slide, and guides you to the right angle and chart layout. Decide what to say and how, before you pick a format.',
      primaryCta: 'Start with a consultation',
      problemHeading: 'From “just make it”\nto “make it land.”',
      problemBody: 'You open Excel or PowerPoint and build a chart first. Then someone asks, “So what’s the point?” Slide Story Coach helps you frame the question and the message before you draw, and works out a view your audience will get.',
      finalHeading: 'Consult before you build.\nThat is where a slide that lands begins.',
      finalCta: 'Start with a consultation',
    },
  },
  // B：成果起点
  b: {
    ja: {
      eyebrow: 'CONSULTING-QUALITY SLIDES FOR EVERYONE',
      heading: '誰でも、コンサル級の\n伝わるスライドを。',
      description: '言いたいことを相談するか、伝える目的を選ぶだけ。コンサルタントのように問いと切り口を整理し、ふさわしいチャート構成から編集可能なPowerPointまで導きます。',
      primaryCta: 'コンサル級の一枚を作る',
      problemHeading: '考え方も、見せ方も。\nプロの型を、誰にでも。',
      problemBody: '伝わるスライドには、問いの立て方、切り口の選び方、情報の組み合わせ方があります。Slide Story Coachなら、そのプロセスをコーチと進めながら、実務で使える一枚に仕上げられます。',
      finalHeading: '考え方から整うから、\n誰でも、伝わる一枚へ。',
      finalCta: 'コンサル級の一枚を作る',
    },
    en: {
      eyebrow: 'CONSULTING-QUALITY SLIDES FOR EVERYONE',
      heading: 'Consulting-quality slides\nanyone can make.',
      description: 'Just describe what you want to say, or pick the purpose. Like a consultant, it frames the question and the angle, then takes you from the right chart layout to an editable PowerPoint.',
      primaryCta: 'Make a consulting-grade slide',
      problemHeading: 'How to think, and how to show.\nThe pro playbook, for everyone.',
      problemBody: 'Slides that land follow a method: how to frame the question, choose the angle and combine the information. With Slide Story Coach you work through that process with a coach and finish with a slide you can use at work.',
      finalHeading: 'Get the thinking right,\nand anyone can make a slide that lands.',
      finalCta: 'Make a consulting-grade slide',
    },
  },
};

export const copyFor = (v: Variant, locale: Locale): VariantCopy => VARIANT_COPY[v][locale];
