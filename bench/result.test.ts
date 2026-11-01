import { describe, expect, it } from 'vitest';
import { aggregateRuns } from './result.ts';

describe('aggregateRuns', () => {
  it('読み込みごとの中央値を 1 件として集計する', () => {
    const summary = aggregateRuns(
      [
        { run: 0, iterations: [{ time: 10 }, { time: 11 }, { time: 100 }] },
        { run: 1, iterations: [{ time: 20 }, { time: 21 }, { time: 22 }] },
        { run: 2, iterations: [{ time: 30 }, { time: 31 }, { time: 32 }] },
      ],
      { time: 'ms' },
    );
    expect(summary.time).toMatchObject({ count: 3, median: 21, unit: 'ms' });
  });

  it('値がない計測項目は例外にする', () => {
    expect(() => aggregateRuns([{ run: 0, iterations: [{}] }], { time: 'ms' })).toThrow(RangeError);
  });
});
