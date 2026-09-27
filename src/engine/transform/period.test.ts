import { describe, expect, it } from 'vitest';
import { growthSpan, isTimeAxis, periodOrder, timeRange } from './cagr';

describe('年と、四半期・月の読み分け', () => {
  it('年だけの項目は年。四半期・月は年ではない', () => {
    expect(timeRange(['2021', '2025'])).toMatchObject({ from: 2021, to: 2025 });
    expect(timeRange(['2021年', 'FY2025'])).toMatchObject({ from: 2021, to: 2025 });
    expect(timeRange(['2025 Q4', '2026 Q1', '2026 Q3'])).toBeNull();
    expect(timeRange(['2024年3月', '2024年6月'])).toBeNull();
  });
  it('四半期・半期・月の並び順と、区間（最初→最後）', () => {
    expect(periodOrder('2025 Q4')).toBeCloseTo(2025.75);
    expect(periodOrder('2026Q1')).toBeCloseTo(2026);
    expect(periodOrder('Q2 2026')).toBeCloseTo(2026.25);
    expect(periodOrder('2025年下期')).toBeCloseTo(2025.5);
    expect(periodOrder('2024年3月')).toBeCloseTo(2024 + 2 / 12);
    expect(periodOrder('2024/12')).toBeCloseTo(2024 + 11 / 12);
    expect(growthSpan(['2025 Q4', '2026 Q1', '2026 Q2', '2026 Q3'])).toMatchObject({ fromIndex: 0, toIndex: 3, years: null, fromLabel: '2025 Q4', toLabel: '2026 Q3' });
    expect(growthSpan(['2021', '2025'])).toMatchObject({ years: 4 });
    expect(isTimeAxis(['北米', '欧州'])).toBe(false);
  });
});
