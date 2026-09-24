import { composeSlide, type Scene } from '@/engine';
import type { MessageKey } from '@/i18n/ui';
import { sceneToSvg } from '@/render/svg/scene-to-svg';
import { toDataset, validateState, type BuilderState } from './state';

export type Evaluation = {
  scene?: Scene;
  warnings: { key: MessageKey; vars?: Record<string, string | number> }[];
  error?: string;
};

/** 画面の状態 → ViewSpec → 検証 → 配置。エディタのプレビューとマイページの縮小表示で共有 */
export function evaluate(s: BuilderState): Evaluation {
  const v = validateState(s);
  const warnings: Evaluation['warnings'] = [];
  if (v.issues.some((i) => i.code === 'requires_base')) warnings.push({ key: 'warn.requires_base' });
  if (!v.ok) return { warnings, error: v.issues.filter((i) => i.severity === 'error').map((i) => i.message).join(' / ') };
  try {
    const scene = composeSlide(v.spec, toDataset(s));
    for (const w of scene.warnings) warnings.push({ key: `warn.${w.code}` as MessageKey, vars: w.params });
    return { scene, warnings };
  } catch (e) {
    return { warnings, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 縮小表示用の SVG（描けなければ null） */
export function previewSvg(s: BuilderState): string | null {
  const r = evaluate(s);
  return r.scene && !r.warnings.some((w) => w.key === 'warn.no_data') ? sceneToSvg(r.scene, { title: s.title }) : null;
}
