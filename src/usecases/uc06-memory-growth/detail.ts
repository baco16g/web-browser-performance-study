import { createLruCache, type LruCache } from '../../shared/lru-cache.ts';
import type { Product } from '../../shared/products.ts';

const REVIEW_COUNT = 2_000;

export type Review = { id: string; rating: number; body: string };
export type ProductDetail = { product: Product; reviews: Review[] };

/** 詳細画面が持つ大きなデータ。保持されたままだとヒープの増加としてはっきり現れる */
export function createDetail(product: Product): ProductDetail {
  const reviews = Array.from({ length: REVIEW_COUNT }, (_, index) => ({
    id: `${product.id}-review-${index}`,
    rating: (index % 5) + 1,
    body: `${product.title} のレビュー ${index}: ${product.description}`,
  }));
  return { product, reviews };
}

export type DetailCache = Pick<LruCache<string, ProductDetail>, 'get' | 'set'>;

/** 上限のないキャッシュ。再表示は速くなるが、見た商品の数だけ増え続ける */
function createUnboundedCache(): DetailCache {
  const entries = new Map<string, ProductDetail>();
  return {
    get: (key) => entries.get(key),
    set: (key, value) => {
      entries.set(key, value);
    },
  };
}

export function createDetailCache(capacity: number | null): DetailCache {
  return capacity === null ? createUnboundedCache() : createLruCache(capacity);
}
