import type { Metadata } from 'next';
import PricingPage from '@/features/plans/PricingPage';

export const metadata: Metadata = {
  title: '料金 | Biz Slide Coach',
  description: '無料プランと Plus の料金をご案内します。',
};

export default function Page() {
  return <PricingPage />;
}
