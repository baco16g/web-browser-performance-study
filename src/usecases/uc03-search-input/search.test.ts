import { describe, expect, it } from 'vitest';
import { createProducts } from '../../shared/products.ts';
import {
  MAX_RESULTS,
  normalizeQuery,
  scoreText,
  searchProducts,
  takeTopMatches,
} from './search.ts';

describe('scoreText', () => {
  it('順番どおりに現れない文字列は 0 点にする', () => {
    expect(scoreText('abc', 'ca')).toBe(0);
  });

  it('連続して一致するほど高い点を付ける', () => {
    expect(scoreText('abc', 'ab')).toBeGreaterThan(scoreText('axb', 'ab'));
  });
});

describe('normalizeQuery', () => {
  it('全角英数字と大文字を揃える', () => {
    expect(normalizeQuery('ＡＢ１')).toBe('ab1');
  });
});

describe('takeTopMatches', () => {
  it('点数の高い順に並べ、同点は元の順番を保つ', () => {
    const matches = [
      { index: 2, score: 1 },
      { index: 0, score: 1 },
      { index: 1, score: 5 },
    ];
    expect(takeTopMatches(matches)).toEqual([1, 0, 2]);
  });

  it('表示する件数までに絞る', () => {
    const matches = Array.from({ length: MAX_RESULTS + 1 }, (_, index) => ({ index, score: 1 }));
    expect(takeTopMatches(matches)).toHaveLength(MAX_RESULTS);
  });
});

describe('searchProducts', () => {
  it('商品の ID でも見つかる', () => {
    const products = createProducts(300);
    const [first] = searchProducts(products, 'product-299');
    expect(first).toBe(299);
  });

  it('一致しなければ空を返す', () => {
    expect(searchProducts(createProducts(10), 'zzz')).toEqual([]);
  });
});
