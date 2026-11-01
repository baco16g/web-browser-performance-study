import { describe, expect, it } from 'vitest';
import type { RumBeacon } from '../src/perf/rum.ts';
import { summarizeBeacons } from './field-summary.ts';

function createBeacon(segment: string, value: number): RumBeacon {
  return { metric: 'vitals:lcp', value, page: '/', variant: 'good', segment };
}

describe('summarizeBeacons', () => {
  it('グループごとに分位点を求める', () => {
    const rows = summarizeBeacons(
      [createBeacon('fast', 100), createBeacon('fast', 200), createBeacon('slow', 900)],
      ({ segment }) => segment,
    );

    expect(rows).toEqual([
      { group: 'fast', metric: 'vitals:lcp', count: 2, p50: 150, p75: 175, p95: 195 },
      { group: 'slow', metric: 'vitals:lcp', count: 1, p50: 900, p75: 900, p95: 900 },
    ]);
  });

  it('同じグループでも指標ごとに分ける', () => {
    const lcp = createBeacon('fast', 100);
    const cls = { ...lcp, metric: 'vitals:cls', value: 0.1 };
    expect(summarizeBeacons([lcp, cls], () => 'all')).toHaveLength(2);
  });
});
