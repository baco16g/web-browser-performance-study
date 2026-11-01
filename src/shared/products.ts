import { createRandom } from './random.ts';

/** 架空のストアの商品。サーバーとページの両方が同じ固定データを使う */
export type Product = {
  id: string;
  title: string;
  description: string;
  price: number;
  imageId: number;
};

export const IMAGE_VARIATIONS = 12;

const ADJECTIVES = ['軽量', '折りたたみ', '静音', '木製', '防水', '充電式', '大容量', '携帯用'];
const ITEMS = ['デスクライト', 'ノート', 'ボトル', 'スピーカー', 'バッグ', 'ペンケース', 'チェア'];
const PHRASES = [
  '毎日の作業を支える定番の品です。',
  '持ち運びやすい大きさにまとめました。',
  '長く使えるように素材を選びました。',
  '贈り物にも選ばれています。',
  '手入れがしやすく、汚れも落としやすい作りです。',
  '在庫が少なくなっています。',
];

function pick(items: readonly string[], random: () => number): string {
  return items[Math.floor(random() * items.length)] ?? '';
}

function createProduct(index: number): Product {
  const random = createRandom(index + 1);
  const phraseCount = 1 + Math.floor(random() * 5);
  const description = Array.from({ length: phraseCount }, () => pick(PHRASES, random)).join('');

  return {
    id: `product-${index}`,
    title: `${pick(ADJECTIVES, random)}${pick(ITEMS, random)}`,
    description,
    price: 500 + Math.floor(random() * 95) * 100,
    imageId: index % IMAGE_VARIATIONS,
  };
}

export function createProducts(count: number): Product[] {
  return Array.from({ length: count }, (_, index) => createProduct(index));
}

export function findProduct(id: string): Product | undefined {
  const index = Number(id.replace('product-', ''));
  return Number.isInteger(index) && index >= 0 ? createProduct(index) : undefined;
}
