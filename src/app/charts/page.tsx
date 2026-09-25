import type { Metadata } from 'next';
import MyPage from '@/features/my-page/MyPage';
import { BetaGate } from '@/features/beta/BetaGate';

export const metadata: Metadata = { title: 'マイページ | Slide Story Coach' };

export default function ChartsPage() {
  return <BetaGate reason="myPage"><MyPage /></BetaGate>;
}
