import { describe, expect, it } from 'vitest';
import { registry } from '@/registry';
import { initialProject, newProject, projectFromPlan, withView, viewOf } from './project';
import { sampleLeftovers } from './leftovers';
import { planFromPurposes } from '../start/plan';

describe('見本のまま残っているもの', () => {
  it('はじめはタイトル・出典・データが全部見本', () => {
    expect(sampleLeftovers(initialProject())).toEqual(['title', 'source', 'data']);
  });
  it('書き換えると消える', () => {
    let p = initialProject();
    const v = viewOf(p);
    const d = structuredClone(v.dataset);
    d.periods.current.values[0]![0] = 999;
    p = withView(p, 0, { ...v, title: '北米が伸びを牽引', dataset: d });
    p = { ...p, source: '出典：社内データ' };
    expect(sampleLeftovers(p)).toEqual([]);
  });
  it('② から作った時の仮の見出し（答える問い）も見本扱い', () => {
    const plan = planFromPurposes(['trend']);
    const p = projectFromPlan(plan, viewOf(initialProject()), 'ja')!;
    expect(viewOf(p).title).toBe(registry.recipes[p.slides[0]!.recipe!].question.ja);
    expect(sampleLeftovers(p)).toContain('title');
  });
});

describe('スライドの言語は画面の言語に合わせる', () => {
  it('新しく始める・② から作る時は、前の作業の言語を引き継がない', () => {
    expect(newProject('ja').slideLocale).toBe('ja');
    const en = newProject('en');
    expect(en.slideLocale).toBe('en');
    expect(en.source).toBe('Source: Sample data (replace with your own)');
    const plan = planFromPurposes(['trend']);
    expect(projectFromPlan(plan, viewOf(en), 'ja')!.slideLocale).toBe('ja');
    expect(projectFromPlan(plan, viewOf(en), 'ja')!.source).toBe('出典：サンプルデータ（実データに置き換えてください）');
  });
});
