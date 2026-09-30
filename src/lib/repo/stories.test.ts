import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { emptySlide, newStory } from '@/features/story/model';
import { deleteStory, listStories, loadStory, renameStory, saveStory } from './stories';

/** supabase の from(...).select/insert/update/delete/eq/order/single/maybeSingle をまねる */
function fake(result: { data: unknown; error: null | { message: string } }) {
  const calls: { op: string; args: unknown[] }[] = [];
  const chain: Record<string, unknown> = {};
  for (const op of ['select', 'insert', 'update', 'delete', 'eq', 'order']) chain[op] = (...args: unknown[]) => { calls.push({ op, args }); return chain; };
  chain.single = () => Promise.resolve(result);
  chain.maybeSingle = () => Promise.resolve(result);
  chain.then = (ok: (v: unknown) => unknown, ng: (e: unknown) => unknown) => Promise.resolve(result).then(ok, ng);
  const from = vi.fn(() => chain);
  return { sb: { from } as unknown as SupabaseClient, calls, from };
}

const story = newStory('ja', { decisionQuestion: 'どの市場を優先するか', slides: [emptySlide({ status: 'DONE' }), emptySlide(), emptySlide({ section: 'APPENDIX' })] });

describe('Story の保存（表 stories）', () => {
  it('新しく保存：名前（無ければ決めたい問い）・Main の枚数・Route・中身を1行で', async () => {
    const f = fake({ data: { id: 'new' }, error: null });
    await expect(saveStory(f.sb, null, story)).resolves.toBe('new');
    expect(f.from).toHaveBeenCalledWith('stories');
    const ins = f.calls.find((c) => c.op === 'insert')!.args[0] as Record<string, unknown>;
    expect(ins).toMatchObject({ name: 'どの市場を優先するか', slides: 2, route: 'AIMED' });
    expect(ins.story).toBe(story);
  });
  it('上書き：見つからなければ not_found', async () => {
    await expect(saveStory(fake({ data: [{ id: 'a' }], error: null }).sb, 'a', story, '名前')).resolves.toBe('a');
    await expect(saveStory(fake({ data: [], error: null }).sb, 'a', story)).rejects.toMatchObject({ code: 'not_found' });
  });
  it('一覧：壊れた行は飛ばし、進み具合を出す', async () => {
    const rows = [
      { id: 'a', name: '', slides: 2, route: 'AIMED', story, updated_at: '2026-09-30T10:00:00Z', created_at: '2026-09-30T09:00:00Z' },
      { id: 'b', name: 'x', slides: 0, route: 'AIMED', story: { version: 9 }, updated_at: '', created_at: '' },
    ];
    const list = await listStories(fake({ data: rows, error: null }).sb);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'a', name: 'どの市場を優先するか', slides: 2, progress: { done: 1, total: 3 } });
  });
  it('読み込み・名前の変更・削除', async () => {
    await expect(loadStory(fake({ data: { id: 'a', name: 'n', story }, error: null }).sb, 'a')).resolves.toMatchObject({ id: 'a', name: 'n' });
    await expect(loadStory(fake({ data: null, error: null }).sb, 'a')).rejects.toMatchObject({ code: 'not_found' });
    await expect(renameStory(fake({ data: null, error: null }).sb, 'a', '  ')).rejects.toMatchObject({ code: 'empty_name' });
    const r = fake({ data: null, error: null });
    await renameStory(r.sb, 'a', ' 新しい名前 ');
    expect(r.calls.find((c) => c.op === 'update')!.args[0]).toEqual({ name: '新しい名前' });
    await expect(deleteStory(fake({ data: null, error: { message: 'x' } }).sb, 'a')).rejects.toMatchObject({ code: 'delete_failed' });
  });
});
