import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { DraftAnswer, DraftPanel } from './DraftPanel';
import { DraftPaste } from './DraftPaste';
import { planFromPurpose } from './plan';
import * as F from '../data/draft/fixtures';
import { analyzeTable, resolveRoles, type DraftSource } from '../data/draft/session';

function draftOf(tsv: string, auto = true): DraftSource {
  const a = analyzeTable(tsv); if (!a.ok) throw new Error();
  const r = resolveRoles(a.profile, null);
  return { tsv, map: auto && r.status === 'ready' ? r.map : null, shape: null, question: '' };
}
const render = (tsv: string, auto = true) =>
  renderToString(createElement(DraftPanel, { plan: { ...planFromPurpose('comparison'), draft: draftOf(tsv, auto) }, setPlan: () => {}, onNext: () => {} }));

describe('実データ下書きの画面（描画の確認）', () => {
  it('国別売上：実データで描いた候補（横棒・縦棒）が並び、データの名前がプレビューに出る', () => {
    const html = render(F.ONE_METRIC_TSV);
    expect(html).toContain('ZZ_ALAND');
    expect(html.match(/<svg/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('順位を見る');
  });
  it('月別（縦持ち）：折れ線・時系列縦棒・積み上げが並ぶ', () => {
    const html = render(F.LONG_TSV);
    expect(html).toContain('ZZ_PRODUCT_ALPHA');
    expect(html).toContain('推移を見る');
  });
  it('実績と予算：差の候補が先に並び、形ごとの見出しが出る。7か国型は関係（散布図・バブル）が最後に並ぶ', () => {
    const ab = render(F.ACTUAL_BUDGET_TSV);
    expect(ab).toContain('実績と比較先の差');
    expect(ab).toContain('ZZ_PRODUCT_ALPHA');
    expect(ab.indexOf('実績と比較先の差')).toBeLessThan(ab.indexOf('項目の大きさの比較'));
    const seven = render(F.SEVEN_TSV);
    expect(seven).toContain('指標どうしの関係');
    expect(seven.indexOf('項目の大きさの比較')).toBeLessThan(seven.indexOf('指標どうしの関係'));
  });
  it('列の使い方の確認が必要な時は、各列の選択肢が出る（推測で描かない）', () => {
    const html = render(F.ONE_METRIC_TSV, false);
    expect(html).toContain('<select');
    expect(html).not.toContain('<svg');
  });
  it('貼り付け欄：読み取り結果と、AI に送る内容の説明が出る。読めない表は理由が出る', () => {
    const ok = renderToString(createElement(DraftPaste, { value: F.ONE_METRIC_TSV, onChange: () => {} }));
    expect(ok).toContain('4行 × 2列を読み取りました');
    expect(ok).toContain('セルの値は送りません');
    const bad = renderToString(createElement(DraftPaste, { value: '###', onChange: () => {} }));
    expect(bad).toMatch(/読み取れません|読み取りました/);
  });
});

const BUBBLE_TSV = '製品\t市場成長率(%)\t営業利益率(%)\t売上(億円)\n製品A\t12.5\t18.2\t240\n製品B\t8.1\t11.5\t420\n製品C\t3.2\t6.8\t610\n製品D\t15.8\t21.0\t90\n製品E\t5.5\t9.1\t180\n製品F\t1.2\t4.3\t350';
const STORE_TSV = '店舗\t客数\t客単価\n店舗A\t1200\t850\n店舗B\t900\t1100\n店舗C\t1500\t780\n店舗D\t700\t1300';
const answer = (tsv: string, recommended: Parameters<typeof DraftAnswer>[0]['recommended'], ready = true) =>
  renderToString(createElement(DraftAnswer, { plan: { ...planFromPurpose('comparison'), draft: draftOf(tsv) }, setPlan: () => {}, onNext: () => {}, recommended, ready }));

describe('1st View の答え（推奨チャート1枚）', () => {
  it('関係の問い：推奨の散布図を実データで1枚。散布図・バブル・象限は同じ場所で切り替える。棒グラフは「ほかの見せ方」に畳む', () => {
    const html = answer(BUBBLE_TSV, 'REL_SCATTER');
    expect(html).toContain('あなたの問いへの答え');
    expect(html).toContain('製品A');
    expect(html).not.toContain('AAA');
    expect(html).not.toContain('サンプルデータ');
    expect(html.match(/role="tab"/g)).toHaveLength(3);
    expect(html).toContain('関係と規模を1枚で');
    // 棒グラフ（項目の大小）は閉じた折りたたみの中だけ
    const [main, rest] = html.split('<details');
    expect(rest).toBeTruthy();
    expect(main).not.toContain('順位を見る');
    expect(rest!.slice(0, 40)).not.toContain(' open');
    expect(rest).toContain('順位を見る');
    // 実データから計算した読み取り
    expect(html).toContain('強い正の関係');
    expect(html).toContain('r = 0.99');
    expect(html).toContain('件数が少ない');
    expect(html).toContain('相関は因果を示しません');
    // 作成ボタンは1つ
    expect(html.match(/この形でスライドを作成/g)).toHaveLength(1);
  });
  it('順位・比較の問い：同じ仕組みで棒グラフが推奨の1枚になり、散布図は畳まれる（種類を決め打ちしない）', () => {
    const html = answer(BUBBLE_TSV, 'COMP_RANK');
    const [main, rest] = html.split('<details');
    expect(main).toContain('順位を見る');
    expect(main).toContain('最も大きいのは製品D');
    expect(rest).toContain('指標どうしの関係');
  });
  it('店舗表：散布図が出て、バブルは出ない。大きさの列が無い理由を表示する', () => {
    const html = answer(STORE_TSV, 'REL_SCATTER');
    expect(html).toContain('店舗A');
    expect(html).not.toContain('関係と規模を1枚で</button>');
    expect(html).toContain('大きさに使える列が無い');
    expect(html).toContain('強い負の関係');
  });
  it('実績と予算：差の読み取り（増えた・減った項目の数、最大の増減）が出る', () => {
    const html = answer(F.ACTUAL_BUDGET_TSV, 'COMP_VARIANCE');
    expect(html).toContain('増えた項目が2、減った項目が1');
    expect(html).toContain('+200');
  });
  it('伝えたいことが未選択の間は作成できない（理由を表示）', () => {
    const html = answer(STORE_TSV, 'REL_SCATTER', false);
    expect(html).toContain('disabled');
    expect(html).toContain('伝えたいことを選ぶと、作成できます');
  });
  it('列の使い方が未決定なら、この場所で選んでもらう（推測で描かない）', () => {
    const html = renderToString(createElement(DraftAnswer, { plan: { ...planFromPurpose('comparison'), draft: draftOf(STORE_TSV, false) }, setPlan: () => {}, onNext: () => {}, recommended: null, ready: true }));
    expect(html).toContain('<select');
    expect(html).not.toContain('<svg');
  });
  it('正確な数値を聞く相談：表が答えになる（正確な値を丸めずに読める）。グラフは同じ場所のタブと「ほかの見せ方」に残る', () => {
    const a = analyzeTable(F.ACTUAL_BUDGET_TSV); if (!a.ok) throw new Error();
    const r = resolveRoles(a.profile, null); if (r.status !== 'ready') throw new Error();
    const html = renderToString(createElement(DraftAnswer, { plan: { ...planFromPurpose('comparison'), draft: { tsv: F.ACTUAL_BUDGET_TSV, map: r.map, shape: null, question: '正確な数値を確認したい' } }, setPlan: () => {}, onNext: () => {}, recommended: 'COMP_VARIANCE', ready: true }));
    expect(html).toContain('あなたの問いへの答え');
    expect(html).toContain('正確な増減を表で見る');
    expect(html).toContain('1,200');
    expect(html).toContain('正確な数値を、丸めずに確認できる'.slice(0, 0) + '正確な増減を表で見る');
  });
});

