export const VARIANT_IDS = ['bad', 'revalidate', 'fresh', 'memory', 'good'] as const;

export type VariantId = (typeof VARIANT_IDS)[number];

/** サーバーが返す Cache-Control の種類 */
export type HttpCachePolicy = 'no-store' | 'revalidate' | 'max-age';

export type CacheStrategy = {
  httpPolicy: HttpCachePolicy;
  /** 取得した結果をアプリのメモリに持つ */
  memoryCache: boolean;
  /** フォーカスがとどまった項目を先に取得する */
  prefetchOnFocus: boolean;
};

const HTTP_POLICIES: Readonly<Record<VariantId, HttpCachePolicy>> = {
  bad: 'no-store',
  revalidate: 'revalidate',
  fresh: 'max-age',
  memory: 'max-age',
  good: 'max-age',
};

export function createStrategy(variant: VariantId): CacheStrategy {
  return {
    httpPolicy: HTTP_POLICIES[variant],
    memoryCache: variant === 'memory' || variant === 'good',
    prefetchOnFocus: variant === 'good',
  };
}
