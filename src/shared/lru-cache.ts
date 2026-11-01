export type LruCache<Key, Value> = {
  get(key: Key): Value | undefined;
  set(key: Key, value: Value): void;
  delete(key: Key): void;
  readonly size: number;
};

/** 件数に上限のあるキャッシュ。上限を超えたら、最も長く使われていない項目から捨てる */
export function createLruCache<Key, Value>(capacity: number): LruCache<Key, Value> {
  // Map は追加した順に並ぶので、先頭が最も長く使われていない項目になる
  const entries = new Map<Key, Value>();

  return {
    get(key) {
      const value = entries.get(key);
      if (value !== undefined) {
        entries.delete(key);
        entries.set(key, value);
      }
      return value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, value);
      if (entries.size > capacity) {
        const oldest = entries.keys().next();
        if (!oldest.done) {
          entries.delete(oldest.value);
        }
      }
    },
    delete(key) {
      entries.delete(key);
    },
    get size() {
      return entries.size;
    },
  };
}
