import type { BenchResult } from './result.ts';

/** 改善した実装で守りたい上限。回数のように実行環境で変わらない指標だけを置く */
export type Budget = {
  scenario: string;
  variant: string;
  metric: string;
  max: number;
};

export const BUDGETS: readonly Budget[] = [
  { scenario: 'uc01', variant: 'good', metric: 'uc01:tile-renders', max: 2 },
  { scenario: 'uc01', variant: 'good', metric: 'cdp:layout-count', max: 0 },
  { scenario: 'uc02', variant: 'good', metric: 'cdp:layout-count', max: 2 },
  { scenario: 'uc02', variant: 'css', metric: 'cdp:layout-count', max: 1 },
  { scenario: 'uc04', variant: 'good', metric: 'vitals:cls', max: 0.01 },
  { scenario: 'uc06', variant: 'good', metric: 'cdp:retained-listeners', max: 0 },
  { scenario: 'uc06', variant: 'good', metric: 'cdp:retained-nodes', max: 10 },
  { scenario: 'uc07', variant: 'good', metric: 'uc07:requests', max: 1 },
];

export type BudgetViolation = Budget & { actual: number | null };

/** 結果が予算を超えていないかを調べる。指標が見つからないときも違反として扱う */
export function checkBudgets(
  results: readonly BenchResult[],
  budgets: readonly Budget[],
): BudgetViolation[] {
  return budgets.flatMap((budget) => {
    const result = results.find(({ scenario }) => scenario === budget.scenario);
    const actual = result?.variants[budget.variant]?.metrics[budget.metric]?.median ?? null;
    return actual === null || actual > budget.max ? [{ ...budget, actual }] : [];
  });
}
