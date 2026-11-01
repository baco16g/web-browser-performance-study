import { describe, expect, it } from 'vitest';
import { createStrategy, VARIANT_IDS } from './strategy.ts';

function countEnabled(variant: (typeof VARIANT_IDS)[number]): number {
  return Object.values(createStrategy(variant)).filter(Boolean).length;
}

describe('createStrategy', () => {
  it('bad はどの改善も使わない', () => {
    expect(countEnabled('bad')).toBe(0);
  });

  it('隣り合う実装の差は改善 1 つだけ', () => {
    expect(VARIANT_IDS.map(countEnabled)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
