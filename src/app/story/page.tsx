import type { Metadata } from 'next';
import StoryRedirect from '@/features/story/StoryRedirect';

export const metadata: Metadata = { title: 'ストーリー | Biz Slide Coach' };

export default function StoryPage() {
  return <StoryRedirect />;
}
