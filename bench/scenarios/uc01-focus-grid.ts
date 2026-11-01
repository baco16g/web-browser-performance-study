import { optionalTimeMetric, type Scenario, timeMetric, waitForSample } from '../scenario.ts';

const DONE_SAMPLE = 'uc01:tile-renders';

export const uc01: Scenario = {
  kind: 'interaction',
  id: 'uc01',
  title: '十字キーのフォーカス移動',
  path: '/pages/uc01-focus-grid/',
  query: { count: '3000' },
  variants: ['bad', 'memo', 'store', 'transform', 'good'],
  metrics: [
    timeMetric('uc01:input-to-next-frame'),
    { ...timeMetric(DONE_SAMPLE), unit: 'count' },
    optionalTimeMetric('uc01:react-actual'),
    optionalTimeMetric('uc01:react-base'),
    optionalTimeMetric('browser:keydown:input-delay'),
    optionalTimeMetric('browser:keydown:processing'),
    optionalTimeMetric('browser:keydown:presentation'),
    optionalTimeMetric('browser:keydown:duration'),
  ],
  async prepare(page) {
    await page.getByTestId('tile-0').focus();
  },
  async act(page, iteration) {
    // 左右を往復し、スクロールが混ざらない位置で測る
    await page.keyboard.press(iteration % 2 === 0 ? 'ArrowRight' : 'ArrowLeft');
    await waitForSample(page, DONE_SAMPLE);
  },
};
