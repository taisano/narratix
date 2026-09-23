import type { AspectId } from './ids';
import type { AspectDef } from './types';

export const ASPECTS: Record<AspectId, AspectDef> = {
  trend: { id: 'trend', label: { ja: '推移', en: 'Trend' } },
  size: { id: 'size', label: { ja: '規模', en: 'Size' } },
  growth: { id: 'growth', label: { ja: '成長率', en: 'Growth' } },
  mix: { id: 'mix', label: { ja: '構成', en: 'Mix' } },
  mix_change: { id: 'mix_change', label: { ja: '構成の変化', en: 'Mix change' } },
  rank: { id: 'rank', label: { ja: '順位', en: 'Rank' } },
  rank_change: { id: 'rank_change', label: { ja: '順位の変化', en: 'Rank change' } },
  difference: { id: 'difference', label: { ja: '差', en: 'Difference' } },
  level: { id: 'level', label: { ja: '絶対水準', en: 'Absolute level' } },
  contribution: { id: 'contribution', label: { ja: '要因の寄与', en: 'Contribution' } },
  net_change: { id: 'net_change', label: { ja: '正味の変化', en: 'Net change' } },
  reason: { id: 'reason', label: { ja: '変化の理由', en: 'Reason for change' } },
  correlation: { id: 'correlation', label: { ja: '相関・外れ値', en: 'Correlation' } },
  position: { id: 'position', label: { ja: '位置づけ', en: 'Position' } },
  time_change: { id: 'time_change', label: { ja: '時間の変化', en: 'Change over time' } },
  overview: { id: 'overview', label: { ja: '全体像', en: 'Overview' } },
  overall: { id: 'overall', label: { ja: '総合評価', en: 'Overall score' } },
  benchmark: { id: 'benchmark', label: { ja: '良し悪しの基準', en: 'Benchmark' } },
  interpretation: { id: 'interpretation', label: { ja: '解釈・次のアクション', en: 'Interpretation' } },
  readability: { id: 'readability', label: { ja: '系列が多すぎて読めない', en: 'Too many series' } },
};
