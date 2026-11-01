import { expect, type Page, test } from '@playwright/test';

/**
 * Safari 15.4 より前にない API を消して、古いエンジンを再現する。
 * ビルドの target は構文を変換するだけで、存在しない API は補わない。
 * 実際の古いエンジンとは違うので、ここで通っても実機の代わりにはならない。
 */
async function removeModernApis(page: Page): Promise<void> {
  await page.addInitScript(() => {
    for (const name of ['at', 'findLast', 'findLastIndex', 'toSorted']) {
      Reflect.deleteProperty(Array.prototype, name);
    }
    Reflect.deleteProperty(String.prototype, 'at');
    Reflect.deleteProperty(Object, 'hasOwn');
    Reflect.deleteProperty(window, 'structuredClone');
    Reflect.deleteProperty(window, 'scheduler');
    Object.defineProperty(PerformanceObserver, 'supportedEntryTypes', { value: [] });
  });
}

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', ({ message }) => errors.push(message));
  return errors;
}

test.beforeEach(async ({ page }) => {
  await removeModernApis(page);
});

test('API がなくても入力から次フレームまでを測れる', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('/pages/uc02-forced-layout/?count=20&variant=good');
  const hud = page.getByRole('complementary', { name: '計測値' });

  await page.getByTestId('change-text-size').click();

  await expect(hud).toContainText('中央値');
  await expect(hud).toContainText('非対応');
  expect(errors).toEqual([]);
});

test('scheduler.yield() がなくても処理を分割できる', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('/pages/uc03-search-input/?count=2000&variant=yield');
  await page.getByTestId('search-input').focus();

  await page.keyboard.type('product-1999');

  await expect(page.getByTestId('results')).toHaveAttribute('data-painted-query', 'product-1999');
  expect(errors).toEqual([]);
});

test('フォーカスの移動は API に依存しない', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('/pages/uc01-focus-grid/?count=60&variant=good');
  await expect(page.getByTestId('tile-0')).toBeFocused();

  await page.keyboard.press('ArrowRight');

  await expect(page.getByTestId('tile-1')).toBeFocused();
  expect(errors).toEqual([]);
});
