import { describe, expect, it } from 'vitest';
import { findLastOf, lastOf } from './array.ts';

describe('lastOf', () => {
  it('最後の要素を返す', () => {
    expect(lastOf([1, 2, 3])).toBe(3);
  });

  it('空の配列では undefined を返す', () => {
    expect(lastOf([])).toBeUndefined();
  });
});

describe('findLastOf', () => {
  it('条件に合う最後の要素を返す', () => {
    expect(findLastOf([1, 2, 3, 4], (value) => value % 2 === 1)).toBe(3);
  });

  it('見つからなければ undefined を返す', () => {
    expect(findLastOf([1], (value) => value > 1)).toBeUndefined();
  });
});
