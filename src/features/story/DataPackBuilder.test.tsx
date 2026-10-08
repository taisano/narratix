import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '@/i18n/ui';
import type { ProofNeedId } from '@/registry';
import { addRequest, fallbackDataPack, removeField } from './dataPack';
import { EditStep, PreviewStep } from './DataPackBuilder';
import { isCommitEnter } from './ime';
import { emptySlide, newStory } from './model';
import type { StoryDataPackPlan } from './dataPackPlan';

const q = (id: string, question: string, proofNeeds: ProofNeedId[]) => emptySlide({ id, question, proofNeeds });
const story = newStory('ja', {
  title: 'インバウンド', decisionQuestion: 'どの市場を優先するか', consultation: '社内の戦略メモ：A社を買収する前提で…',
  slides: [q('q1', '全体はどう変わってきたか', ['OVERALL_CHANGE']), q('q2', '今は何で構成されているか', ['CURRENT_MIX'])],
});
const seed = fallbackDataPack(story);
const noop = () => undefined;
const ja = (node: React.ReactElement) => renderToStaticMarkup(<I18nProvider locale="ja">{node}</I18nProvider>);
const edit = (plan: StoryDataPackPlan, selected = 'r-trend') => ja(<EditStep story={story} plan={plan} seed={seed} commit={noop} selected={selected} setSelected={noop} onNext={noop} />);
const preview = (plan: StoryDataPackPlan) => ja(<PreviewStep story={story} plan={plan} commit={noop} onBack={noop} />);

describe('Enter で確定してよいか（日本語の変換中は確定しない）', () => {
  it('変換中・変換を確定する Enter では確定しない', () => {
    expect(isCommitEnter({ key: 'Enter' }, false)).toBe(true);
    expect(isCommitEnter({ key: 'Enter' }, true)).toBe(false);
    expect(isCommitEnter({ key: 'Enter', nativeEvent: { isComposing: true } }, false)).toBe(false);
    expect(isCommitEnter({ key: 'Enter', keyCode: 229 }, false)).toBe(false);
    expect(isCommitEnter({ key: 'a' }, false)).toBe(false);
  });
});

describe('データパックを作る画面：直す', () => {
  it('Dataset の一覧と、選んだ Dataset の項目・使う Question が出る。Dataset ごとに選択が独立している', () => {
    const trend = edit(seed, 'r-trend');
    expect(trend).toContain('項目別の推移');
    expect(trend).toContain('項目別の内訳');
    expect(trend).toContain('全体はどう変わってきたか');
    expect(trend).not.toContain('今は何で構成されているか');
    const mix = edit(seed, 'r-mix');
    expect(mix).toContain('今は何で構成されているか');
    expect(mix).toContain('内訳');
  });
  it('足りないものがなければ「プレビューへ」を押せる。足りなければ Dataset 名つきで理由を出して押せない', () => {
    expect(edit(seed)).not.toMatch(/disabled=""[^>]*>プレビューへ|プレビューの前に/);
    const broken = removeField(seed, 'r-trend', 'value');
    const html = edit(broken);
    expect(html).toContain('プレビューの前に、足りないものがあります');
    expect(html).toContain('項目別の推移：数値の項目がありません');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>プレビューへ/);
    const empty = edit({ version: 1, overview: {}, requests: [] }, '');
    expect(empty).toContain('Datasetが1つもありません');
  });
  it('名前のない Dataset は番号つきの仮の名前で出す', () => {
    expect(edit(addRequest(seed, ''), 'r3')).toContain('名前のないDataset 3');
  });
  it('外した提案の項目は、候補として戻せる', () => {
    const html = edit(removeField(seed, 'r-trend', 'period'));
    expect(html).toContain('外した提案を戻す');
    expect(html).toContain('＋ 期間');
    expect(edit(seed)).not.toContain('外した提案を戻す');
  });
  it('英語の画面では英語の文言が出る', () => {
    const html = renderToStaticMarkup(<I18nProvider locale="en"><EditStep story={story} plan={removeField(seed, 'r-trend', 'value')} seed={seed} commit={noop} selected="r-trend" setSelected={noop} onNext={noop} /></I18nProvider>);
    expect(html).toContain('needs a number field');
    expect(html).toContain('Go to preview');
  });
});

describe('データパックを作る画面：プレビュー', () => {
  it('出力される 00_Overview と各シートがタブで出る。元の相談文は既定では出ない', () => {
    const html = preview(seed);
    expect(html).toContain('00_Overview');
    expect(html).toContain('01_項目別の推移');
    expect(html).toContain('どの市場を優先するか');
    expect(html).not.toContain('社内の戦略メモ');
    expect(html).toContain('Excelをダウンロード');
    expect(html).toContain('メールで依頼する');
  });
  it('元の相談文は、オンにした時だけプレビューに出て、注意書きも出る', () => {
    const html = preview({ ...seed, overview: { include: { consultation: true } } });
    expect(html).toContain('社内の戦略メモ');
    expect(html).toContain('社外に出したくない内容');
  });
  it('Google Sheets で開く手順を案内する', () => {
    expect(preview(seed)).toContain('Googleスプレッドシートで開く');
  });
});
