import { expect, test } from '@playwright/test';

const PAGE_PATH = '/pages/uc01-focus-grid/?count=60';
const COLUMNS = 5;

for (const variant of ['bad', 'memo', 'store', 'transform', 'good']) {
  test.describe(variant, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`${PAGE_PATH}&variant=${variant}`);
      await expect(page.getByTestId('tile-0')).toBeFocused();
    });

    test('矢印キーで隣のタイルへ移動する', async ({ page }) => {
      await page.keyboard.press('ArrowRight');
      await expect(page.getByTestId('tile-1')).toBeFocused();

      await page.keyboard.press('ArrowDown');
      await expect(page.getByTestId(`tile-${1 + COLUMNS}`)).toBeFocused();
    });

    test('端では移動しない', async ({ page }) => {
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowUp');
      await expect(page.getByTestId('tile-0')).toBeFocused();
    });

    test('フォーカスできるタイルは常に 1 つだけ', async ({ page }) => {
      await page.keyboard.press('ArrowRight');
      await expect(page.getByTestId('tile-1')).toBeFocused();
      await expect(page.locator('[data-focused="true"]')).toHaveCount(1);
      await expect(page.locator('.tile[tabindex="0"]')).toHaveCount(1);
    });

    test('画面の外へ移動するとスクロールして見えるようにする', async ({ page }) => {
      const steps = 6;
      for (let step = 0; step < steps; step += 1) {
        await page.keyboard.press('ArrowDown');
      }
      const target = page.getByTestId(`tile-${steps * COLUMNS}`);
      await expect(target).toBeFocused();
      await expect(target).toBeInViewport();
    });
  });
}
