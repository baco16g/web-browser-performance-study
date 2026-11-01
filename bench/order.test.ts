import { describe, expect, it } from 'vitest';
import { createRunOrder } from './order.ts';

describe('createRunOrder', () => {
  it('すべての組み合わせを 1 回ずつ含む', () => {
    const order = createRunOrder(['bad', 'good'], 3, 1);
    expect(order).toHaveLength(6);
    expect(
      order
        .filter(({ variant }) => variant === 'good')
        .map(({ run }) => run)
        .sort(),
    ).toEqual([0, 1, 2]);
  });

  it('同じ種なら同じ順番になる', () => {
    expect(createRunOrder(['a', 'b', 'c'], 5, 7)).toEqual(createRunOrder(['a', 'b', 'c'], 5, 7));
  });

  it('種が違えば順番が変わる', () => {
    expect(createRunOrder(['a', 'b', 'c'], 5, 1)).not.toEqual(
      createRunOrder(['a', 'b', 'c'], 5, 2),
    );
  });
});
