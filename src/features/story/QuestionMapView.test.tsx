import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '@/i18n/ui';
import { emptySlide, newStory } from './model';
import { QuestionList } from './QuestionMapView';

const render = (edited = false) => renderToStaticMarkup(
  <I18nProvider locale="ja">
    <QuestionList
      draft
      story={newStory('ja', { slides: [emptySlide({
        id: 'q1', routeRole: 'AIMED.IMPACT', question: '全体として何が起きているか', questionEdited: edited,
        personalization: {
          explanation: '地域別売上の全体的な変化を確かめます。', confidence: 'proposed',
          requiredDataHints: ['地域別・期間別の売上'], unresolvedQuestion: '比較する期間はどこからどこまでですか？',
        },
      })] })}
      onChange={() => undefined}
    />
  </I18nProvider>,
);

describe('Question Map の具体化表示', () => {
  it('一般的な問いの後に、今回の説明・必要データ・重要な確認を表示する', () => {
    const html = render();
    expect(html.indexOf('全体として何が起きているか')).toBeLessThan(html.indexOf('今回のStoryでは'));
    expect(html).toContain('地域別売上の全体的な変化を確かめます。');
    expect(html).toContain('必要になりそうなデータ');
    expect(html).toContain('地域別・期間別の売上');
    expect(html).toContain('Coachから確認');
  });
  it('問いを編集した後は、元の問い向けの具体化を表示しない', () => {
    const html = render(true);
    expect(html).not.toContain('今回のStoryでは');
    expect(html).not.toContain('地域別売上の全体的な変化を確かめます。');
  });
});
