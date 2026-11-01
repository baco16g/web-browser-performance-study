import type { Product } from '../../shared/products.ts';

export type Hero = { title: string; imageId: number };
export type Catalog = { products: Product[]; hero: Hero };
export type Banner = { message: string };

declare global {
  interface Window {
    /** HTML の中で取得を始めたときの結果 */
    __earlyCatalog?: Promise<Catalog>;
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} の取得に失敗しました: ${response.status}`);
  }
  return response.json();
}

type CatalogRequest = { count: number; delayMs: number; parallel: boolean };

export async function loadCatalog({ count, delayMs, parallel }: CatalogRequest): Promise<Catalog> {
  if (window.__earlyCatalog !== undefined) {
    return window.__earlyCatalog;
  }

  const fetchProducts = () =>
    fetchJson<{ products: Product[] }>(`/api/products?count=${count}&delay=${delayMs}`);
  const fetchHero = () => fetchJson<Hero>(`/api/hero?delay=${delayMs}`);

  if (parallel) {
    const [{ products }, hero] = await Promise.all([fetchProducts(), fetchHero()]);
    return { products, hero };
  }
  const { products } = await fetchProducts();
  return { products, hero: await fetchHero() };
}

export function loadBanner(delayMs: number): Promise<Banner> {
  return fetchJson<Banner>(`/api/banner?delay=${delayMs}`);
}
