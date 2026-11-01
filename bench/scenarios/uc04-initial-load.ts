import { type LoadScenario, optionalTimeMetric, timeMetric, waitForSample } from '../scenario.ts';

function lastTimeMetric(sample: string) {
  return { ...timeMetric(sample), aggregate: 'last' as const };
}

export const uc04: LoadScenario = {
  kind: 'load',
  id: 'uc04',
  title: '初期表示と操作可能になるまで',
  path: '/pages/uc04-initial-load/',
  query: { count: '2000', delay: '100' },
  variants: ['bad', 'parallel', 'priority', 'reserved', 'early', 'good'],
  network: { latencyMs: 40, downloadKbps: 10_000, uploadKbps: 5_000 },
  metrics: [
    timeMetric('browser:first-contentful-paint'),
    lastTimeMetric('vitals:lcp'),
    lastTimeMetric('vitals:lcp:ttfb'),
    lastTimeMetric('vitals:lcp:resource-load-delay'),
    lastTimeMetric('vitals:lcp:resource-load-duration'),
    lastTimeMetric('vitals:lcp:element-render-delay'),
    { ...lastTimeMetric('vitals:cls'), unit: 'score' },
    timeMetric('uc04:data-ready'),
    timeMetric('uc04:usable'),
    timeMetric('uc04:list-complete'),
    {
      sample: 'browser:long-task',
      name: 'browser:long-task-total',
      aggregate: 'sum',
      unit: 'ms',
      optional: false,
    },
    optionalTimeMetric('uc04:hero-loaded'),
  ],
  async waitUntilLoaded(page) {
    await waitForSample(page, 'uc04:list-complete');
    await waitForSample(page, 'uc04:hero-loaded');
    await waitForSample(page, 'uc04:banner-shown');
    await page.waitForLoadState('load');
  },
};
