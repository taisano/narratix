import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chart Advisor',
  description: '言いたいことから設計し、編集できるPPTで出力するチャート作成ツール',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
