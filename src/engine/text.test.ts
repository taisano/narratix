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

describe('英語は単語の途中で折り返さない', () => {
  it('単語単位で折り返し、日本語は1文字ずつ', () => {
    const t = 'Dual baskets grew in every region, with the large China and North America markets driving most of the growth';
    const lines = wrapText(t, 20, 8, 3);
    expect(lines.join(' ')).toBe(t);
    for (const l of lines) expect(l).not.toMatch(/^\s|\s$/);
    expect(wrapText('中国と東南アジアが成長を牽引', 20, 1.2, 5).join('')).toBe('中国と東南アジアが成長を牽引');
    // 1行より長い単語だけは文字で切る
    expect(wrapText('Supercalifragilisticexpialidocious', 20, 2, 5).length).toBeGreaterThan(1);
  });
});
