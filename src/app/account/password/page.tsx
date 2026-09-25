import type { Metadata } from 'next';
import { SetPassword } from '@/features/beta/SetPassword';

export const metadata: Metadata = { title: 'パスワードの設定 | Slide Story Coach' };

export default function PasswordPage() {
  return <SetPassword />;
}
