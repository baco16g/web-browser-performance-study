import type { Unit } from '../src/perf/recorder.ts';
import { median, type Summary, summarize } from '../src/perf/stats.ts';

export type MetricValues = Record<string, number>;

/** 同じページを開いている間の 1 回の読み込みの結果 */
export type RunResult = {
  run: number;
  iterations: MetricValues[];
};

export type MetricSummary = Summary & { unit: Unit };

export type VariantResult = {
  runs: RunResult[];
  /** 読み込みごとの中央値を、さらに集計した値 */
  metrics: Record<string, MetricSummary>;
};

export type BenchResult = {
  scenario: string;
  title: string;
  createdAt: string;
  environment: {
    platform: string;
    arch: string;
    cpuModel: string;
    cpuCount: number;
    memoryGiB: number;
    nodeVersion: string;
    browser: string;
    gitCommit: string;
    gitDirty: boolean;
  };
  conditions: {
    runs: number;
    warmupIterations: number;
    iterations: number;
    cpuThrottle: number;
    seed: number;
    viewport: { width: number; height: number };
    query: Record<string, string>;
  };
  variants: Record<string, VariantResult>;
};

/** 読み込みごとの中央値を並べる */
export function readRunMedians(runs: readonly RunResult[], name: string): number[] {
  return runs.map(({ iterations }) => median(iterations.flatMap((metrics) => metrics[name] ?? [])));
}

/**
 * 実装ごとの結果を集計する。
 *
 * 同じ読み込みの中の値は互いに似るため、件数を増やしても独立した観測にはならない。
 * 読み込みごとの中央値を 1 件として扱い、ばらつきを小さく見積もらないようにする。
 */
export function aggregateRuns(
  runs: readonly RunResult[],
  units: Readonly<Record<string, Unit>>,
): Record<string, MetricSummary> {
  return Object.fromEntries(
    Object.entries(units).map(([name, unit]) => [
      name,
      { ...summarize(readRunMedians(runs, name)), unit },
    ]),
  );
}
