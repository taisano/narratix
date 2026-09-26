import type { SupabaseClient } from '@supabase/supabase-js';
import type { Scene } from '@/engine';
import { layoutDataSlide } from '@/engine/layout/data-slide';
import { buildPptx } from '@/export/pptx/scene-to-pptx';
import { SLIDE_FONTS } from '@/i18n/slide';
import type { MessageKey } from '@/i18n/ui';
import { FREE_PPT_PER_MONTH, recordPptExport } from '@/lib/repo/beta';
import { evaluate } from './preview';
import { viewOf, type ProjectState } from './project';
import { toDataset } from './state';

type T = (k: MessageKey, v?: Record<string, string | number>) => string;

/** 描けるスライド（データがあり、描けたもの） */
export function readySlides(project: ProjectState) {
  const results = project.slides.map((_, i) => evaluate(viewOf(project, i)));
  const ready = results.map((r) => !!r.scene && !r.warnings.some((w) => w.key === 'warn.no_data'));
  return { results, ready, count: ready.filter(Boolean).length };
}

/**
 * プレビューと同じ Scene から PPTX を作ってダウンロードする（全スライドを順に、最後に元データ）。エディターとかんたん修正で同じもの。
 * count が true なら、出力の回数を数える（上限を超えたら limit）。left は今月の残り（管理者・数えない時は null）。
 */
export async function downloadProjectPptx(o: {
  project: ProjectState; name: string; dataSlide: boolean; client: SupabaseClient | null; count: boolean; admin: boolean; t: T;
}): Promise<{ ok: true; left: number | null } | { ok: false; limit: true }> {
  const { t } = o;
  const { results, ready } = readySlides(o.project);
  let left: number | null = null;
  // ベータ版：登録した人は、無料で月10回まで（Supabase が未設定の手元の開発では数えない）
  if (o.count && o.client) {
    const r = await recordPptExport(o.client).catch((e: Error) => { throw new Error(t('ppt.checkError', { message: e.message })); });
    if (!r.allowed) return { ok: false, limit: true };
    // 管理者は上限なし（残り回数は出さない）
    left = o.admin ? null : Math.max(0, FREE_PPT_PER_MONTH - r.used);
  }
  const { default: Pptx } = await import('pptxgenjs');
  const state = viewOf(o.project);
  const font = SLIDE_FONTS[state.slideLocale];
  const mark = t('ppt.watermark');
  const slides = results.filter((_, i) => ready[i]).map((r) => ({ scene: withWatermark(r.scene!, mark), font }));
  if (o.dataSlide) slides.push({ scene: withWatermark(layoutDataSlide(toDataset(state), state.slideLocale), mark), font });
  const pptx = buildPptx(Pptx, slides, { title: viewOf(o.project, 0).title });
  const blob = (await pptx.write({ outputType: 'blob' })) as Blob;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = pptFileName(o.name || viewOf(o.project, 0).title);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return { ok: true, left };
}

/** PPT の各スライドの右下に、小さく透かし（ベータ版） */
export function withWatermark(scene: Scene, text: string): Scene {
  return { ...scene, items: [...scene.items, { kind: 'text', x: scene.width - 3.6, y: scene.height - 0.42, w: 3.2, h: 0.26, lines: [{ t: text, size: 8, color: '#9AA3AD' }], align: 'right', valign: 'middle' }] };
}

/** ファイル名（使えない文字を除き、長さを抑える） */
export function pptFileName(title: string): string {
  const base = title.replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 40);
  return (base || 'slide-story-coach') + '.pptx';
}
