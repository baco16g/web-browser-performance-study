import { expect, type Page, test } from '@playwright/test';

const PAGE_PATH = '/pages/uc04-initial-load/?count=20&delay=0&variant=good&hud=0';

type Beacon = { metric: string; segment: string };

async function fetchBeacons(page: Page, segment: string): Promise<Beacon[]> {
  const response = await page.request.get('/api/rum');
  const { beacons }: { beacons: Beacon[] } = await response.json();
  return beacons.filter((beacon) => beacon.segment === segment);
}

async function loadAndLeave(page: Page, query: string): Promise<void> {
  await page.goto(`${PAGE_PATH}&${query}`);
  await expect(page.getByTestId('hero-image')).toBeVisible();
  await page.waitForFunction(() =>
    window.__perf.snapshot().some(({ name }) => name === 'uc04:usable'),
  );
  await page.goto('about:blank');
}

test('ページを離れると計測値を送る', async ({ page, browserName }) => {
  const segment = `e2e-sent-${browserName}`;
  await loadAndLeave(page, `rum=1&segment=${segment}`);

  await expect
    .poll(async () => (await fetchBeacons(page, segment)).map(({ metric }) => metric))
    .toContain('uc04:usable');
});

test('抽出から外れた読み込みは送らない', async ({ page, browserName }) => {
  const segment = `e2e-unsampled-${browserName}`;
  await loadAndLeave(page, `rum=1&rumSample=0&segment=${segment}`);

  await page.waitForTimeout(300);
  expect(await fetchBeacons(page, segment)).toEqual([]);
});

test('rum=1 を付けなければ送らない', async ({ page, browserName }) => {
  const segment = `e2e-disabled-${browserName}`;
  await loadAndLeave(page, `segment=${segment}`);

  await page.waitForTimeout(300);
  expect(await fetchBeacons(page, segment)).toEqual([]);
});
