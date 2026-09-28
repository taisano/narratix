import type { Metadata } from 'next';
import PrivacyPage from '@/features/privacy/PrivacyPage';

export const metadata: Metadata = { title: 'データの取り扱い | Biz Slide Coach' };

export default function Page() {
  return <PrivacyPage />;
}
