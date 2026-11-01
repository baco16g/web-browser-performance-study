import { expect, test } from '@playwright/test';

const PAGE_PATH = '/pages/uc02-forced-layout/?count=20';

for (const variant of ['bad', 'good', 'css']) {
  test(`${variant}: 同じ行のカードの高さが揃う`, async ({ page }) => {
    await page.goto(`${PAGE_PATH}&variant=${variant}`);
    await page.getByTestId('change-text-size').click();

    const heights = await page
      .getByTestId('card-grid')
      .locator('[data-card]')
      .evaluateAll((cards) => cards.slice(0, 5).map((card) => card.getBoundingClientRect().height));

    expect(new Set(heights).size).toBe(1);
  });
}

test('操作すると入力から次フレームまでの時間が HUD に出る', async ({ page }) => {
  await page.goto(PAGE_PATH);
  const hud = page.getByRole('complementary', { name: '計測値' });
  await expect(hud).toContainText('入力→次フレーム');

  await page.getByTestId('change-text-size').click();

  await expect(hud).toContainText('中央値');
});

test('hud=0 では HUD を出さない', async ({ page }) => {
  await page.goto(`${PAGE_PATH}&hud=0`);
  await expect(page.getByRole('complementary', { name: '計測値' })).toHaveCount(0);
});

test('実装を切り替えても件数の指定を保つ', async ({ page }) => {
  await page.goto(`${PAGE_PATH}&variant=bad`);
  await page.getByRole('link', { name: 'CSS に任せる' }).click();

  await expect(page).toHaveURL(/variant=css/);
  await expect(page).toHaveURL(/count=20/);
});
