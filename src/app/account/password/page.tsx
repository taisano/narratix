import type { Metadata } from 'next';
import { SetPassword } from '@/features/beta/SetPassword';

export const metadata: Metadata = { title: 'パスワードの設定 | Biz Slide Coach' };

export default function PasswordPage() {
  return <SetPassword />;
}
