import { describe, expect, it } from 'vitest';
import { median, quantile, summarize } from './stats.ts';

describe('median', () => {
  it('奇数件は中央の値を返す', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('偶数件は中央の 2 件の平均を返す', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('入力の配列を並べ替えない', () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });

  it('空の入力は例外にする', () => {
    expect(() => median([])).toThrow(RangeError);
  });
});

describe('quantile', () => {
  it('隣り合う値を線形補間する', () => {
    expect(quantile([10, 20], 0.25)).toBe(12.5);
  });

  it('1 件なら比率によらずその値を返す', () => {
    expect(quantile([7], 0.95)).toBe(7);
  });
});

describe('summarize', () => {
  it('分位点と四分位範囲をまとめて返す', () => {
    expect(summarize([1, 2, 3, 4, 5])).toEqual({
      count: 5,
      min: 1,
      p25: 2,
      median: 3,
      p75: 4,
      p95: 4.8,
      max: 5,
      iqr: 2,
    });
  });
});
