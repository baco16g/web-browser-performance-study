import { createLruCache } from '../../shared/lru-cache.ts';
import type { Product } from '../../shared/products.ts';
import type { CacheStrategy } from './strategy.ts';

const MEMORY_CACHE_CAPACITY = 20;

export type CatalogDetail = { product: Product; revision: number; notes: string[] };

export type DetailLoader = {
  load(id: string): Promise<CatalogDetail>;
  /** メモリのキャッシュがあるとき、同期的に結果を返す */
  peek(id: string): CatalogDetail | undefined;
};

async function fetchDetail(url: string): Promise<CatalogDetail> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} の取得に失敗しました: ${response.status}`);
  }
  return response.json();
}

export function createDetailLoader(strategy: CacheStrategy, delayMs: number): DetailLoader {
  const createUrl = (id: string): string =>
    `/api/catalog/${id}?policy=${strategy.httpPolicy}&delay=${delayMs}`;

  if (!strategy.memoryCache) {
    return { load: (id) => fetchDetail(createUrl(id)), peek: () => undefined };
  }

  // 取得中の Promise も保持し、先読みと表示が重なっても通信を 1 回で済ませる
  const pending = createLruCache<string, Promise<CatalogDetail>>(MEMORY_CACHE_CAPACITY);
  const loaded = createLruCache<string, CatalogDetail>(MEMORY_CACHE_CAPACITY);

  return {
    load(id) {
      const started = pending.get(id);
      if (started !== undefined) {
        return started;
      }
      const request = fetchDetail(createUrl(id)).then(
        (detail) => {
          loaded.set(id, detail);
          return detail;
        },
        (error: Error) => {
          pending.delete(id);
          throw error;
        },
      );
      pending.set(id, request);
      return request;
    },
    peek: (id) => loaded.get(id),
  };
}
