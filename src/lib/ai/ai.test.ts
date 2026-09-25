import { describe, expect, it } from 'vitest';
import { BRIDGE_SAMPLE, BRIDGE_TITLE, RELATION_SAMPLE, SAMPLE_DATASET, SAMPLE_TITLE, TREND_SAMPLE, TREND_TITLE, RELATION_TITLE } from '@/features/editor/sample';
import { factsToText, MAX_FACTS, slideFacts } from './facts';
import { checkNumbers, extractNumbers } from './number-check';
import { buildHeadlinePrompt, HeadlineResponseSchema, usableCandidates, validateHeadline, zenLength } from './headline';
import { checkAllowance, planOf } from './plans';
import { disabledProvider } from './provider';

const fact = (f: ReturnType<typeof slideFacts>, id: string) => f.facts.find((x) => x.id === id);

describe('スライドの事実（AI に渡す計算済みの数字）', () => {
  it('推移：系列ごとの CAGR・増減・増加額への寄与と、合計', () => {
    const f = slideFacts({ dataset: TREND_SAMPLE, locale: 'ja' });
    expect(f.period).toEqual({ from: '2021', to: '2025' });
    expect(fact(f, 'cagr:中国')!.value).toBeCloseTo(Math.pow(420 / 250, 1 / 4) - 1, 6);
    expect(fact(f, 'diff:北米')!.value).toBe(110);
    expect(fact(f, 'total:diff')!.value).toBe(1408 - 1030);
    expect(fact(f, 'rank:cagr:1')!.text).toContain('東南アジア');
    expect(factsToText(f)).toContain('[cagr:中国]');
  });

  it('構成（Mekko）：行の伸び率、列の構成比の変化', () => {
    const f = slideFacts({ dataset: SAMPLE_DATASET, locale: 'ja', highlight: 'デュアル' });
    expect(f.highlight).toBe('デュアル');
    expect(fact(f, 'col_share_change:デュアル')!.value).toBeGreaterThan(0);
    expect(fact(f, 'row_rate:中国')!.value).toBeCloseTo(3600 / 1857 - 1, 6);
    // 強調した列の事実が先頭に来る
    expect(f.facts[0]!.id).toContain('デュアル');
  });

  it('要因：始点・終点・差・要因。合う時は「その他 / 調整」を作らない', () => {
    const f = slideFacts({ dataset: BRIDGE_SAMPLE, locale: 'ja' });
    expect(fact(f, 'diff')!.value).toBe(28);
    expect(fact(f, 'driver:原材料費の上昇')!.value).toBe(-22);
    expect(fact(f, 'residual')).toBeUndefined();
  });

  it('関係：相関係数と、両方とも平均より上の項目', () => {
    const f = slideFacts({ dataset: RELATION_SAMPLE, locale: 'ja' });
    expect(fact(f, 'corr')!.value).toBeGreaterThan(0.9);
    expect(fact(f, 'top_right')!.text).toContain('製品D');
  });

  it('表示している項目だけに絞れる。事実の数には上限がある', () => {
    const f = slideFacts({ dataset: TREND_SAMPLE, locale: 'ja', series: ['北米', '中国'] });
    expect(fact(f, 'cagr:欧州')).toBeUndefined();
    expect(slideFacts({ dataset: SAMPLE_DATASET, locale: 'ja' }).facts.length).toBeLessThanOrEqual(MAX_FACTS);
  });
});

