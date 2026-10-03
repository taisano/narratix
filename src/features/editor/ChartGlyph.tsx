import type { ChartTypeId, StoryTemplateId } from '@/registry';
import type { ReactElement } from 'react';

/**
 * 見せ方の小さな線画（「スライド形式を変更」のボタンの名前の左）。1色（currentColor）で、形だけを伝える。
 * 名前だけでは分かりにくいチャートを、押す前に形で見分けられるように。見本の絵の縮小は細かすぎて見えないため使わない
 */
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const F = { fill: 'currentColor' } as const;
const SOFT = { fill: 'currentColor', opacity: 0.4 } as const;
const r = (x: number, y: number, w: number, h: number, p: object = F) => <rect x={x} y={y} width={w} height={h} {...p} />;
const dot = (x: number, y: number, rr = 1.6, p: object = F) => <circle cx={x} cy={y} r={rr} {...p} />;

const CHART: Record<ChartTypeId, ReactElement> = {
  line: <polyline points="2,13 7,9 11,10 18,3" {...S} />,
  column_trend: <>{r(2, 9, 3.5, 6)}{r(8, 6, 3.5, 9)}{r(14, 3, 3.5, 12)}</>,
  bar_trend: <>{r(2, 2, 9, 3)}{r(2, 6.5, 13, 3)}{r(2, 11, 16, 3)}</>,
  stacked_column: <>{r(2, 8, 3.5, 7)}{r(2, 5, 3.5, 2.4, SOFT)}{r(8, 6, 3.5, 9)}{r(8, 3, 3.5, 2.4, SOFT)}{r(14, 4, 3.5, 11)}{r(14, 1, 3.5, 2.4, SOFT)}</>,
  stacked_100: <>{r(2, 1, 3.5, 14, SOFT)}{r(2, 7, 3.5, 8)}{r(8, 1, 3.5, 14, SOFT)}{r(8, 5, 3.5, 10)}{r(14, 1, 3.5, 14, SOFT)}{r(14, 4, 3.5, 11)}</>,
  slope: <><line x1="3" y1="12" x2="17" y2="4" {...S} /><line x1="3" y1="5" x2="17" y2="11" {...S} opacity={0.45} />{dot(3, 12)}{dot(17, 4)}</>,
  slope_pair: <><line x1="2" y1="11" x2="8" y2="5" {...S} /><line x1="12" y1="6" x2="18" y2="11" {...S} /><line x1="10" y1="2" x2="10" y2="15" {...S} strokeWidth={0.8} opacity={0.4} /></>,
  combo: <>{r(2, 9, 3.5, 6, SOFT)}{r(8, 7, 3.5, 8, SOFT)}{r(14, 5, 3.5, 10, SOFT)}<polyline points="3.7,7 9.7,4 15.7,2" {...S} strokeWidth={1.5} /></>,
  bar_rank: <>{r(2, 2, 16, 3)}{r(2, 6.5, 11, 3)}{r(2, 11, 7, 3)}</>,
  column_compare: <>{r(2, 3, 3.5, 12)}{r(8, 6, 3.5, 9)}{r(14, 10, 3.5, 5)}</>,
  clustered_column: <>{r(2, 7, 2.6, 8, SOFT)}{r(4.8, 4, 2.6, 11)}{r(11, 9, 2.6, 6, SOFT)}{r(13.8, 5, 2.6, 10)}</>,
  variance_bar: <><line x1="9" y1="1" x2="9" y2="15" {...S} strokeWidth={0.9} opacity={0.5} />{r(9, 2, 8, 3)}{r(4, 6.5, 5, 3, SOFT)}{r(9, 11, 5, 3)}</>,
  rank_slope: <><line x1="3" y1="3" x2="17" y2="12" {...S} /><line x1="3" y1="12" x2="17" y2="3" {...S} opacity={0.45} />{dot(3, 3, 1.4)}{dot(3, 12, 1.4)}{dot(17, 3, 1.4)}{dot(17, 12, 1.4)}</>,
  mekko: <>{r(1, 1, 8, 7)}{r(1, 8.6, 8, 6.4, SOFT)}{r(10, 1, 5, 9, SOFT)}{r(10, 10.6, 5, 4.4)}{r(16, 1, 3, 5)}{r(16, 6.6, 3, 8.4, SOFT)}</>,
  bar_100: <>{r(2, 2, 10, 3)}{r(12.6, 2, 5.4, 3, SOFT)}{r(2, 6.5, 6, 3)}{r(8.6, 6.5, 9.4, 3, SOFT)}{r(2, 11, 13, 3)}{r(15.6, 11, 2.4, 3, SOFT)}</>,
  share_pair: <>{r(2, 1, 3, 14, SOFT)}{r(2, 8, 3, 7)}{r(5.6, 1, 3, 14, SOFT)}{r(5.6, 6, 3, 9)}{r(11.4, 1, 3, 14, SOFT)}{r(11.4, 9, 3, 6)}{r(15, 1, 3, 14, SOFT)}{r(15, 5, 3, 10)}</>,
  waterfall: <>{r(1.5, 7, 3, 8)}{r(5.5, 4, 3, 3)}{r(9.5, 4, 3, 4, SOFT)}{r(13.5, 2, 3, 13)}</>,
  driver_bar: <>{r(2, 2, 15, 3)}{r(2, 6.5, 10, 3)}{r(2, 11, 6, 3)}</>,
  posneg_bar: <><line x1="10" y1="1" x2="10" y2="15" {...S} strokeWidth={0.9} opacity={0.5} />{r(10, 2, 8, 3)}{r(10, 6.5, 5, 3)}{r(4, 11, 6, 3, SOFT)}</>,
  scatter: <>{dot(4, 12)}{dot(7, 9)}{dot(10, 10)}{dot(13, 6)}{dot(16, 4)}</>,
  bubble: <>{dot(5, 11, 2.6, SOFT)}{dot(11, 7, 3.6, SOFT)}{dot(16, 4, 1.8)}{dot(6, 5, 1.4)}</>,
  variable_width: <>{r(1, 4, 7, 11)}{r(8.6, 7, 4, 8, SOFT)}{r(13.2, 9, 5.8, 6)}<line x1="1" y1="6.5" x2="19" y2="6.5" {...S} strokeWidth={0.9} strokeDasharray="1.5 1.5" /></>,
  heatmap: <>{r(2, 2, 5, 3.5)}{r(7.5, 2, 5, 3.5, SOFT)}{r(13, 2, 5, 3.5)}{r(2, 6.25, 5, 3.5, SOFT)}{r(7.5, 6.25, 5, 3.5)}{r(13, 6.25, 5, 3.5, SOFT)}{r(2, 10.5, 5, 3.5)}{r(7.5, 10.5, 5, 3.5, SOFT)}{r(13, 10.5, 5, 3.5, SOFT)}</>,
  small_multiples_bar: <>{r(2, 7, 2, 6)}{r(4.6, 4, 2, 9)}{r(11, 9, 2, 4)}{r(13.6, 5, 2, 8)}<line x1="9.5" y1="2" x2="9.5" y2="14" {...S} strokeWidth={0.8} opacity={0.4} /></>,
  leaderboard: <>{dot(3, 3.5, 1.3)}{r(6, 2.2, 12, 2.6)}{dot(3, 8, 1.3)}{r(6, 6.7, 9, 2.6)}{dot(3, 12.5, 1.3)}{r(6, 11.2, 6, 2.6)}</>,
};

