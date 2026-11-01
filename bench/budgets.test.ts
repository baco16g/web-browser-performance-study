import { describe, expect, it } from 'vitest';
import { type Budget, checkBudgets } from './budgets.ts';
import type { BenchResult, MetricSummary } from './result.ts';

const BUDGET: Budget = { scenario: 'uc01', variant: 'good', metric: 'renders', max: 2 };

function createResult(median: number): BenchResult {
  const metric = { median, unit: 'count' } as MetricSummary;
  return {
    scenario: 'uc01',
    variants: { good: { runs: [], metrics: { renders: metric } } },
  } as Partial<BenchResult> as BenchResult;
}

describe('checkBudgets', () => {
  it('上限ちょうどなら違反にしない', () => {
    expect(checkBudgets([createResult(2)], [BUDGET])).toEqual([]);
  });

  it('上限を超えたら実測値を添えて返す', () => {
    expect(checkBudgets([createResult(3)], [BUDGET])).toEqual([{ ...BUDGET, actual: 3 }]);
  });

  it('シナリオの結果がなければ違反にする', () => {
    expect(checkBudgets([], [BUDGET])).toEqual([{ ...BUDGET, actual: null }]);
  });

  it('指標がなければ違反にする', () => {
    const budget = { ...BUDGET, metric: 'missing' };
    expect(checkBudgets([createResult(0)], [budget])).toEqual([{ ...budget, actual: null }]);
  });
});