describe('数字の確認', () => {
  const trend = slideFacts({ dataset: TREND_SAMPLE, locale: 'ja' });
  const bridge = slideFacts({ dataset: BRIDGE_SAMPLE, locale: 'ja' });

  it('年・順位・数える数・項目名の数字は確かめない', () => {
    expect(extractNumbers('2025年に5地域すべてで伸び、FY2024比で1位', [])).toEqual([]);
    expect(extractNumbers('2024年度 営業利益から', ['2024年度 営業利益'])).toEqual([]);
  });

  it('事実の丸めなら合う、ない数字は合わない', () => {
    expect(checkNumbers('中国の CAGR は13.8%、東南アジアは約20%', trend.facts).ok).toBe(true);
    expect(checkNumbers('中国の CAGR は15%', trend.facts).unknown.map((t) => t.raw)).toEqual(['15%']);
    expect(checkNumbers('営業利益は28億円増えた', bridge.facts).ok).toBe(true);
    expect(checkNumbers('営業利益は30億円増えた', bridge.facts).ok).toBe(false);
    expect(checkNumbers('全角でも２８億円', bridge.facts).ok).toBe(true);
  });

  it('サンプルの見出し（人が書いた文）は、どれも数字の確認を通る', () => {
    for (const [d, t] of [[SAMPLE_DATASET, SAMPLE_TITLE], [TREND_SAMPLE, TREND_TITLE], [BRIDGE_SAMPLE, BRIDGE_TITLE], [RELATION_SAMPLE, RELATION_TITLE]] as const) {
      const f = slideFacts({ dataset: d, locale: 'ja' });
      expect(checkNumbers(t, f.facts, [...d.rows, ...d.cols]).ok).toBe(true);
    }
  });
});

describe('ヘッダーの提案（頼み方と受け取り方）', () => {
  const facts = slideFacts({ dataset: BRIDGE_SAMPLE, locale: 'ja' });

  it('プロンプトに事実と問いが入る。修正では今の文が入る', () => {
    const p = buildHeadlinePrompt({ mode: 'suggest', locale: 'ja', facts, question: '何がどれだけ効いたか', chart: 'ウォーターフォール' });
    expect(p.system).toContain('事実');
    expect(p.user).toContain('[diff]');
    expect(p.user).toContain('何がどれだけ効いたか');
    const r = buildHeadlinePrompt({ mode: 'revise', locale: 'ja', facts, current: '利益が増えた' });
    expect(r.user).toContain('「利益が増えた」');
  });

  it('返ってきた案を確かめ、数字の合わない案は外す', () => {
    const res = HeadlineResponseSchema.parse({
      candidates: [
        { style: 'conclusion', text: '販売数量と価格改定で原材料費の上昇を吸収し、営業利益は28億円増えた', fact_ids: ['diff', 'driver:販売数量の増加'] },
        { style: 'fact', text: '営業利益は40億円増えた', fact_ids: ['diff'] },
        { style: 'implication', text: '原材料費の上昇が続けば、価格改定の効果だけでは吸収しきれない可能性がある。'.repeat(2), fact_ids: ['nope'] },
      ],
    });
    const checked = validateHeadline(res, facts, [...BRIDGE_SAMPLE.rows]);
    expect(checked[0]!.issues).toEqual([]);
    expect(checked[1]!.issues.map((i) => i.code)).toEqual(['unknown_number']);
    expect(checked[2]!.issues.map((i) => i.code).sort()).toEqual(['too_long', 'unknown_fact']);
    expect(usableCandidates(checked).map((c) => c.style)).toEqual(['conclusion', 'implication']);
  });

  it('全角換算の長さ', () => {
    expect(zenLength('営業利益')).toBe(4);
    expect(zenLength('ab')).toBe(1);
  });
});

describe('プランと回数', () => {
  it('無料ではヘッダー提案は使えない。上位プランは月の回数まで', () => {
    expect(checkAllowance('free', 'ai_headline', { month: 0, day: 0 })).toMatchObject({ allowed: false, reason: 'not_in_plan' });
    expect(checkAllowance('pro', 'ai_headline', { month: 10, day: 1 })).toEqual({ allowed: true, remaining: 190 });
    expect(checkAllowance('pro', 'ai_headline', { month: 200, day: 1 })).toMatchObject({ allowed: false, reason: 'monthly_limit' });
    expect(checkAllowance('team', 'ai_headline', { month: 5000, day: 1 })).toEqual({ allowed: true, remaining: null });
    expect(checkAllowance('team', 'ai_headline', { month: 5000, day: 200 })).toMatchObject({ allowed: false, reason: 'daily_limit' });
    expect(planOf('pro')).toBe('pro');
    expect(planOf(undefined)).toBe('free');
  });

  it('キーがない時の呼び出し口は null（ルール版に戻る）', async () => {
    expect(await disabledProvider.json({ feature: 'ai_headline', system: '', user: '', schema: HeadlineResponseSchema, maxOutputTokens: 10 })).toBeNull();
  });
});
