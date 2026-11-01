import type { RumBeacon } from '../src/perf/rum.ts';
import { quantile } from '../src/perf/stats.ts';

export type FieldRow = {
  group: string;
  metric: string;
  count: number;
  p50: number;
  p75: number;
  p95: number;
};

/** 計測値を group ごと、指標ごとに分布へまとめる */
export function summarizeBeacons(
  beacons: readonly RumBeacon[],
  toGroup: (beacon: RumBeacon) => string,
): FieldRow[] {
  const valuesByKey = new Map<string, { group: string; metric: string; values: number[] }>();

  for (const beacon of beacons) {
    const group = toGroup(beacon);
    const key = `${group}\0${beacon.metric}`;
    const entry = valuesByKey.get(key) ?? { group, metric: beacon.metric, values: [] };
    entry.values.push(beacon.value);
    valuesByKey.set(key, entry);
  }

  return [...valuesByKey.values()].map(({ group, metric, values }) => ({
    group,
    metric,
    count: values.length,
    p50: quantile(values, 0.5),
    p75: quantile(values, 0.75),
    p95: quantile(values, 0.95),
  }));
}
