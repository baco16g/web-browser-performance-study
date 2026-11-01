import { expect, test } from '@playwright/test';

const PAGE_PATH = '/pages/uc04-initial-load/?count=200&delay=0';

for (const variant of ['bad', 'parallel', 'priority', 'reserved', 'early', 'good']) {
  test.describe(variant, () => {
    test('主要画像、バナー、商品の一覧がすべて表示される', async ({ page }) => {
      await page.goto(`${PAGE_PATH}&variant=${variant}`);

      await expect(page.getByTestId('hero-image')).toBeVisible();
      await expect(page.getByText('期間限定で送料が無料になります')).toBeVisible();
      await expect(page.getByTestId('catalog-list').locator('li')).toHaveCount(200);
    });
  });
}

test('先読みする画像は実際に表示する画像と同じ', async ({ page }) => {
  await page.goto(`${PAGE_PATH}&variant=early`);

  const preloaded = await page.locator('link[rel="preload"][as="image"]').getAttribute('href');
  const shown = await page.getByTestId('hero-image').getAttribute('src');
  expect(preloaded).toBe(shown);
});
