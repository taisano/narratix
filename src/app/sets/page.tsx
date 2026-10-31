import type { Metadata } from 'next';
import SlideSetPage from '@/features/sets/SlideSetPage';
import { BetaGate } from '@/features/beta/BetaGate';

export const metadata: Metadata = { title: 'スライドセット | Biz Slide Coach' };

export default function SetsPage() {
  return <BetaGate reason="myPage"><SlideSetPage /></BetaGate>;
}
