export const VARIANT_IDS = ['bad', 'isolated', 'light', 'sized', 'lazy', 'good'] as const;

export type VariantId = (typeof VARIANT_IDS)[number];

export type ScrollStrategy = {
  /** スクロール位置の表示を親の state に持たず、該当の要素だけを書き換える */
  isolatedScrollState: boolean;
  /** 影やぼかしの重い表現をやめる */
  lightEffects: boolean;
  /** 表示の大きさに合う画像を配信する */
  sizedImages: boolean;
  /** 画面の近くに来るまで画像を読み込まない */
  lazyImages: boolean;
  /** 画面の近くの行だけを DOM に置く */
  virtualized: boolean;
};

/** 実装は 1 段階ずつ改善を足していく。隣り合う実装の差を見れば、その改善の効果が分かる */
export function createStrategy(variant: VariantId): ScrollStrategy {
  const level = VARIANT_IDS.indexOf(variant);
  return {
    isolatedScrollState: level >= 1,
    lightEffects: level >= 2,
    sizedImages: level >= 3,
    lazyImages: level >= 4,
    virtualized: level >= 5,
  };
}
