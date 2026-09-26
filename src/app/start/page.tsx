import type { Metadata } from 'next';
import StartFlow from '@/features/start/StartFlow';
import { chartThumbs } from '@/features/start/chart-catalog';

export const metadata: Metadata = { title: '新しく作る | Slide Story Coach' };

// チャートのカタログの絵は、ビルドの時に一度だけ描く
const thumbs = chartThumbs();

export default function StartPage() {
  return <StartFlow thumbs={thumbs} />;
}
