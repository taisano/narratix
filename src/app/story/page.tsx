import type { Metadata } from 'next';
import StoryOverview from '@/features/story/StoryOverview';
import { BetaGate } from '@/features/beta/BetaGate';

export const metadata: Metadata = { title: 'Story | Biz Slide Coach' };

export default function StoryPage() {
  return <BetaGate reason="myPage"><StoryOverview /></BetaGate>;
}
