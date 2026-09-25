import Builder from '@/features/editor/Builder';
import { BetaGate } from '@/features/beta/BetaGate';

export default function Home() {
  return <BetaGate reason="editor"><Builder /></BetaGate>;
}