const lines = (ys: number[], x = 2, w = 16) => ys.map((y, i) => <line key={i} x1={x} y1={y} x2={x + w} y2={y} {...S} strokeWidth={1.4} />);
const TEMPLATE: Record<StoryTemplateId, ReactElement> = {
  STORY_TABLE_COMPARISON: <><rect x="2" y="2" width="16" height="12" {...S} strokeWidth={1.2} /><line x1="2" y1="6" x2="18" y2="6" {...S} strokeWidth={1.2} /><line x1="8" y1="2" x2="8" y2="14" {...S} strokeWidth={1.2} /><line x1="13" y1="2" x2="13" y2="14" {...S} strokeWidth={1.2} /></>,
  STORY_TABLE_KPI: <>{r(2, 3, 4.5, 10, SOFT)}{r(7.75, 3, 4.5, 10)}{r(13.5, 3, 4.5, 10, SOFT)}</>,
  STORY_TABLE_DELTA: <><rect x="2" y="2" width="16" height="12" {...S} strokeWidth={1.2} /><line x1="2" y1="6" x2="18" y2="6" {...S} strokeWidth={1.2} /><path d="M13 12 15 9l2 3" {...S} strokeWidth={1.3} /></>,
  STORY_TABLE_HEATMAP: CHART.heatmap,
  STORY_TABLE_BASIC: <><rect x="2" y="2" width="16" height="12" {...S} strokeWidth={1.2} /><line x1="2" y1="6" x2="18" y2="6" {...S} strokeWidth={1.2} /><line x1="2" y1="10" x2="18" y2="10" {...S} strokeWidth={1.2} /><line x1="8" y1="2" x2="8" y2="14" {...S} strokeWidth={1.2} /></>,
  STORY_TEXT_CONCLUSION_REASONS: <>{r(2, 2, 16, 3.5)}{r(2, 8, 4.5, 6, SOFT)}{r(7.75, 8, 4.5, 6, SOFT)}{r(13.5, 8, 4.5, 6, SOFT)}</>,
  STORY_TEXT_EXECUTIVE_SUMMARY: <>{r(2, 2, 16, 3.5)}{lines([8.5, 11.5, 14.5])}</>,
  STORY_TEXT_ISSUE_INSIGHT_ACTION: <>{r(2, 4, 4.5, 8, SOFT)}<path d="M7 8h1.5" {...S} strokeWidth={1.2} />{r(9, 4, 4.5, 8, SOFT)}<path d="M14 8h1" {...S} strokeWidth={1.2} />{r(15.5, 4, 3, 8)}</>,
  STORY_TEXT_NUMBERS: <><text x="1" y="12.5" fontSize="10" fontWeight="700" fill="currentColor" fontFamily="sans-serif">12</text>{lines([5, 9, 13], 13, 5)}</>,
  STORY_TEXT_NEXT_ACTIONS: <><path d="M2 4l1.4 1.4L6 2.8M2 9l1.4 1.4L6 7.8M2 14l1.4 1.4L6 12.8" {...S} strokeWidth={1.3} />{lines([4, 9, 14], 8, 10)}</>,
  STORY_TEXT_TWO_COLUMN: <>{lines([4, 8, 12], 2, 6.5)}{lines([4, 8, 12], 11.5, 6.5)}</>,
  STORY_TEXT_BULLETS: <>{dot(3, 4, 1.2)}{dot(3, 8, 1.2)}{dot(3, 12, 1.2)}{lines([4, 8, 12], 6, 12)}</>,
};

export function ChartGlyph({ chart, template, className }: { chart?: ChartTypeId; template?: StoryTemplateId; className?: string }) {
  const g = chart ? CHART[chart] : template ? TEMPLATE[template] : null;
  if (!g) return null;
  return <svg viewBox="0 0 20 16" width="20" height="16" aria-hidden="true" focusable="false" className={className}>{g}</svg>;
}
