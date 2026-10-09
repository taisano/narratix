import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '@/i18n/ui';
import { emptySlide, newStory } from './model';
import { NeedPicker, QuestionList } from './QuestionMapView';

const render = (edited = false, version: 1 | 2 = 2) => renderToStaticMarkup(
  <I18nProvider locale="ja">
    <QuestionList
      draft
      story={newStory('ja', { questionMapVersion: version, slides: [emptySlide({
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
    expect(html.indexOf('全体として何が起きているか')).toBeLessThan(html.indexOf('地域別売上の全体的な変化を確かめます。'));
    expect(html).toContain('地域別・期間別の売上');
    expect(html).toContain('Coachから確認');
  });
  it('従来方式(版1)では、問いを編集した後は元の問い向けの具体化を表示しない', () => {
    const html = render(true, 1);
    expect(html).not.toContain('地域別売上の全体的な変化を確かめます。');
  });
  it('専用ロール方式(版2)では、具体化は問いの文ではなくproof_needsに付くので、問いを編集しても残る', () => {
    const html = render(true, 2);
    expect(html).toContain('地域別売上の全体的な変化を確かめます。');
    expect(html).toContain('地域別・期間別の売上');
  });
  it('②の簡素化：役割名・C印・今回のStoryでは・（グラフ）を出さず、①形式・矢印・鉛筆・巻末に移動・×を出す', () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="ja">
        <QuestionList draft story={newStory('ja', { questionMapVersion: 2, slides: [
          emptySlide({ id: 'e', routeRole: 'STORY.EXECUTIVE_SUMMARY', question: 'Executive Summary', presentationMode: 'TEXT' }),
          emptySlide({ id: 'a', routeRole: 'AIMED.IMPACT', question: '全体として何が起きているか', proofNeeds: ['OVERALL_CHANGE'],
            personalization: { explanation: '推移を確かめます。', confidence: 'proposed', requiredDataHints: ['売上', '年'] } }),
          emptySlide({ id: 'b', routeRole: 'AIMED.IMPACT', question: '次の問い', proofNeeds: ['OVERALL_CHANGE'],
            personalization: { explanation: '二つ目の説明。', confidence: 'proposed', requiredDataHints: ['地域'] } }),
        ] })} onChange={() => undefined} />
      </I18nProvider>,
    );
    expect(html).toContain('①');
    expect(html).toContain('②');
    expect(html).not.toContain('Executive Summary');
    expect(html).not.toContain('今回のStoryでは');
    expect(html).not.toContain('>C<');
    expect(html).not.toContain('（グラフ）');
    expect(html).not.toContain('（言葉）');
    expect(html).not.toContain('メインストーリー');
    expect(html).not.toContain('付録');
    expect(html.match(/aria-hidden="true"><span>Storyの流れ<\/span><span>このStoryで確認すること/g)?.length).toBe(1); // 列見出しは一度だけ
    expect(html.match(/dataChipsLabel[^>]*>必要データ/g)?.length).toBe(2);
    for (const l of ['上へ移動', '下へ移動', '問いを編集', 'Storyから外す']) expect(html).toContain(`aria-label="${l}"`);
    expect(html).toContain('巻末に移動');
    expect(html).toContain('売上');
    expect(html).toContain('推移を確かめます。');
  });
  it('Diagnosisの役割名をRoute定義の日英文言から表示する', () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="ja">
        <QuestionList story={newStory('ja', { primaryRoute: 'DIAGNOSIS', slides: [emptySlide({ routeRole: 'DIAGNOSIS.DRIVER', question: '何が増減へ寄与したか' })] })} onChange={() => undefined} />
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
  it('追加した4 Routeも内部名ではなく日英の自然な役割名を表示する', () => {
    const ja = renderToStaticMarkup(
      <I18nProvider locale="ja">
        <>
          <QuestionList story={newStory('ja', { primaryRoute: 'URGENCY', slides: [emptySlide({ routeRole: 'URGENCY.WINDOW', question: 'いつまでか' })] })} onChange={() => undefined} />
          <QuestionList story={newStory('ja', { primaryRoute: 'PROOF', slides: [emptySlide({ routeRole: 'PROOF.BOUNDARY', question: 'どこまでか' })] })} onChange={() => undefined} />
          <QuestionList story={newStory('ja', { primaryRoute: 'BUSINESS_CASE', slides: [emptySlide({ routeRole: 'BUSINESS_CASE.STAGE_GATES', question: '次へ進む条件は' })] })} onChange={() => undefined} />
          <QuestionList story={newStory('ja', { primaryRoute: 'TRANSFORMATION', slides: [emptySlide({ routeRole: 'TRANSFORMATION.GOVERNANCE', question: 'どう推進するか' })] })} onChange={() => undefined} />
        </>
      </I18nProvider>,
    );
    expect(ja).toContain('動ける期間');
    expect(ja).toContain('成立範囲');
    expect(ja).toContain('段階判断');
    expect(ja).toContain('推進方法');
    expect(ja).not.toMatch(/URGENCY\.|PROOF\.|BUSINESS_CASE\.|TRANSFORMATION\./);

    const en = renderToStaticMarkup(
      <I18nProvider locale="en">
        <>
          <QuestionList story={newStory('en', { primaryRoute: 'BUSINESS_CASE', slides: [emptySlide({ routeRole: 'BUSINESS_CASE.STAGE_GATES', question: 'Conditions' })] })} onChange={() => undefined} />
          <QuestionList story={newStory('en', { primaryRoute: 'TRANSFORMATION', slides: [emptySlide({ routeRole: 'TRANSFORMATION.GOVERNANCE', question: 'Governance' })] })} onChange={() => undefined} />
        </>
      </I18nProvider>,
    );
    expect(en).toContain('Stage gates');
    expect(en).toContain('Governance');
  });
});

describe('NeedPicker の開閉', () => {
  it('collapsible では「＋ 問いを追加・変更」で始まり、旧注意書きを出さない', () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="ja"><NeedPicker story={newStory('ja')} lead="長い説明" collapsible onChange={() => undefined} /></I18nProvider>,
    );
    expect(html).toContain('＋ 問いを追加・変更');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('今回のStoryでは');
    expect(html).not.toContain('長い説明');
  });
});
