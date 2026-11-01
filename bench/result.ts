import type { PerfSample, Unit } from '../src/perf/recorder.ts';
import { median, type Summary, summarize } from '../src/perf/stats.ts';
import type { SampleMetric } from './scenario.ts';

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

/** 結果の指標の定義。optional な指標は値がなくても失敗にしない */
export type MetricDefinition = { name: string; unit: Unit; optional: boolean };

/** 1 回の操作で記録された計測値を、指標の定義に従って 1 つの値にまとめる */
export function aggregateSamples(
  samples: readonly PerfSample[],
  { sample, aggregate }: SampleMetric,
): number | undefined {
  const values = samples.filter(({ name }) => name === sample).map(({ value }) => value);
  switch (aggregate) {
    case 'first':
      return values[0];
    case 'last':
      return values.at(-1);
    case 'max':
      return values.length === 0 ? undefined : Math.max(...values);
    case 'sum':
      return values.reduce((total, value) => total + value, 0);
    case 'count':
      return values.length;
  }
}

/** 読み込みごとの中央値を並べる。値が 1 件もない読み込みは除く */
export function readRunMedians(runs: readonly RunResult[], name: string): number[] {
  return runs.flatMap(({ iterations }) => {
    const values = iterations.flatMap((metrics) => metrics[name] ?? []);
    return values.length === 0 ? [] : [median(values)];
  });
}

/**
 * 実装ごとの結果を集計する。
 *
 * 同じ読み込みの中の値は互いに似るため、件数を増やしても独立した観測にはならない。
 * 読み込みごとの中央値を 1 件として扱い、ばらつきを小さく見積もらないようにする。
 */
export function aggregateRuns(
  runs: readonly RunResult[],
  definitions: readonly MetricDefinition[],
): Record<string, MetricSummary> {
  return Object.fromEntries(
    definitions.flatMap(({ name, unit, optional }) => {
      const runMedians = readRunMedians(runs, name);
      return optional && runMedians.length === 0
        ? []
        : [[name, { ...summarize(runMedians), unit }]];
    }),
  );
}
