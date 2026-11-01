import { type InteractionScenario, timeMetric, waitForSample } from '../scenario.ts';

const BUTTON_TEST_ID = 'run-scroll-test';
const DONE_SAMPLE = 'uc05:p95-frame';

export const uc05: InteractionScenario = {
  kind: 'interaction',
  id: 'uc05',
  title: '画像の多い一覧のスクロール',
  path: '/pages/uc05-scroll-list/',
  query: { count: '1000' },
  variants: ['bad', 'isolated', 'light', 'sized', 'lazy', 'good'],
  metrics: [
    timeMetric(DONE_SAMPLE),
    { ...timeMetric('uc05:dropped-frames'), unit: 'count' },
    { ...timeMetric('uc05:decoded-image-bytes'), unit: 'bytes' },
    {
      sample: 'browser:long-task',
      name: 'browser:long-task-total',
      aggregate: 'sum',
      unit: 'ms',
      optional: true,
      entryType: 'longtask',
    },
  ],
  async prepare(page) {
    await page.getByTestId(BUTTON_TEST_ID).focus();
  },
  async act(page) {
    await page.keyboard.press('Enter');
    await waitForSample(page, DONE_SAMPLE);
  },
};
