import { describe, expect, it } from 'vitest';
import { maxHeightPerRow } from './equalize.ts';

describe('maxHeightPerRow', () => {
  it('列数ごとに最大の高さを求める', () => {
    expect(maxHeightPerRow([10, 30, 20, 40, 5, 5], 3)).toEqual([30, 40]);
  });

  it('端数の行も 1 行として扱う', () => {
    expect(maxHeightPerRow([10, 20, 30], 2)).toEqual([20, 30]);
  });
});
