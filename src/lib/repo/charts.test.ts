import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { initialState } from '@/features/editor/state';
import { fromBuilder, initialProject, withView, viewOf, duplicateSlide } from '@/features/editor/project';
import { saveChart } from './charts';

describe('saveChart', () => {
  it('検証を通った ViewSpec・データ・画面の状態を save_chart に渡す', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ saved_id: 'abc', saved_version: 3 }], error: null });
    const sb = { rpc } as unknown as SupabaseClient;
    const s = initialProject();
    await expect(saveChart(sb, 'abc', s, '地域別')).resolves.toEqual({ id: 'abc', version: 3 });
    const [fn, args] = rpc.mock.calls[0]!;
    expect(fn).toBe('save_chart');
    expect(args.p_view_spec_id).toBe('abc');
    expect(args.p_name).toBe('地域別');
    expect(args.p_spec.panels.map((p: { id: string }) => p.id)).toEqual(['total', 'main', 'growth']);
    expect(args.p_dataset.schema).toBe('MEKKO');
    expect(args.p_ui).toBe(s);
  });

  it('スライドが複数でも、全部を検証し、1回で保存する（ui に全スライド）', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ saved_id: 'n', saved_version: 1 }], error: null });
    let p = duplicateSlide(initialProject());
    p = withView(p, 1, { ...viewOf(p, 1), title: '2枚目' });
    await saveChart({ rpc } as unknown as SupabaseClient, null, p);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]![1].p_ui.slides).toHaveLength(2);
    // 2枚目が壊れていたら保存しない
    const bad = withView(p, 1, { ...viewOf(p, 1), title: 5 as never });
    const rpc2 = vi.fn();
    await expect(saveChart({ rpc: rpc2 } as unknown as SupabaseClient, null, bad)).rejects.toThrow(/#2/);
    expect(rpc2).not.toHaveBeenCalled();
  });

  it('検証に通らない状態は保存しない', async () => {
    const rpc = vi.fn();
    const s = fromBuilder({ ...initialState(), title: 123 as never });
    await expect(saveChart({ rpc } as unknown as SupabaseClient, null, s)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});
