export type Direction = 'up' | 'down' | 'left' | 'right';

const KEY_TO_DIRECTION: Readonly<Record<string, Direction>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

export function directionFromKey(key: string): Direction | null {
  return KEY_TO_DIRECTION[key] ?? null;
}

/**
 * グリッドの次の位置を求める。端に当たったら null を返す。
 *
 * 計算は四則演算だけで済むので、入力のたびに要素の位置を読まなくてよい。
 */
export function nextIndexInGrid(
  index: number,
  direction: Direction,
  columns: number,
  count: number,
): number | null {
  const column = index % columns;

  switch (direction) {
    case 'left':
      return column === 0 ? null : index - 1;
    case 'right':
      return column === columns - 1 || index === count - 1 ? null : index + 1;
    case 'up':
      return index >= columns ? index - columns : null;
    case 'down': {
      if (index + columns < count) {
        return index + columns;
      }
      // 最後の行が短いときは、下の行があれば最後の項目に寄せる
      const lastRow = Math.floor((count - 1) / columns);
      return Math.floor(index / columns) < lastRow ? count - 1 : null;
    }
  }
}
