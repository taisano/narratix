import type { Metadata } from 'next';
import QuickEdit from '@/features/quick/QuickEdit';
import { BetaGate } from '@/features/beta/BetaGate';

export const metadata: Metadata = { title: 'かんたん修正 | Slide Story Coach' };

export default function QuickPage() {
  return <BetaGate reason="editor"><QuickEdit /></BetaGate>;
}
