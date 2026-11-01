import { createProducts, type Product } from '../../shared/products.ts';
import { searchProducts } from './search.ts';

export type SearchRequest = { requestId: number; query: string; count: number };
export type SearchResponse = { requestId: number; indices: number[]; durationMs: number };

let products: readonly Product[] = [];
let pendingRequest: SearchRequest | null = null;

function runPendingSearch(): void {
  const request = pendingRequest;
  pendingRequest = null;
  if (request === null) {
    return;
  }
  if (products.length !== request.count) {
    products = createProducts(request.count);
  }
  const start = performance.now();
  const indices = searchProducts(products, request.query);
  const response: SearchResponse = {
    requestId: request.requestId,
    indices,
    durationMs: performance.now() - start,
  };
  self.postMessage(response);
}

// 検索の途中で届いた要求はまとめ、最後の 1 件だけを処理する
self.onmessage = ({ data }: MessageEvent<SearchRequest>) => {
  if (pendingRequest === null) {
    setTimeout(runPendingSearch);
  }
  pendingRequest = data;
};
