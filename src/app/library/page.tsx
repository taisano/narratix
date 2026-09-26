import type { Metadata } from 'next';
import LibraryPage from '@/features/library/LibraryPage';

export const metadata: Metadata = { title: 'Library | Slide Story Coach' };

export default function Library() {
  return <LibraryPage />;
}
