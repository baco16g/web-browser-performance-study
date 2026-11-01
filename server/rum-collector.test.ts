import { describe, expect, it } from 'vitest';
import type { RumBeacon } from '../src/perf/rum.ts';
import { createRumStore, parseBeacons } from './rum-collector.ts';

const BEACON: RumBeacon = {
  metric: 'vitals:lcp',
  value: 1,
  page: '/',
  variant: 'good',
  segment: 'fast',
};

describe('parseBeacons', () => {
  it('正しい形の値だけを残す', () => {
    const body = JSON.stringify([BEACON, { metric: 'vitals:lcp' }, { ...BEACON, value: 'x' }]);
    expect(parseBeacons(body)).toEqual([BEACON]);
  });

  it('JSON でない本文は空にする', () => {
    expect(parseBeacons('not json')).toEqual([]);
  });

  it('配列でない本文は空にする', () => {
    expect(parseBeacons('{"metric":"a"}')).toEqual([]);
  });
});

describe('createRumStore', () => {
  it('上限を超えたら古い値から捨てる', () => {
    const store = createRumStore(2);
    store.add([
      { ...BEACON, value: 1 },
      { ...BEACON, value: 2 },
    ]);
    store.add([{ ...BEACON, value: 3 }]);

    expect(store.list().map(({ value }) => value)).toEqual([2, 3]);
  });

  it('空にできる', () => {
    const store = createRumStore();
    store.add([BEACON]);
    store.clear();

    expect(store.list()).toEqual([]);
  });
});
