import { expect, test } from '@playwright/test';

const PAGE_PATH = '/pages/uc05-scroll-list/?count=100';

for (const variant of ['bad', 'isolated', 'light', 'sized', 'lazy', 'good']) {
  test.describe(variant, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`${PAGE_PATH}&variant=${variant}`);
    });

    test('最初の商品が表示される', async ({ page }) => {
      const firstTile = page.getByTestId('list-scroller').locator('article').first();
      await expect(firstTile).toBeVisible();
      await expect(firstTile.locator('img')).toHaveJSProperty('complete', true);
    });

    test('スクロールすると先の商品が表示され、行番号が更新される', async ({ page }) => {
      await page.getByTestId('list-scroller').evaluate((scroller) => {
        scroller.scrollTop = scroller.scrollHeight;
      });

      await expect(page.getByTestId('list-scroller').locator('article').last()).toBeInViewport();
      await expect(page.getByTestId('row-label')).toContainText('20 行目');
    });

    test('自動スクロールの後もボタンにフォーカスが残り、続けて実行できる', async ({ page }) => {
      const button = page.getByTestId('run-scroll-test');
      await button.focus();
      await page.keyboard.press('Enter');

      await page.waitForFunction(() =>
        window.__perf.snapshot().some(({ name }) => name === 'uc05:p95-frame'),
      );
      await expect(button).toBeFocused();
    });
  });
}
