import type { PerfRecorder } from './recorder.ts';

export type RumBeacon = {
  metric: string;
  value: number;
  page: string;
  variant: string;
  /** 利用者の分類。実際のサービスでは端末や回線の情報から決める */
  segment: string;
};

type RumReporterOptions = {
  sampleRate: number;
  random(): number;
  /** 送信を受け付けられなかったら false を返す */
  send(body: string): boolean;
};

export type RumReporter = {
  report(beacon: RumBeacon): void;
  flush(): void;
};

const MAX_QUEUED_BEACONS = 20;

/**
 * 計測値を一部の利用者からまとめて送る。
 *
 * 抽出はページの読み込みごとに 1 回だけ決める。値ごとに決めると、同じ利用者の値が
 * 欠けた状態で混ざり、指標どうしを比べられなくなる。
 */
export function createRumReporter({ sampleRate, random, send }: RumReporterOptions): RumReporter {
  const sampled = random() < sampleRate;
  let queue: RumBeacon[] = [];

  const flush = (): void => {
    if (queue.length > 0 && send(JSON.stringify(queue))) {
      queue = [];
    }
  };

  return {
    report(beacon) {
      if (!sampled) {
        return;
      }
      queue.push(beacon);
      if (queue.length >= MAX_QUEUED_BEACONS) {
        flush();
      }
    },
    flush,
  };
}

/** 各指標の最後の値を取り出す。LCP や CLS はページを離れるまで値が更新される */
export function pickLatestValues(
  samples: ReadonlyArray<{ name: string; value: number }>,
  metricNames: readonly string[],
): Array<{ metric: string; value: number }> {
  return metricNames.flatMap((metric) => {
    const latest = samples.findLast(({ name }) => name === metric);
    return latest === undefined ? [] : [{ metric, value: latest.value }];
  });
}

const RUM_ENDPOINT = '/api/rum';
const DEFAULT_SAMPLE_RATE = 1;

const RUM_METRICS = [
  'browser:first-contentful-paint',
  'vitals:lcp',
  'vitals:cls',
  'vitals:inp',
  'uc04:usable',
];

/**
 * ページを離れるときに計測値を送る。`?rum=1` のときだけ有効にする。
 *
 * モバイルでは pagehide が呼ばれないことがあるので、visibilitychange でも送る。
 */
export function installRum(recorder: PerfRecorder, params: URLSearchParams): void {
  const reporter = createRumReporter({
    sampleRate: Number(params.get('rumSample') ?? DEFAULT_SAMPLE_RATE),
    random: Math.random,
    send: (body) => navigator.sendBeacon(RUM_ENDPOINT, body),
  });
  let reported = false;

  const onLeave = (): void => {
    if (reported) {
      return;
    }
    reported = true;
    const context = {
      page: location.pathname,
      variant: params.get('variant') ?? 'default',
      segment: params.get('segment') ?? 'unknown',
    };
    for (const { metric, value } of pickLatestValues(recorder.snapshot(), RUM_METRICS)) {
      reporter.report({ ...context, metric, value });
    }
    reporter.flush();
  };

  window.addEventListener('pagehide', onLeave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      onLeave();
    }
  });
}
