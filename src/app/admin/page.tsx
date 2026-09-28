import type { Metadata } from 'next';
import AdminPage from '@/features/admin/AdminPage';

export const metadata: Metadata = { title: '管理 | Biz Slide Coach', robots: { index: false } };

export default function Page() {
  return <AdminPage />;
}
