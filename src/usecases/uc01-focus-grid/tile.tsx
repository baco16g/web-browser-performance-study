import { memo, useEffect, useRef } from 'react';
import type { Product } from '../../shared/products.ts';

const HUE_STEP = 30;

export const PRICE_LOCALE = 'ja-JP';

/** 本番ビルドでも使える再レンダリングの数え方。描画の結果には影響しない */
export const tileRenderCounter = { count: 0 };

type Props = {
  index: number;
  product: Product;
  focused: boolean;
  /** 渡すと、呼び出しのたびに書式を準備せずに価格を整形する */
  priceFormat?: Intl.NumberFormat | undefined;
};

export function Tile({ index, product, focused, priceFormat }: Props) {
  tileRenderCounter.count += 1;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const price = priceFormat?.format(product.price) ?? product.price.toLocaleString(PRICE_LOCALE);

  useEffect(() => {
    if (focused) {
      buttonRef.current?.focus();
    }
  }, [focused]);

  return (
    <button
      ref={buttonRef}
      type="button"
      className="tile"
      data-testid={`tile-${index}`}
      data-focused={focused}
      tabIndex={focused ? 0 : -1}
    >
      <span
        className="tile__thumbnail"
        style={{ backgroundColor: `hsl(${product.imageId * HUE_STEP} 60% 55%)` }}
      />
      <span className="tile__title">{product.title}</span>
      <span className="tile__price">¥{price}</span>
    </button>
  );
}

export const MemoTile = memo(Tile);
