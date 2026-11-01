import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { type JudgeLimits, type Judgement, judge } from '../src/perf/judge.ts';
import type { Unit } from '../src/perf/recorder.ts';
import { type BenchResult, readRunMedians, type VariantResult } from './result.ts';

const BYTES_PER_MEBIBYTE = 1024 ** 2;

/** 回帰とみなす悪化の幅。回数の指標は揺れが小さいので、わずかな増加も拾う */
const LIMITS_BY_UNIT: Record<Unit, JudgeLimits> = {
  ms: { relative: 0.1, absolute: 5 },
  count: { relative: 0.1, absolute: 2 },
  score: { relative: 0.1, absolute: 0.01 },
  bytes: { relative: 0.05, absolute: BYTES_PER_MEBIBYTE },
};

const { values } = parseArgs({
  options: {
    baseline: { type: 'string' },
    candidate: { type: 'string' },
    variant: { type: 'string', default: 'good' },
  },
});

function readResult(path: string | undefined, option: string): BenchResult {
  if (path === undefined) {
    throw new Error(`--${option} に結果のファイルを指定してください`);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readVariant(result: BenchResult, variant: string): VariantResult {
  const found = result.variants[variant];
  if (found === undefined) {
    throw new Error(`実装 ${variant} の結果がありません`);
  }
  return found;
}

function formatJudgement(name: string, { verdict, delta, relativeDelta }: Judgement): string {
  const percent = Number.isFinite(relativeDelta) ? `${(relativeDelta * 100).toFixed(1)}%` : '-';
  return `${verdict.padEnd(4)} ${name}: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} (${percent})`;
}

const baseline = readVariant(readResult(values.baseline, 'baseline'), values.variant);
const candidate = readVariant(readResult(values.candidate, 'candidate'), values.variant);

const judgements = Object.entries(baseline.metrics).flatMap(([name, { unit }]) => {
  if (candidate.metrics[name] === undefined) {
    console.log(`skip ${name}: 比較先に値がありません`);
    return [];
  }
  const judgement = judge(
    readRunMedians(baseline.runs, name),
    readRunMedians(candidate.runs, name),
    LIMITS_BY_UNIT[unit],
  );
  console.log(formatJudgement(name, judgement));
  return [judgement];
});

if (judgements.some(({ verdict }) => verdict === 'fail')) {
  process.exitCode = 1;
}
