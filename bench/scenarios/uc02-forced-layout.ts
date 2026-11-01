import { type Scenario, timeMetric, waitForSample } from '../scenario.ts';

const BUTTON_TEST_ID = 'change-text-size';
const DONE_SAMPLE = 'uc02:input-to-next-frame';

export const uc02: Scenario = {
  kind: 'interaction',
  id: 'uc02',
  title: 'カードの高さ揃え',
  path: '/pages/uc02-forced-layout/',
  query: { count: '300' },
  variants: ['bad', 'good', 'css'],
  metrics: [timeMetric(DONE_SAMPLE), timeMetric('uc02:change-text-size')],
  async prepare(page) {
    await page.getByTestId(BUTTON_TEST_ID).focus();
  },
  async act(page) {
    // click() は事前の位置確認でレイアウトを起こすので、フォーカス済みのボタンをキーで押す
    await page.keyboard.press('Enter');
    await waitForSample(page, DONE_SAMPLE);
  },
};
