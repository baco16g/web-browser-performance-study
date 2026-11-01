import type { Page } from '@playwright/test';

/** 自動計測の 1 シナリオ。操作の中身だけを定義し、測り方は共通にする */
export type Scenario = {
  id: string;
  title: string;
  path: string;
  query: Record<string, string>;
  variants: readonly [string, ...string[]];
  /** このページ内の計測値が記録されたら、1 回の操作が終わったとみなす */
  doneSample: string;
  /** 結果に残すページ内の計測値 */
  samples: readonly string[];
  /** ページを開いた後、最初の操作の前に 1 回だけ行う準備 */
  prepare(page: Page): Promise<void>;
  /** 測りたい操作を 1 回行う */
  act(page: Page): Promise<void>;
};
