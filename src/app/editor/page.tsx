import type { Metadata } from 'next';
import Builder from '@/features/editor/Builder';
import { BetaGate } from '@/features/beta/BetaGate';

export const metadata: Metadata = { title: '編集 | Slide Story Coach' };

export default function EditorPage() {
  return <BetaGate reason="editor"><Builder /></BetaGate>;
}
