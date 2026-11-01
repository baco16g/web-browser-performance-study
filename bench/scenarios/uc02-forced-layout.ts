import type { Scenario } from '../scenario.ts';

const BUTTON_TEST_ID = 'change-text-size';

export const uc02: Scenario = {
  id: 'uc02',
  title: 'カードの高さ揃え',
  path: '/pages/uc02-forced-layout/',
  query: { count: '300' },
  variants: ['bad', 'good', 'css'],
  doneSample: 'uc02:input-to-next-frame',
  samples: ['uc02:input-to-next-frame', 'uc02:change-text-size'],
  async prepare(page) {
    await page.getByTestId(BUTTON_TEST_ID).focus();
  },
  async act(page) {
    // click() は事前の位置確認でレイアウトを起こすので、フォーカス済みのボタンをキーで押す
    await page.keyboard.press('Enter');
  },
};
