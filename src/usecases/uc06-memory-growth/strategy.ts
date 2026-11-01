export const VARIANT_IDS = ['bad', 'listener', 'detached', 'good'] as const;

export type VariantId = (typeof VARIANT_IDS)[number];

export type MemoryStrategy = {
  /** 画面を離れるときにイベントリスナーを外す */
  removesListeners: boolean;
  /** 画面を離れるときに要素の登録を外す */
  releasesElements: boolean;
  /** キャッシュに件数の上限を設ける */
  boundedCache: boolean;
};

/** 実装は 1 段階ずつ改善を足していく。隣り合う実装の差を見れば、その改善の効果が分かる */
export function createStrategy(variant: VariantId): MemoryStrategy {
  const level = VARIANT_IDS.indexOf(variant);
  return {
    removesListeners: level >= 1,
    releasesElements: level >= 2,
    boundedCache: level >= 3,
  };
}
