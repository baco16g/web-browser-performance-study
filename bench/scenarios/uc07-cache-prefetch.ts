import type { Page } from '@playwright/test';
import { type InteractionScenario, timeMetric, waitForSample } from '../scenario.ts';

/** 先読みが始まって終わるまで待つ時間。詳細を開く前にフォーカスがとどまる長さでもある */
const DWELL_MS = 600;
/** 通り過ぎるだけの項目にとどまる時間。先読みが始まる 150ms より短くする */
const PASS_THROUGH_MS = 50;

function tile(page: Page, index: number) {
  return page.getByTestId(`catalog-tile-${index}`);
}

export const uc07: InteractionScenario = {
  kind: 'interaction',
  id: 'uc07',
  title: '再表示と詳細の表示',
  path: '/pages/uc07-cache-prefetch/',
  query: { delay: '200' },
  variants: ['bad', 'revalidate', 'fresh', 'memory', 'good'],
  network: { latencyMs: 40, downloadKbps: 10_000, uploadKbps: 5_000 },
  metrics: [
    timeMetric('uc07:first-visit'),
    timeMetric('uc07:revisit'),
    {
      sample: 'uc07:transfer',
      name: 'uc07:transfer-total',
      aggregate: 'sum',
      unit: 'bytes',
      optional: false,
    },
    {
      sample: 'uc07:transfer',
      name: 'uc07:requests',
      aggregate: 'count',
      unit: 'count',
      optional: false,
    },
  ],
  async prepare(page) {
    await tile(page, 0).focus();
  },
  async act(page, iteration) {
    // 奇数番目の項目は通り過ぎるだけにして、先読みが空振りしないことも確かめる
    const passedIndex = iteration * 2;
    await tile(page, passedIndex).focus();
    await page.waitForTimeout(PASS_THROUGH_MS);

    await tile(page, passedIndex + 1).focus();
    await page.waitForTimeout(DWELL_MS);
    await page.keyboard.press('Enter');
    await waitForSample(page, 'uc07:first-visit');
    await page.keyboard.press('Escape');

    await page.waitForTimeout(DWELL_MS);
    await page.keyboard.press('Enter');
    await waitForSample(page, 'uc07:revisit');
    await page.keyboard.press('Escape');
  },
};
