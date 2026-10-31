import { familyOf, datasetFor, newSlideId, ownDataRef, type ExtraData, type ProjectState, type SlideState } from './project';

/** スライドセットに入れるスライド1枚の指定：どのプロジェクト（マイチャート・テンプレート）の何枚目か */
export interface SetPick {
  /** 取り出す元（同じ元から複数枚選んでも、データは1つにまとまる） */
  sourceId: string;
  /** 元の名前（「別のデータ」の名前になる） */
  sourceLabel: string;
  project: ProjectState;
  index: number;
}

export type CombineResult = { ok: true; project: ProjectState } | { ok: false; reason: 'empty' | 'locale_mismatch' };

/**
 * 自分で作ったチャート・テンプレートから選んだスライドを、1つのプロジェクト（スライドセット）にまとめる。
 * - 1枚目の元のデータ・出典は共通のデータとして残し、ほかの元のスライドは「このスライドだけのデータ」（extra）で持つ。
 *   元が違えば表も出典も違うので、データは元ごとに分け、混ぜない（同じ元の同じデータを使うスライドは、データを1つに共有する）。
 * - スライドは複製し、id は新しくする（元のチャートは変わらない）。
 * - 言語が違う元は一緒にできない。
 */
export function combineSlides(picks: readonly SetPick[]): CombineResult {
  if (!picks.length) return { ok: false, reason: 'empty' };
  const first = picks[0]!;
  const locale = first.project.slideLocale;
  if (picks.some((p) => p.project.slideLocale !== locale)) return { ok: false, reason: 'locale_mismatch' };

  const { origin: _o, recommendation: _r, draft: _d, extra: _e, ...shell } = structuredClone(first.project);
  void _o; void _r; void _d; void _e;
  const out: ProjectState = { ...shell, slides: [], current: 0 };
  const extra: Record<string, ExtraData> = {};
  /** 元ごと・データごとに、割り当てたデータの id（共通のデータを使う時は '@'） */
  const assigned = new Map<string, string>();
  const labels = new Set<string>();
  const labelOf = (base: string) => {
    let l = base; let n = 2;
    while (labels.has(l)) l = `${base} (${n++})`;
    labels.add(l);
    return l;
  };

  for (const pick of picks) {
    const src = pick.project;
    const s0 = src.slides[pick.index];
    if (!s0) continue;
    const slide: SlideState = { ...structuredClone(s0), id: newSlideId() };
    delete slide.dataRef;
    const fam = familyOf(slide.chart);
    const own = ownDataRef(src, s0);
    const key = `${pick.sourceId}|${own ?? `@${fam}`}`;
    if (pick.sourceId === first.sourceId && !own) {
      // 1枚目と同じ元の共通のデータ：そのまま共通のデータとして使う
      out.slides.push(slide);
      continue;
    }
    let id = assigned.get(key);
    if (!id) {
      id = `d${newSlideId().slice(1)}`;
      assigned.set(key, id);
      const data = own ? src.extra![own]!.dataset : datasetFor(src, slide.chart);
      const meta = own ? src.extra![own]! : null;
      extra[id] = {
        label: labelOf(pick.sourceLabel), family: fam, dataset: structuredClone(data),
        source: meta?.source ?? src.source,
        ...((meta?.sourceMeta ?? src.sourceMeta) ? { sourceMeta: structuredClone((meta?.sourceMeta ?? src.sourceMeta)!) } : {}),
      };
    }
    out.slides.push({ ...slide, dataRef: id });
  }
  if (!out.slides.length) return { ok: false, reason: 'empty' };
  if (Object.keys(extra).length) out.extra = extra;
  return { ok: true, project: out };
}
