import { describe, expect, it } from 'vitest';
import { wrapText } from './text';
import { layoutFrame } from './layout/frame';

describe('折り返し', () => {
  it('入力した改行はそのまま改行にする。末尾の改行は無視、長い行はさらに折り返す', () => {
    expect(wrapText('売上は伸びた\n利益は減った', 20, 12, 2)).toEqual(['売上は伸びた', '利益は減った']);
    expect(wrapText('一行だけ\n', 20, 12, 2)).toEqual(['一行だけ']);
    expect(wrapText('あ'.repeat(10), 20, 1.2, 3)).toEqual(['ああああ', 'ああああ', 'ああ']);
    expect(wrapText('1行目\n2行目\n3行目', 20, 12, 2)).toEqual(['1行目', '2行…']);
    expect(wrapText('', 20, 12, 2)).toEqual([]);
  });

  it('タイトルの改行がスライドに出る', () => {
    const f = layoutFrame({ title: '中国が成長を牽引\n北米との差が縮まった' });
    expect(f.title.lines.map((l) => l.t)).toEqual(['中国が成長を牽引', '北米との差が縮まった']);
  });
});
