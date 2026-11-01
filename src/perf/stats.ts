import { lastOf } from '../shared/array.ts';

export type Summary = {
  count: number;
  min: number;
  p25: number;
  median: number;
  p75: number;
  p95: number;
  max: number;
  iqr: number;
};

function sortAscending(values: readonly number[]): number[] {
  if (values.length === 0) {
    // 空の結果を 0 として扱うと、計測の失敗が「速い」に見えてしまう
    throw new RangeError('統計量を求めるには 1 件以上の値が必要です');
  }
  return [...values].sort((a, b) => a - b);
}

/** 昇順の配列から線形補間で分位点を求める */
function quantileOfSorted(sorted: readonly number[], ratio: number): number {
  const position = (sorted.length - 1) * ratio;
  const lowerIndex = Math.floor(position);
  const lower = sorted[lowerIndex] ?? 0;
  const upper = sorted[lowerIndex + 1] ?? lower;
  return lower + (upper - lower) * (position - lowerIndex);
}

export function quantile(values: readonly number[], ratio: number): number {
  return quantileOfSorted(sortAscending(values), ratio);
}

export function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}

export function summarize(values: readonly number[]): Summary {
  const sorted = sortAscending(values);
  const p25 = quantileOfSorted(sorted, 0.25);
  const p75 = quantileOfSorted(sorted, 0.75);
  return {
    count: sorted.length,
    min: sorted[0] ?? 0,
    p25,
    median: quantileOfSorted(sorted, 0.5),
    p75,
    p95: quantileOfSorted(sorted, 0.95),
    max: lastOf(sorted) ?? 0,
    iqr: p75 - p25,
  };
}
