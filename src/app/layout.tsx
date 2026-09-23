import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chart Advisor',
  description: '言いたいことから設計し、編集できるPPTで出力するチャート作成ツール',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // ブラウザ拡張が <html> に属性を足すことによる警告を抑える（<html> 要素のみに効く）
    <html lang="ja" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
