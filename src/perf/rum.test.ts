import { describe, expect, it, vi } from 'vitest';
import { createRumReporter, pickLatestValues, type RumBeacon } from './rum.ts';

function createBeacon(value: number): RumBeacon {
  return { metric: 'vitals:lcp', value, page: '/', variant: 'good', segment: 'fast' };
}

describe('createRumReporter', () => {
  it('抽出から外れた読み込みでは送らない', () => {
    const send = vi.fn(() => true);
    const reporter = createRumReporter({ sampleRate: 0.1, random: () => 0.5, send });

    reporter.report(createBeacon(1));
    reporter.flush();

    expect(send).not.toHaveBeenCalled();
  });

  it('抽出の判定は読み込みごとに 1 回だけ行う', () => {
    const random = vi.fn(() => 0);
    const reporter = createRumReporter({ sampleRate: 0.1, random, send: () => true });

    reporter.report(createBeacon(1));
    reporter.report(createBeacon(2));

    expect(random).toHaveBeenCalledTimes(1);
  });

  it('まとめて送り、送った分は空にする', () => {
    const send = vi.fn((_body: string) => true);
    const reporter = createRumReporter({ sampleRate: 1, random: () => 0, send });

    reporter.report(createBeacon(1));
    reporter.report(createBeacon(2));
    reporter.flush();
    reporter.flush();

    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(send.mock.calls[0]?.[0] ?? '[]')).toHaveLength(2);
  });

  it('上限まで溜まったら送る', () => {
    const send = vi.fn(() => true);
    const reporter = createRumReporter({ sampleRate: 1, random: () => 0, send });

    for (let value = 0; value < 20; value += 1) {
      reporter.report(createBeacon(value));
    }

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('送信を断られたら残して次の機会に送る', () => {
    const send = vi.fn(() => false);
    const reporter = createRumReporter({ sampleRate: 1, random: () => 0, send });

    reporter.report(createBeacon(1));
    reporter.flush();
    send.mockReturnValue(true);
    reporter.flush();

    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe('pickLatestValues', () => {
  it('指標ごとに最後の値を取り出し、記録のない指標は除く', () => {
    const samples = [
      { name: 'vitals:lcp', value: 1 },
      { name: 'vitals:lcp', value: 2 },
      { name: 'other', value: 3 },
    ];
    expect(pickLatestValues(samples, ['vitals:lcp', 'vitals:cls'])).toEqual([
      { metric: 'vitals:lcp', value: 2 },
    ]);
  });
});
