import { normalize } from '@/features/editor/dataCheck';
import type { CompareKind, ValueKind } from './columnRoles';

/**
 * 見出しの読み分け。AI へ送ってよいのは「指標名・修飾語・軸の名前」だけで構成された見出し。
 * 国名・商品名・顧客名・会社名などは語彙に無いので、送られない（匿名化される）。
 */
const TERMS = [
  // 指標（en）
  'value share', 'volume share', 'market share', 'share', 'sales', 'revenue', 'turnover', 'profit', 'margin', 'income', 'cost', 'price', 'asp', 'units', 'unit', 'volume', 'value',
  'quantity', 'qty', 'orders', 'order', 'customers', 'distribution', 'dist', 'weighted', 'index', 'rate', 'ratio', 'growth', 'yoy', 'mom', 'cagr', 'amount', 'total', 'average', 'avg',
  'count', 'score', 'rank', 'budget', 'actual', 'plan', 'target', 'forecast', 'variance', 'diff', 'difference', 'change', 'delta', 'primary', 'indicator', 'mix', 'size', 'gap',
  // 修飾語
  'cy', 'ly', 'py', 'ytd', 'mtd', 'qtd', 'vs', 'versus', 'prev', 'previous', 'prior', 'year', 'last', 'current', 'pp', 'pts', 'bps', 'of', 'the', 'and', 'by', 'per', 'net', 'gross', 'new', 'old', 'pct', 'percent',
  // 軸の名前（カテゴリの見出しであって、項目そのものではない）
  'country', 'region', 'product', 'customer', 'channel', 'category', 'segment', 'brand', 'item', 'name', 'month', 'quarter', 'date', 'period', 'week', 'day', 'store', 'market', 'city', 'area', 'group', 'type',
  // 指標（ja）
  '売上高', '売上', '利益率', '営業利益', '利益', '粗利', '原価', '費用', 'コスト', '価格', '単価', '平均', '数量', '件数', '台数', '個数', '人数', '客数', '受注', '注文', '顧客数', '配荷', '指数', '率', '比率', '割合', '構成比', 'シェア',
  '前年同期比', '前年比', '前年差', '前年同月', '前年', '前期比', '前期', '前月比', '前月', '昨対', '対前年', '増減率', '増減', '成長率', '成長', '差分', '差', '合計', '総計', '実績', '予算', '計画', '目標', '見込', '見通し', '予測', '今期', '当期', '当年', '今年', '当月', '累計',
  '百万円', '億円', '万円', '千円', '円', 'ドル', 'ユーロ', '単位', 'usd', 'eur', 'jpy',
  '指標', '指数', '金額', '額', '評価', 'スコア', '順位', '主要', '規模', '平均',
  // 軸の名前（ja）
  '国', '地域', '商品', '製品', '顧客', 'チャネル', '部門', '分類', 'カテゴリ', 'セグメント', 'ブランド', '項目', '名前', '名称', '月', '四半期', '年度', '年', '日付', '日', '期間', '週', '店舗', '市場', '都市', 'エリア', 'グループ', '種類', 'タイプ',
].sort((a, b) => b.length - a.length);

/** 見出しが「指標名・修飾語・軸の名前」だけでできているか（それ以外が残れば、項目名かもしれない） */
export function isSafeHeader(header: string): boolean {
  const h = normalize(header).toLowerCase();
  if (!h || h.length > 40) return false;
  let rest = h;
  for (const t of TERMS) rest = rest.split(t.toLowerCase()).join(' ');
  rest = rest.replace(/[\s\d.,:;/\\()[\]{}%+\-_–—−€$¥£#*&|'"、。・：；／（）［］【】「」％＋]/g, '');
  return rest === '';
}

const has = (h: string, re: RegExp) => re.test(normalize(h).toLowerCase());

/** 見出しから、値の意味と単位の手がかり */
export function valueKindOfHeader(header: string, kind: 'number' | 'percent' | 'currency' | 'date' | 'text'): { valueKind: ValueKind; unit?: string } {
  const h = header;
  if (has(h, /\(\s*pp\s*\)|\bpp\b|ポイント|pts|\bpt\b/) || /ポイント差/.test(h)) return { valueKind: 'deltaPoint', unit: 'pp' };
  const diff = has(h, /前年差|前期差|前月差|予算差|計画差|差分|増減額|\bdiff\b|\bvariance\b|\bdelta\b/);
  const versus = has(h, /\bvs\.?\s*(ly|py|prev|previous|prior|last)|vs\s*budget|vs\s*plan|\bchange\b/);
  const delta = diff || versus;
  const rate = has(h, /前年比|前期比|前月比|前年同期比|昨対|増減率|成長率|\byoy\b|\bmom\b|\bgrowth\b|\bcagr\b|%\s*chg|%\s*change/);
  if (rate) return { valueKind: 'growthRate', unit: '%' };
  // 値が % の時：「差」は差（pp）、「vs LY」は前年比（率）とみなす。数値の時は実数差
  if (delta) return kind === 'percent' ? (diff ? { valueKind: 'deltaPoint', unit: 'pp' } : { valueKind: 'growthRate', unit: '%' }) : { valueKind: 'deltaAbsolute' };
  return { valueKind: 'level' };
}

/** 比べる側の水準の列らしい見出し（予算・計画・前年の水準など。差や率は除く） */
export function compareKindOfHeader(header: string): CompareKind | null {
  const h = normalize(header).toLowerCase();
  if (/前年差|前期差|予算差|計画差|差分|前年比|前期比|増減|\bvs\b|\bdiff\b|variance|delta|change|growth|yoy|\(pp\)/.test(h)) return null;
  if (/予算|budget/.test(h)) return 'budget';
  if (/計画|\bplan\b/.test(h)) return 'plan';
  if (/目標|\btarget\b/.test(h)) return 'target';
  if (/見込|見通し|予測|forecast/.test(h)) return 'forecast';
  if (/前年|昨年|\bly\b|\bpy\b|prior year|last year|previous year/.test(h)) return 'priorYear';
  if (/前期|前月|prior period|previous period/.test(h)) return 'priorPeriod';
  return null;
}

/** 実績（比べられる側）らしい見出し */
export const isActualHeader = (header: string): boolean => /実績|actual|\bcy\b|当期|今期|当年|今年|current/.test(normalize(header).toLowerCase());

/** 比べる語（予算・計画・前年など）と実績の語を取り除いた、指標の本体の名前 */
export function coreOf(header: string): string {
  return normalize(header).toLowerCase().replace(/予算|計画|目標|見込|見通し|予測|前年|昨年|前期|前月|実績|当期|今期|当年|今年|budget|plan|target|forecast|actual|prior|previous|last|year|\bly\b|\bpy\b|\bcy\b|current|[\s_\-:/()]/g, '');
}
