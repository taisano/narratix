import type { Metadata } from 'next';
import MyPage from '@/features/my-page/MyPage';

export const metadata: Metadata = { title: 'マイページ | Chart Advisor' };

export default function ChartsPage() {
  return <MyPage />;
}
