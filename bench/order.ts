import { createRandom } from '../src/shared/random.ts';

export type RunPlan = { variant: string; run: number };

/**
 * 実行の順番を決める。実装ごとにまとめて測ると、発熱などの時間変化が特定の実装に偏る。
 * 順番を混ぜつつ乱数の種を固定し、同じ順番で再実行できるようにする。
 */
export function createRunOrder(variants: readonly string[], runs: number, seed: number): RunPlan[] {
  const plans = variants.flatMap((variant) =>
    Array.from({ length: runs }, (_, run) => ({ variant, run })),
  );
  const random = createRandom(seed);

  for (let index = plans.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = plans[index];
    const swapped = plans[swapIndex];
    if (current !== undefined && swapped !== undefined) {
      plans[index] = swapped;
      plans[swapIndex] = current;
    }
  }

  return plans;
}
