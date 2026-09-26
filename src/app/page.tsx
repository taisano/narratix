import type { Metadata } from 'next';
import LandingPage from '@/features/landing/LandingPage';
import { landingSlides } from '@/features/landing/slides';

export const metadata: Metadata = {
  title: 'Slide Story Coach（ベータ版）| 伝えたいことから、伝わる一枚へ',
  description: '言いたいことの相談や伝える目的から、問いと切り口を整理し、チャート構成と編集できる PowerPoint まで導くスライド作成コーチ（ベータ版・無料）。',
};

// 絵（見本のスライド）はビルドの時に一度だけ描く
const slides = landingSlides();

export default function Home() {
  return <LandingPage slides={slides} />;
}
