import { type KeyboardEvent, memo, useCallback, useMemo, useSyncExternalStore } from 'react';
import type { Product } from '../../shared/products.ts';
import { createFocusStore, type FocusStore } from './focus-store.ts';
import { directionFromKey, nextIndexInGrid } from './navigation.ts';
import { Tile } from './tile.tsx';

type ConnectedTileProps = {
  store: FocusStore;
  index: number;
  product: Product;
};

/** 自分がフォーカスされているかだけを購読し、値が変わった項目だけ描き直す */
const ConnectedTile = memo(function ConnectedTile({ store, index, product }: ConnectedTileProps) {
  const subscribe = useCallback(
    (onChange: () => void) => store.subscribeIndex(index, onChange),
    [store, index],
  );
  const focused = useSyncExternalStore(subscribe, () => store.isFocused(index));
  return <Tile index={index} product={product} focused={focused} />;
});

type Props = {
  products: readonly Product[];
  columns: number;
  onMove(event: KeyboardEvent): void;
};

export function StoreGrid({ products, columns, onMove }: Props) {
  const store = useMemo(() => createFocusStore(0), []);

  const onKeyDown = (event: KeyboardEvent): void => {
    const direction = directionFromKey(event.key);
    const next =
      direction && nextIndexInGrid(store.getFocusedIndex(), direction, columns, products.length);
    if (next === null) {
      return;
    }
    event.preventDefault();
    onMove(event);
    store.setFocusedIndex(next);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 実際にフォーカスを受けるのは内側のボタンで、ここはキー入力の集約点
    <div onKeyDown={onKeyDown}>
      {products.map((product, index) => (
        <ConnectedTile key={product.id} store={store} index={index} product={product} />
      ))}
    </div>
  );
}
