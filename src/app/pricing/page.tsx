import type { Metadata } from 'next';
import PricingPage from '@/features/plans/PricingPage';

export const metadata: Metadata = {
  title: '料金 | Biz Slide Coach',
  description: 'ベータ版は無料。ベータの後に予定しているプランと料金（Plus・Pro）をご案内します。',
};

export default function Page() {
  return <PricingPage />;
}
