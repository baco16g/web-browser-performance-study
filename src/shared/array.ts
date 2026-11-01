// Array.prototype.at と findLast は Safari 15.4 より前の環境にないので使わない

export function lastOf<T>(items: readonly T[]): T | undefined {
  return items[items.length - 1];
}

export function findLastOf<T>(items: readonly T[], predicate: (item: T) => boolean): T | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item !== undefined && predicate(item)) {
      return item;
    }
  }
  return undefined;
}
