import { type InteractionScenario, waitForSample } from '../scenario.ts';

const BUTTON_TEST_ID = 'run-round-trips';
const DONE_SAMPLE = 'uc06:round-trips';

export const uc06: InteractionScenario = {
  kind: 'interaction',
  id: 'uc06',
  title: '一覧と詳細の往復で残るメモリ',
  path: '/pages/uc06-memory-growth/',
  query: {},
  variants: ['bad', 'listener', 'detached', 'good'],
  forceGc: true,
  metrics: [],
  async prepare(page) {
    await page.getByTestId(BUTTON_TEST_ID).focus();
  },
  async act(page) {
    await page.keyboard.press('Enter');
    await waitForSample(page, DONE_SAMPLE);
  },
};
