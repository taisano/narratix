import { describe, expect, it } from 'vitest';
import { planFromPurpose } from '../start/plan';
import { proposalSvg } from '../start/dishView';
import { projectFromDraft, rebuildProjectFromDraft } from './project';
import { projectFromCanonical, projectToCanonical } from '../data/canonical';
import * as F from '../data/draft/fixtures';
import { analyzeTable, loadDraft, resolveRoles } from '../data/draft/session';

/** 実データ下書きの総当たり：いろいろな表で、出る候補すべてが「描ける・スライドにできる・保存の形に往復できる・作り直せる」 */
const BUBBLE = '製品\t市場成長率(%)\t営業利益率(%)\t売上(億円)\n製品A\t12.5\t18.2\t240\n製品B\t8.1\t11.5\t420\n製品C\t3.2\t6.8\t610\n製品D\t15.8\t21.0\t90\n製品E\t5.5\t9.1\t180\n製品F\t1.2\t4.3\t350';
const SHOPS = '店舗\t売上(万円)\t粗利率\n渋谷店\t1200\t31.5%\n新宿店\t980\t28.1%\n池袋店\t760\t26.4%\n横浜店\t640\t29.8%';
const MONTHLY_MIXED = ['月\t売上(万円)\t粗利率\t新規顧客数(人)\t解約率', '6月\t5,200\t31.2%\t128\t2.4%', '7月\t5,350\t31.8%\t135\t2.2%', '8月\t5,500\t30.9%\t162\t2.6%', '9月\t5,700\t32.4%\t149\t2.1%'].join('\n');
const MONTHLY_SAME = ['月\t東京\t大阪\t名古屋', '2026年1月\t100\t80\t60', '2026年2月\t110\t85\t62', '2026年3月\t120\t90\t65', '2026年4月\t125\t95\t70'].join('\n');

const TABLES: Record<string, string> = {
  LONG: F.LONG_TSV, WIDE: F.WIDE_TSV, SEVEN: F.SEVEN_TSV, PERIOD_ACROSS: F.PERIOD_ACROSS_TSV, ONE_METRIC: F.ONE_METRIC_TSV, ACTUAL_BUDGET: F.ACTUAL_BUDGET_TSV,
  BUBBLE, SHOPS, MONTHLY_MIXED, MONTHLY_SAME,
};

let checked = 0;

describe('実データ下書きの総当たり', () => {
  for (const [name, tsv] of Object.entries(TABLES)) {
    it(`${name}：全候補が描けて、スライドにでき、保存の形に往復でき、作り直せる`, () => {
      const a = analyzeTable(tsv);
      if (!a.ok) throw new Error('unreadable');
      const r = resolveRoles(a.profile, null);
      if (r.status !== 'ready') return; // 自動で決められない表は、手で指定する（ここでは対象外）
      const d = { tsv, map: r.map, shape: null, question: '' };
      const l = loadDraft(d);
      if (!l.ok) return;
      for (const set of l.sets) {
        for (const c of set.candidates.candidates) {
          const label = `${name}/${set.shape}/${c.recipe}`;
          expect(proposalSvg({ recipe: c.recipe }, 'ja', set.dataset), label).toBeTruthy();
          const p = projectFromDraft({ ...planFromPurpose('comparison'), draft: { ...d, pick: c.recipe } }, 'ja');
          expect(p, label).not.toBeNull();
          expect(p!.slides[0]!.recipe, label).toBe(c.recipe);
          expect(projectFromCanonical(projectToCanonical(p!)).slides[0]!.recipe, label).toBe(c.recipe);
          expect(rebuildProjectFromDraft(p!, p!.draft!.map).ok, label).toBe(true);
          checked++;
        }
      }
    });
  }
  it('十分な数の候補を通した（早く抜けて何も見ていない、ではない）', () => {
    expect(checked).toBeGreaterThanOrEqual(40);
  });
});
