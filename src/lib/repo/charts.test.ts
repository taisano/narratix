import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { initialState } from '@/features/mekko-builder/state';
import { saveChart } from './charts';

describe('saveChart', () => {
  it('検証を通った ViewSpec・データ・画面の状態を save_chart に渡す', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ saved_id: 'abc', saved_version: 3 }], error: null });
    const sb = { rpc } as unknown as SupabaseClient;
    const s = initialState();
    await expect(saveChart(sb, 'abc', s, '地域別')).resolves.toEqual({ id: 'abc', version: 3 });
    const [fn, args] = rpc.mock.calls[0]!;
    expect(fn).toBe('save_chart');
    expect(args.p_view_spec_id).toBe('abc');
    expect(args.p_name).toBe('地域別');
    expect(args.p_spec.panels.map((p: { id: string }) => p.id)).toEqual(['total', 'main', 'growth']);
    expect(args.p_dataset.schema).toBe('MEKKO');
    expect(args.p_ui).toBe(s);
  });

  it('検証に通らない状態は保存しない', async () => {
    const rpc = vi.fn();
    const s = { ...initialState(), labels: 'bogus' as never };
    await expect(saveChart({ rpc } as unknown as SupabaseClient, null, s)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});
