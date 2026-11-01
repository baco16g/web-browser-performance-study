import type { Page } from '@playwright/test';
import { optionalTimeMetric, type Scenario, timeMetric } from '../scenario.ts';

const INPUT_TEST_ID = 'search-input';
const SHORT_QUERY = '1';
const LONG_QUERY = '123';
/** 人が続けて打つ程度の間隔。連続入力のときの応答を測る */
const KEY_INTERVAL_MS = 40;

/**
 * 前のキーの処理を待たずに、一定の間隔でキーを押す。
 * keyboard.type() は処理の完了を待つので、メインスレッドが塞がっているときの待ちが再現できない。
 */
async function pressKeys(page: Page, keys: readonly string[]): Promise<void> {
  await Promise.all(
    keys.map(async (key, index) => {
      await page.waitForTimeout(index * KEY_INTERVAL_MS);
      await page.keyboard.press(key);
    }),
  );
}

async function waitForPaintedQuery(page: Page, query: string): Promise<void> {
  await page
    .getByTestId('results')
    .and(page.locator(`[data-painted-query="${query}"]`))
    .waitFor({ state: 'attached', timeout: 120_000 });
}

export const uc03: Scenario = {
  kind: 'interaction',
  id: 'uc03',
  title: '絞り込み中の入力',
  path: '/pages/uc03-search-input/',
  query: { count: '50000' },
  variants: ['bad', 'microtask', 'deferred', 'yield', 'worker'],
  metrics: [
    { ...timeMetric('uc03:input-to-next-frame'), aggregate: 'max' },
    { ...timeMetric('uc03:results-ready'), aggregate: 'last' },
    {
      sample: 'browser:long-task',
      name: 'browser:long-task-total',
      aggregate: 'sum',
      unit: 'ms',
      optional: true,
      entryType: 'longtask',
    },
    {
      sample: 'browser:long-task',
      name: 'browser:long-task-count',
      aggregate: 'count',
      unit: 'count',
      optional: true,
      entryType: 'longtask',
    },
    { ...optionalTimeMetric('browser:keydown:duration'), aggregate: 'max' },
    { ...optionalTimeMetric('uc03:worker-search'), aggregate: 'last' },
  ],
  async prepare(page) {
    await page.getByTestId(INPUT_TEST_ID).focus();
    await page.keyboard.press(SHORT_QUERY);
    await waitForPaintedQuery(page, SHORT_QUERY);
  },
  async act(page, iteration) {
    if (iteration % 2 === 0) {
      await pressKeys(page, ['2', '3']);
      await waitForPaintedQuery(page, LONG_QUERY);
      return;
    }
    await pressKeys(page, ['Backspace', 'Backspace']);
    await waitForPaintedQuery(page, SHORT_QUERY);
  },
};
