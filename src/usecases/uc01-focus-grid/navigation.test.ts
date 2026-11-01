import { describe, expect, it } from 'vitest';
import { directionFromKey, nextIndexInGrid } from './navigation.ts';

const COLUMNS = 3;
const COUNT = 8; // 3 行目は 2 件だけ

describe('directionFromKey', () => {
  it('矢印キーを方向に変換する', () => {
    expect(directionFromKey('ArrowLeft')).toBe('left');
  });

  it('矢印キー以外は null を返す', () => {
    expect(directionFromKey('Enter')).toBeNull();
  });
});

describe('nextIndexInGrid', () => {
  it.each([
    [4, 'left', 3],
    [4, 'right', 5],
    [4, 'up', 1],
    [4, 'down', 7],
  ] as const)('%i から %s に移動する', (index, direction, expected) => {
    expect(nextIndexInGrid(index, direction, COLUMNS, COUNT)).toBe(expected);
  });

  it.each([
    [3, 'left'],
    [5, 'right'],
    [1, 'up'],
    [7, 'right'],
    [7, 'down'],
  ] as const)('%i から %s は端なので null を返す', (index, direction) => {
    expect(nextIndexInGrid(index, direction, COLUMNS, COUNT)).toBeNull();
  });

  it('最後の行が短いとき、真下がなければ最後の項目に寄せる', () => {
    expect(nextIndexInGrid(5, 'down', COLUMNS, COUNT)).toBe(7);
  });
});
