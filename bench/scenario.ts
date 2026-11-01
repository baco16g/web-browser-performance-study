import type { Page } from '@playwright/test';
import type { Unit } from '../src/perf/recorder.ts';

const SAMPLE_POLLING_MS = 50;
const SAMPLE_TIMEOUT_MS = 120_000;

/** 1 回の操作で記録された計測値を、1 つの値にまとめる方法 */
export type SampleAggregate = 'first' | 'last' | 'max' | 'sum' | 'count';

export type SampleMetric = {
  /** ページ内の recorder に記録された名前 */
  sample: string;
  /** 結果に残す指標の名前 */
  name: string;
  aggregate: SampleAggregate;
  unit: Unit;
  /** 環境や処理の長さによって記録されないことがある指標 */
  optional: boolean;
};

/** 操作ごとに 1 件だけ記録される時間の指標 */
export function timeMetric(sample: string): SampleMetric {
  return { sample, name: sample, aggregate: 'first', unit: 'ms', optional: false };
}

/** 測れない環境や短い処理では記録されない時間の指標 */
export function optionalTimeMetric(sample: string): SampleMetric {
  return { ...timeMetric(sample), optional: true };
}

/** 帯域は Kbps で指定する。latency はリクエストごとに足される遅延 */
export type NetworkConditions = {
  latencyMs: number;
  downloadKbps: number;
  uploadKbps: number;
};

type ScenarioBase = {
  id: string;
  title: string;
  path: string;
  query: Record<string, string>;
  variants: readonly [string, ...string[]];
  metrics: readonly SampleMetric[];
  network?: NetworkConditions;
};

/** 開いたページの上で同じ操作を繰り返して測る */
export type InteractionScenario = ScenarioBase & {
  kind: 'interaction';
  /** 操作の前後で GC を実行し、回収されずに残った量を測る */
  forceGc?: boolean;
  /** ページを開いた後、最初の操作の前に 1 回だけ行う準備 */
  prepare(page: Page): Promise<void>;
  /** 操作を 1 回行い、完了するまで待つ。iteration は読み込みごとに 0 から数える */
  act(page: Page, iteration: number): Promise<void>;
};

/** キャッシュのない状態からの読み込みそのものを測る */
export type LoadScenario = ScenarioBase & {
  kind: 'load';
  /** 測りたいものがすべて記録されるまで待つ */
  waitUntilLoaded(page: Page): Promise<void>;
};

export type Scenario = InteractionScenario | LoadScenario;

/** ページ内で計測値が記録されるまで待つ。rAF でのポーリングはフレームを増やすのでタイマーにする */
export async function waitForSample(page: Page, sampleName: string): Promise<void> {
  await page.waitForFunction(
    // 読み込みの直後は、計測ライブラリの準備がまだ終わっていないことがある
    (name) => window.__perf?.snapshot().some((sample) => sample.name === name),
    sampleName,
    { polling: SAMPLE_POLLING_MS, timeout: SAMPLE_TIMEOUT_MS },
  );
}
