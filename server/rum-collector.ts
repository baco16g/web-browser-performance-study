import type { RumBeacon } from '../src/perf/rum.ts';

const MAX_STORED_BEACONS = 10_000;

function isBeacon(value: Partial<RumBeacon>): value is RumBeacon {
  return (
    typeof value.metric === 'string' &&
    typeof value.value === 'number' &&
    Number.isFinite(value.value) &&
    typeof value.page === 'string' &&
    typeof value.variant === 'string' &&
    typeof value.segment === 'string'
  );
}

/** 受け取った本文を検証する。利用者の環境から届く値なので、形の合わないものは捨てる */
export function parseBeacons(body: string): RumBeacon[] {
  try {
    const parsed: Partial<RumBeacon>[] = JSON.parse(body);
    return Array.isArray(parsed) ? parsed.filter(isBeacon) : [];
  } catch {
    return [];
  }
}

export type RumStore = {
  add(beacons: readonly RumBeacon[]): void;
  list(): readonly RumBeacon[];
  clear(): void;
};

/** 計測値を上限つきで保持する。古い値から捨てる */
export function createRumStore(capacity: number = MAX_STORED_BEACONS): RumStore {
  let beacons: RumBeacon[] = [];
  return {
    add(added) {
      beacons = [...beacons, ...added].slice(-capacity);
    },
    list: () => beacons,
    clear() {
      beacons = [];
    },
  };
}
