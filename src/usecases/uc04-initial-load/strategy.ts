export const VARIANT_IDS = ['bad', 'parallel', 'priority', 'reserved', 'early', 'good'] as const;

export type VariantId = (typeof VARIANT_IDS)[number];

export type LoadStrategy = {
  /** API を順番に待たず、同時に呼ぶ */
  parallelFetch: boolean;
  /** 主要な画像を遅延読み込みにせず、優先度を上げ、表示に合う寸法にする */
  prioritizedHero: boolean;
  /** 画像とバナーの領域を先に確保する */
  reservedSpace: boolean;
  /** HTML の段階で画像とデータの取得を始める */
  earlyStart: boolean;
  /** 最初の範囲だけ先に描き、残りは後回しにする */
  progressiveList: boolean;
};

/** 実装は 1 段階ずつ改善を足していく。隣り合う実装の差を見れば、その改善の効果が分かる */
export function createStrategy(variant: VariantId): LoadStrategy {
  const level = VARIANT_IDS.indexOf(variant);
  return {
    parallelFetch: level >= 1,
    prioritizedHero: level >= 2,
    reservedSpace: level >= 3,
    earlyStart: level >= 4,
    progressiveList: level >= 5,
  };
}
