/** 実行のたびに同じ並びを返す線形合同法。計測の条件をそろえるために乱数の種を固定する */
export function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}
