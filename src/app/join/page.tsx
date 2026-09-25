import type { Metadata } from 'next';
import { BetaGate } from '@/features/beta/BetaGate';
import { JoinDone } from '@/features/beta/JoinDone';

export const metadata: Metadata = { title: '無料登録 | Slide Story Coach' };

/** 無料のベータ登録（相談の入り口などから来る）。登録が終わったら元の画面へ戻る */
export default function JoinPage() {
  return <BetaGate reason="consult"><JoinDone /></BetaGate>;
}
