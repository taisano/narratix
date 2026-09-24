import type { Metadata } from 'next';
import StartFlow from '@/features/start/StartFlow';

export const metadata: Metadata = { title: '新しく作る | Chart Advisor' };

export default function StartPage() {
  return <StartFlow />;
}
