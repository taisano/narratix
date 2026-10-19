import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { DraftPanel } from './DraftPanel';
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
