import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '@/i18n/ui';
import { emptySlide, newStory } from './model';
import { NeedPicker, QuestionList } from './QuestionMapView';

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
  it('Diagnosisの役割名をRoute定義の日英文言から表示する', () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="ja">
        <QuestionList draft story={newStory('ja', { primaryRoute: 'DIAGNOSIS', slides: [emptySlide({ routeRole: 'DIAGNOSIS.DRIVER', question: '何が増減へ寄与したか' })] })} onChange={() => undefined} />
      </I18nProvider>,
    );
    expect(html).toContain('寄与・関連');
    expect(html).not.toContain('原因</span>');
  });
  it('Diagnosisの問い選択でも結果の向きに合う寄与の文言を出す', () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="ja">
        <NeedPicker
          story={newStory('ja', { primaryRoute: 'DIAGNOSIS', outcomeDirection: 'NEGATIVE' })}
          lead="問いを選ぶ"
          onChange={() => undefined}
        />
      </I18nProvider>,
    );
    expect(html).toContain('どの項目が全体の減少に寄与したか');
    expect(html).not.toContain('どの項目が全体の増加に寄与したか');
  });
  it('Choiceは内部Route名ではなく、自然な役割名を表示する', () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="ja">
        <QuestionList
          draft
          story={newStory('ja', { primaryRoute: 'CHOICE', slides: [
            emptySlide({ routeRole: 'CHOICE.CRITERIA', question: '何を基準に比べるか' }),
            emptySlide({ routeRole: 'CHOICE.RECOMMENDATION', question: 'どの案を選ぶか', presentationMode: 'TEXT' }),
          ] })}
          onChange={() => undefined}
        />
      </I18nProvider>,
    );
    expect(html).toContain('判断基準');
    expect(html).toContain('推奨案');
    expect(html).not.toContain('CHOICE.');
  });
  it('Answer Firstは内部Route名ではなく、自然な役割名を表示する', () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="ja">
        <QuestionList
          draft
          story={newStory('ja', { primaryRoute: 'ANSWER_FIRST', slides: [
            emptySlide({ routeRole: 'ANSWER_FIRST.ANSWER', question: '提案する結論は何か', presentationMode: 'TEXT' }),
            emptySlide({ routeRole: 'ANSWER_FIRST.EVIDENCE', question: '理由を裏づける事実は何か' }),
            emptySlide({ routeRole: 'ANSWER_FIRST.ASK', question: '読み手に何を決めてほしいか', presentationMode: 'TEXT' }),
          ] })}
          onChange={() => undefined}
        />
      </I18nProvider>,
    );
    expect(html).toContain('結論');
    expect(html).toContain('裏づけ');
    expect(html).toContain('依頼');
    expect(html).not.toContain('ANSWER_FIRST.');
  });
});
