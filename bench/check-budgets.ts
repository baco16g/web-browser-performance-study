import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { BUDGETS, checkBudgets } from './budgets.ts';
import type { BenchResult } from './result.ts';

const { values } = parseArgs({
  options: {
    results: { type: 'string', default: resolve(import.meta.dirname, 'results') },
  },
});

const scenarioIds = [...new Set(BUDGETS.map(({ scenario }) => scenario))];
const results = scenarioIds.flatMap((id): BenchResult[] => {
  const path = resolve(values.results, `${id}-latest.json`);
  return existsSync(path) ? [JSON.parse(readFileSync(path, 'utf8'))] : [];
});

const violations = checkBudgets(results, BUDGETS);

console.log(`予算 ${BUDGETS.length} 件のうち ${BUDGETS.length - violations.length} 件が通過`);
for (const { scenario, variant, metric, max, actual } of violations) {
  console.error(`違反 ${scenario} ${variant} ${metric}: 上限 ${max}、実測 ${actual ?? '値なし'}`);
}

if (violations.length > 0) {
  process.exitCode = 1;
}
