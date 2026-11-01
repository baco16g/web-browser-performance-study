import { expect, test } from '@playwright/test';

const PAGE_PATH = '/pages/uc07-cache-prefetch/?delay=0';

/** サーバー側の更新が再表示で見えるか。速さと引き換えに古い内容を見せる実装がある */
const SHOWS_UPDATE: Readonly<Record<string, boolean>> = {
  bad: true,
  revalidate: true,
  fresh: false,
  memory: false,
  good: false,
};

// 商品ごとの更新回数はサーバーで共有するので、実装とブラウザごとに別の商品を使う
const BROWSER_OFFSETS: Readonly<Record<string, number>> = { chromium: 0, webkit: 12 };

for (const [variantIndex, [variant, showsUpdate]] of Object.entries(SHOWS_UPDATE).entries()) {
  test.describe(variant, () => {
    test('詳細を開いて戻ると、元の項目にフォーカスが戻る', async ({ page }) => {
      await page.goto(`${PAGE_PATH}&variant=${variant}`);
      await page.getByTestId('catalog-tile-3').focus();
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('detail-revision')).toBeVisible();

      await page.keyboard.press('Escape');

      await expect(page.getByTestId('catalog-tile-3')).toBeFocused();
    });

    test(`サーバーの更新は再表示で${showsUpdate ? '見える' : '見えない'}`, async ({
      page,
      browserName,
    }) => {
      test.skip(
        browserName === 'webkit' && variant === 'fresh',
        'Playwright の WebKit では max-age を指定しても fetch の HTTP キャッシュが効かなかった',
      );
      const index = variantIndex + (BROWSER_OFFSETS[browserName] ?? 0);
      await page.goto(`${PAGE_PATH}&variant=${variant}`);
      const tile = page.getByTestId(`catalog-tile-${index}`);
      await tile.focus();
      await page.keyboard.press('Enter');
      const revision = page.getByTestId('detail-revision');
      const firstLabel = await revision.textContent();

      await page.keyboard.press('Escape');
      await page.request.post(`/api/catalog/product-${index}/revision`);
      await tile.focus();
      await page.keyboard.press('Enter');
      await expect(revision).toBeVisible();

      if (showsUpdate) {
        await expect(revision).not.toHaveText(firstLabel ?? '');
      } else {
        await expect(revision).toHaveText(firstLabel ?? '');
      }
    });
  });
}
