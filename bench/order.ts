import { createRandom } from '../src/shared/random.ts';

/** 乱数の種を固定して配列を混ぜる。同じ種なら同じ順番になる */
export function shuffle<T>(items: readonly T[], seed: number): T[] {
  const shuffled = [...items];
  const random = createRandom(seed);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = shuffled[index];
    const swapped = shuffled[swapIndex];
    if (current !== undefined && swapped !== undefined) {
      shuffled[index] = swapped;
      shuffled[swapIndex] = current;
    }
  }

  return shuffled;
}

export type RunPlan = { variant: string; run: number };

/**
 * 実行の順番を決める。実装ごとにまとめて測ると、発熱などの時間変化が特定の実装に偏る。
 * 順番を混ぜつつ乱数の種を固定し、同じ順番で再実行できるようにする。
 */
export function createRunOrder(variants: readonly string[], runs: number, seed: number): RunPlan[] {
  const plans = variants.flatMap((variant) =>
    Array.from({ length: runs }, (_, run) => ({ variant, run })),
  );
  return shuffle(plans, seed);
}
