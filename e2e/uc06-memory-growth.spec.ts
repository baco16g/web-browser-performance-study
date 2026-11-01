import { expect, test } from '@playwright/test';

const PAGE_PATH = '/pages/uc06-memory-growth/';

for (const variant of ['bad', 'listener', 'detached', 'good']) {
  test.describe(variant, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`${PAGE_PATH}?variant=${variant}`);
    });

    test('一覧から詳細を開いて戻れる', async ({ page }) => {
      await page.getByTestId('product-list').getByRole('button').first().click();
      await expect(page.getByTestId('detail')).toBeVisible();

      await page.getByTestId('back-to-list').click();

      await expect(page.getByTestId('product-list')).toBeVisible();
    });

    test('自動の往復が最後まで終わり、一覧へ戻る', async ({ page }) => {
      await page.getByTestId('run-round-trips').click();

      await page.waitForFunction(() =>
        window.__perf.snapshot().some(({ name }) => name === 'uc06:round-trips'),
      );
      await expect(page.getByTestId('product-list')).toBeVisible();
    });
  });
}
