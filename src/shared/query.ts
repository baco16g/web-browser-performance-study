/** `?variant=` を読む。一覧にない値は先頭の実装として扱う */
export function readVariant<const Id extends string>(variantIds: readonly [Id, ...Id[]]): Id {
  const requested = new URLSearchParams(location.search).get('variant');
  return variantIds.find((id) => id === requested) ?? variantIds[0];
}

export function readPositiveInt(name: string, fallback: number): number {
  const value = Number(new URLSearchParams(location.search).get(name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/** 件数などの他の条件を保ったまま、実装だけを切り替える URL を作る */
export function createVariantHref(variantId: string): string {
  const params = new URLSearchParams(location.search);
  params.set('variant', variantId);
  return `?${params}`;
}
