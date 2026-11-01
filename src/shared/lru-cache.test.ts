import { describe, expect, it } from 'vitest';
import { createLruCache } from './lru-cache.ts';

describe('createLruCache', () => {
  it('上限を超えたら最も古い項目を捨てる', () => {
    const cache = createLruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.size).toBe(2);
  });

  it('読み取った項目は最近使ったものとして残す', () => {
    const cache = createLruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');
    cache.set('c', 3);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
  });

  it('同じキーを書き直しても件数は増えない', () => {
    const cache = createLruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('a', 2);

    expect(cache.size).toBe(1);
    expect(cache.get('a')).toBe(2);
  });

  it('項目を削除できる', () => {
    const cache = createLruCache<string, number>(2);
    cache.set('a', 1);
    cache.delete('a');

    expect(cache.get('a')).toBeUndefined();
  });
});
