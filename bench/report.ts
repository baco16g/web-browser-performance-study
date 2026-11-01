import { execFileSync } from 'node:child_process';
import { arch, cpus, platform, totalmem } from 'node:os';
import type { Browser } from '@playwright/test';
import type { BenchResult, MetricSummary } from './result.ts';

const BYTES_PER_GIBIBYTE = 1024 ** 3;

function runGit(args: readonly string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

export function readEnvironment(browser: Browser): BenchResult['environment'] {
  return {
    platform: platform(),
    arch: arch(),
    cpuModel: cpus()[0]?.model ?? 'n/a',
    cpuCount: cpus().length,
    memoryGiB: Math.round(totalmem() / BYTES_PER_GIBIBYTE),
    nodeVersion: process.version,
    browser: `${browser.browserType().name()} ${browser.version()}`,
    gitCommit: runGit(['rev-parse', '--short', 'HEAD']),
    gitDirty: runGit(['status', '--porcelain']) !== '',
  };
}

function formatMetric(metric: MetricSummary | undefined): string {
  if (metric === undefined) {
    return '-';
  }
  const digits = metric.unit === 'count' ? 0 : 1;
  return `${metric.median.toFixed(digits)} ±${metric.iqr.toFixed(digits)}`;
}

/** 指標ごとに、実装の中央値と四分位範囲を Markdown の表にする */
export function formatResultTable(result: BenchResult): string {
  const variantIds = Object.keys(result.variants);
  // 記録されない実装がある指標も表に残す
  const metricNames = [
    ...new Set(Object.values(result.variants).flatMap(({ metrics }) => Object.keys(metrics))),
  ];

  const rows = metricNames.map((name) => {
    const cells = variantIds.map((variant) =>
      formatMetric(result.variants[variant]?.metrics[name]),
    );
    return `| ${name} | ${cells.join(' | ')} |`;
  });

  return [
    `| 指標 | ${variantIds.join(' | ')} |`,
    `| --- | ${variantIds.map(() => '---').join(' | ')} |`,
    ...rows,
  ].join('\n');
}
