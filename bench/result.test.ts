import { describe, expect, it } from 'vitest';
import type { PerfSample } from '../src/perf/recorder.ts';
import { aggregateRuns, aggregateSamples } from './result.ts';
import { timeMetric } from './scenario.ts';

const TIME = { name: 'time', unit: 'ms', optional: false } as const;

function createSamples(values: readonly number[]): PerfSample[] {
  return values.map((value) => ({ name: 'time', value, unit: 'ms', at: 0 }));
}

describe('aggregateSamples', () => {
  const metric = timeMetric('time');

  it.each([
    ['first', 3],
    ['last', 2],
    ['max', 5],
    ['sum', 10],
    ['count', 3],
  ] as const)('%s でまとめる', (aggregate, expected) => {
    expect(aggregateSamples(createSamples([3, 5, 2]), { ...metric, aggregate })).toBe(expected);
  });

  it('記録がないとき、合計と件数は 0 になり、他は値なしになる', () => {
    expect(aggregateSamples([], { ...metric, aggregate: 'sum' })).toBe(0);
    expect(aggregateSamples([], { ...metric, aggregate: 'count' })).toBe(0);
    expect(aggregateSamples([], { ...metric, aggregate: 'max' })).toBeUndefined();
    expect(aggregateSamples([], metric)).toBeUndefined();
  });

  it('他の名前の記録は無視する', () => {
    const other: PerfSample = { name: 'other', value: 9, unit: 'ms', at: 0 };
    expect(aggregateSamples([other, ...createSamples([1])], metric)).toBe(1);
  });
});

describe('aggregateRuns', () => {
  it('読み込みごとの中央値を 1 件として集計する', () => {
    const summary = aggregateRuns(
      [
        { run: 0, iterations: [{ time: 10 }, { time: 11 }, { time: 100 }] },
        { run: 1, iterations: [{ time: 20 }, { time: 21 }, { time: 22 }] },
        { run: 2, iterations: [{ time: 30 }, { time: 31 }, { time: 32 }] },
      ],
      [TIME],
    );
    expect(summary.time).toMatchObject({ count: 3, median: 21, unit: 'ms' });
  });

  it('値がない計測項目は例外にする', () => {
    expect(() => aggregateRuns([{ run: 0, iterations: [{}] }], [TIME])).toThrow(RangeError);
  });

  it('optional な項目は、値がなければ結果から除く', () => {
    const definitions = [{ ...TIME, optional: true }];
    expect(aggregateRuns([{ run: 0, iterations: [{}] }], definitions)).toEqual({});
  });

  it('一部の読み込みにしか値がなくても、ある分だけ集計する', () => {
    const definitions = [{ ...TIME, optional: true }];
    const runs = [
      { run: 0, iterations: [{}] },
      { run: 1, iterations: [{ time: 7 }] },
    ];
    expect(aggregateRuns(runs, definitions).time).toMatchObject({ count: 1, median: 7 });
  });
});
