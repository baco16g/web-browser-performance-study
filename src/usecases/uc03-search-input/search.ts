import type { Product } from '../../shared/products.ts';

export const MAX_RESULTS = 200;
export const CHUNK_SIZE = 500;

/** 文字が順番どおりに現れるかを調べ、連続して一致するほど高い点を付ける。一致しなければ 0 */
export function scoreText(text: string, query: string): number {
  let score = 0;
  let streak = 0;
  let textIndex = 0;

  for (const character of query) {
    const found = text.indexOf(character, textIndex);
    if (found === -1) {
      return 0;
    }
    streak = found === textIndex ? streak + 1 : 1;
    score += streak;
    textIndex = found + 1;
  }
  return score;
}

/** 検索語と比べる形に揃える。全角と半角の違いをなくすために 1 件ごとに正規化する */
export function scoreProduct(product: Product, normalizedQuery: string): number {
  const text = `${product.id} ${product.title} ${product.description}`
    .normalize('NFKC')
    .toLowerCase();
  return scoreText(text, normalizedQuery);
}

export function normalizeQuery(query: string): string {
  return query.normalize('NFKC').toLowerCase();
}

export type Match = { index: number; score: number };

/** products の start から end の手前までを採点し、一致した項目を matches に足す */
export function scoreRange(
  products: readonly Product[],
  normalizedQuery: string,
  start: number,
  end: number,
  matches: Match[],
): void {
  for (let index = start; index < end; index += 1) {
    const product = products[index];
    const score = product === undefined ? 0 : scoreProduct(product, normalizedQuery);
    if (score > 0) {
      matches.push({ index, score });
    }
  }
}

/** 点数の高い順に並べ、表示する件数だけ取り出す。同点は元の順番を保つ */
export function takeTopMatches(matches: readonly Match[]): number[] {
  return [...matches]
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, MAX_RESULTS)
    .map(({ index }) => index);
}

/** 全件を一度に検索する。呼び出した場所のスレッドを処理が終わるまで占有する */
export function searchProducts(products: readonly Product[], query: string): number[] {
  const matches: Match[] = [];
  scoreRange(products, normalizeQuery(query), 0, products.length, matches);
  return takeTopMatches(matches);
}
