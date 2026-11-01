import { expect, test } from '@playwright/test';

const PAGE_PATH = '/pages/uc03-search-input/?count=2000';

for (const variant of ['bad', 'microtask', 'deferred', 'yield', 'worker']) {
  test.describe(variant, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`${PAGE_PATH}&variant=${variant}`);
      await page.getByTestId('search-input').focus();
    });

    test('入力した語で絞り込む', async ({ page }) => {
      await page.keyboard.type('product-1999');

      await expect(page.getByTestId('search-input')).toHaveValue('product-1999');
      await expect(page.getByTestId('results')).toHaveAttribute(
        'data-painted-query',
        'product-1999',
      );
      await expect(page.getByTestId('results').locator('li').first()).toContainText('product-1999');
    });

    test('続けて入力すると最後の語の結果だけが残る', async ({ page }) => {
      await page.keyboard.type('zzz');
      await expect(page.getByTestId('results')).toHaveAttribute('data-painted-query', 'zzz');
      await expect(page.getByTestId('result-count')).toHaveText('0 件');

      await page.keyboard.press('Backspace');
      await page.keyboard.press('Backspace');
      await page.keyboard.press('Backspace');
      await expect(page.getByTestId('result-count')).toHaveText('検索語を入力してください');
    });
  });
}
