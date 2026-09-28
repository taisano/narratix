import type { Metadata } from 'next';
import StartFlow from '@/features/start/StartFlow';
import { chartThumbsByLocale } from '@/features/start/chart-catalog';

export const metadata: Metadata = { title: '新しく作る | Biz Slide Coach' };

// チャートのカタログの絵は、ビルドの時に一度だけ描く
const thumbs = chartThumbsByLocale();

export default function StartPage() {
  return <StartFlow thumbs={thumbs} />;
}
