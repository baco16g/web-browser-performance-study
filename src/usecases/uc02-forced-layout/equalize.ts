export type EqualizeStrategy = (cards: readonly HTMLElement[], columns: number) => void;

/** 同じ行に並ぶカードの高さの最大値を、行ごとに求める */
export function maxHeightPerRow(heights: readonly number[], columns: number): number[] {
  const rowHeights: number[] = [];
  heights.forEach((height, index) => {
    const row = Math.floor(index / columns);
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, height);
  });
  return rowHeights;
}

function applyRowHeights(
  cards: readonly HTMLElement[],
  rowHeights: readonly number[],
  columns: number,
): void {
  cards.forEach((card, index) => {
    card.style.height = `${rowHeights[Math.floor(index / columns)] ?? 0}px`;
  });
}

/**
 * 遅い実装。書き込みの直後に offsetHeight を読むたびに、ブラウザは最新の高さを返すために
 * その場でレイアウトを実行する。カードの枚数だけレイアウトが走る。
 */
export const equalizeInterleaved: EqualizeStrategy = (cards, columns) => {
  const heights: number[] = [];
  for (const card of cards) {
    card.style.height = 'auto';
    const height = card.offsetHeight;
    heights.push(height);
    card.style.height = `${height}px`;
  }
  applyRowHeights(cards, maxHeightPerRow(heights, columns), columns);
};

/** 改善した実装。先に書き込みを済ませ、読み取りをまとめるとレイアウトは 1 回で済む */
export const equalizeBatched: EqualizeStrategy = (cards, columns) => {
  for (const card of cards) {
    card.style.height = 'auto';
  }
  const heights = cards.map((card) => card.offsetHeight);
  applyRowHeights(cards, maxHeightPerRow(heights, columns), columns);
};
