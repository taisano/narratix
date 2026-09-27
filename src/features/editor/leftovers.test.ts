import { describe, expect, it } from 'vitest';
import { registry } from '@/registry';
import { initialProject, newProject, projectFromPlan, withView, viewOf } from './project';
import { sampleLeftovers } from './leftovers';
import { planFromPurposes, setEmphasis } from '../start/plan';

/** 目的と重視点を決めた計画（② の「この構成でデータを入れる」の直前） */
const planned = (purpose: 'trend' | 'comparison', e: 'trajectory' | 'ranking') => { const p = planFromPurposes([purpose]); return setEmphasis(p, p.angles[0]!.id, e); };

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
    const plan = planned('trend', 'trajectory');
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
    const plan = planned('trend', 'trajectory');
    expect(projectFromPlan(plan, viewOf(en), 'ja')!.slideLocale).toBe('ja');
    expect(projectFromPlan(plan, viewOf(en), 'ja')!.source).toBe('出典：サンプルデータ（実データに置き換えてください）');
  });
});

describe('「新しく作る」から始めると、前に編集していたデータを持ち込まない', () => {
  it('自分のデータ（縦長の表の切り出しを含む）を編集中でも、② の案に合う見本から始める', async () => {
    const { newProjectFromPlan } = await import('./project');
    let p = initialProject();
    const v = viewOf(p);
    const d = structuredClone(v.dataset);
    d.rows = ['2020', '2021', '2022', '2023', '2024'];
    d.periods.current.values = d.rows.map(() => d.cols.map(() => 1));
    d.long = { headers: ['年', '国・地域', '区分', '訪日客数'], rows: [], pivot: { row: 0, col: 1, filters: [] } } as never;
    p = withView(p, 0, { ...v, dataset: d, source: '出典：JNTO' });
    const plan = planned('comparison', 'ranking');
    const n = newProjectFromPlan(plan, 'ja')!;
    const nv = viewOf(n);
    expect(nv.dataset.long).toBeUndefined();
    expect(nv.dataset.rows).not.toEqual(d.rows);
    expect(sampleLeftovers(n)).toContain('data');
    expect(n.source).not.toBe('出典：JNTO');
  });
});
