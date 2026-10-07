import type { SupabaseClient } from '@supabase/supabase-js';
import type { Scene } from '@/engine';
import { layoutDataSlide } from '@/engine/layout/data-slide';
import { buildPptx } from '@/export/pptx/scene-to-pptx';
import { slidePptFont } from '@/registry';
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

export const PPTX_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export type PptxOptions = {
  project: ProjectState; name: string; dataSlide: boolean; client: SupabaseClient | null; count: boolean; admin: boolean; t: T;
};
export type PptxBuilt = { ok: true; file: File; left: number | null } | { ok: false; limit: true };

/**
 * プレビューと同じ Scene から PPTX のファイルを作る（全スライドを順に、最後に元データ）。エディターとかんたん修正で同じもの。
 * count が true なら、出力の回数を数える（上限を超えたら limit）。left は今月の残り（管理者・数えない時は null）。
 */
export async function buildProjectPptx(o: PptxOptions): Promise<PptxBuilt> {
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
  const font = slidePptFont(o.project.design?.font, state.slideLocale);
  const mark = t('ppt.watermark');
  const slides = results.filter((_, i) => ready[i]).map((r) => ({ scene: withWatermark(r.scene!, mark), font }));
  if (o.dataSlide) slides.push({ scene: withWatermark(layoutDataSlide(toDataset(state), state.slideLocale), mark), font });
  const pptx = buildPptx(Pptx, slides, { title: viewOf(o.project, 0).title });
  const blob = (await pptx.write({ outputType: 'blob' })) as Blob;
  return { ok: true, file: new File([blob], pptFileName(o.name || viewOf(o.project, 0).title), { type: PPTX_TYPE }), left };
}

/** ファイルをダウンロードさせる */
export function downloadFile(file: File): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** PPTX を作ってダウンロードする */
export async function downloadProjectPptx(o: PptxOptions): Promise<{ ok: true; left: number | null } | { ok: false; limit: true }> {
  const r = await buildProjectPptx(o);
  if (!r.ok) return r;
  downloadFile(r.file);
  return { ok: true, left: r.left };
}

/** 端末の共有（メール・メッセージなど）でファイルを送れるか */
export const canShareFile = (file: File): boolean => {
  try { return typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [file] }); } catch { return false; }
};

/**
 * 送る：
 * - スマホ・タブレット（と一部のパソコン）：端末の共有の画面を開き、PPT を添付したまま、メールなど好きなアプリで送れる
 * - 共有できない時：PPT をダウンロードして、いつものメールソフトを件名と本文を入れて開く（添付は自分で）
 * 共有の画面は「押した直後」にしか開けないブラウザがある。間に合わなかった時は 'retry'（もう一度押してもらう）
 */
export async function sendFile(file: File, subject: string, body: string): Promise<'shared' | 'cancelled' | 'retry' | 'mailto'> {
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title: subject, text: body });
      return 'shared';
    } catch (e) {
      const name = (e as Error).name;
      if (name === 'AbortError') return 'cancelled';
      if (name === 'NotAllowedError') return 'retry';
      // それ以外は、メールソフトで送る方法に切り替える
    }
  }
  downloadFile(file);
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return 'mailto';
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
