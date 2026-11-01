import { type KeyboardEvent, useState } from 'react';
import type { Product } from '../../shared/products.ts';
import { directionFromKey, nextIndexInGrid } from './navigation.ts';
import { MemoTile, Tile } from './tile.tsx';

type Props = {
  products: readonly Product[];
  columns: number;
  memoized: boolean;
  onMove(event: KeyboardEvent): void;
};

/** 遅い実装。フォーカス位置が親の state にあるので、移動のたびに全項目を処理する */
export function StateGrid({ products, columns, memoized, onMove }: Props) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const TileComponent = memoized ? MemoTile : Tile;

  const onKeyDown = (event: KeyboardEvent): void => {
    const direction = directionFromKey(event.key);
    const next = direction && nextIndexInGrid(focusedIndex, direction, columns, products.length);
    if (next === null) {
      return;
    }
    event.preventDefault();
    onMove(event);
    setFocusedIndex(next);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 実際にフォーカスを受けるのは内側のボタンで、ここはキー入力の集約点
    <div onKeyDown={onKeyDown}>
      {products.map((product, index) => (
        <TileComponent
          key={product.id}
          index={index}
          product={product}
          focused={index === focusedIndex}
        />
      ))}
    </div>
  );
}
