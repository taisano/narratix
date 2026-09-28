import { redirect } from 'next/navigation';

/** テンプレート（旧 Library）。画面は /library のまま（前に共有したリンクを切らないため） */
export default function Templates() {
  redirect('/library');
}
