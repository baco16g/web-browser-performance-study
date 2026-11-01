import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Browser, type CDPSession, chromium, type Page, webkit } from '@playwright/test';
import type { Unit } from '../src/perf/recorder.ts';
import { createRunOrder } from './order.ts';
import {
  aggregateRuns,
  aggregateSamples,
  type MetricDefinition,
  type MetricValues,
  type RunResult,
  type VariantResult,
} from './result.ts';
import type { InteractionScenario, LoadScenario, NetworkConditions, Scenario } from './scenario.ts';

export const VIEWPORT = { width: 1280, height: 720 };

const SECONDS_TO_MS = 1_000;
/** PerformanceObserver の通知は描画の後に届くので、集計の前に少し待つ */
const OBSERVER_FLUSH_MS = 100;

type CdpMetric = { source: string; name: string; unit: Unit; scale: number };

const BYTES_PER_KILOBIT = 125;

/** 回数と時間は累計で返ってくるので、操作の前後の差を取る */
const CDP_METRICS: readonly CdpMetric[] = [
  { source: 'LayoutCount', name: 'cdp:layout-count', unit: 'count', scale: 1 },
  { source: 'RecalcStyleCount', name: 'cdp:recalc-style-count', unit: 'count', scale: 1 },
  { source: 'LayoutDuration', name: 'cdp:layout-ms', unit: 'ms', scale: SECONDS_TO_MS },
  { source: 'RecalcStyleDuration', name: 'cdp:recalc-style-ms', unit: 'ms', scale: SECONDS_TO_MS },
  { source: 'ScriptDuration', name: 'cdp:script-ms', unit: 'ms', scale: SECONDS_TO_MS },
  { source: 'TaskDuration', name: 'cdp:task-ms', unit: 'ms', scale: SECONDS_TO_MS },
];

/** 量はその時点の値を読む */
const CDP_GAUGES: readonly CdpMetric[] = [
  { source: 'Nodes', name: 'cdp:dom-nodes', unit: 'count', scale: 1 },
  { source: 'JSHeapUsedSize', name: 'cdp:js-heap-used', unit: 'bytes', scale: 1 },
];

/** GC の後に測ったときだけ意味を持つ、回収されずに残った量 */
const CDP_RETAINED_METRICS: readonly CdpMetric[] = [
  { source: 'JSHeapUsedSize', name: 'cdp:retained-heap', unit: 'bytes', scale: 1 },
  { source: 'Nodes', name: 'cdp:retained-nodes', unit: 'count', scale: 1 },
  { source: 'JSEventListeners', name: 'cdp:retained-listeners', unit: 'count', scale: 1 },
];

export type BenchOptions = {
  baseUrl: string;
  runs: number;
  warmupIterations: number;
  iterations: number;
  cpuThrottle: number;
  seed: number;
};

/** cdp は Chromium でだけ使える。他のブラウザではページ内の計測値だけを集める */
type OpenedPage = { page: Page; cdp: CDPSession | null; close(): Promise<void> };

function createPageUrl(scenario: Scenario, baseUrl: string, variant: string): string {
  // HUD の描画が計測値に混ざらないようにする
  const params = new URLSearchParams({ ...scenario.query, variant, hud: '0' });
  return `${baseUrl}${scenario.path}?${params}`;
}

type DeviceConditions = { cpuThrottle: number; network?: NetworkConditions | undefined };

/** 新しいコンテキストを作り、計測の条件を設定する。ページはまだ開かない */
export async function createThrottledPage(
  browser: Browser,
  { cpuThrottle, network }: DeviceConditions,
): Promise<OpenedPage> {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const close = () => context.close();

  if (browser.browserType().name() !== 'chromium') {
    if (cpuThrottle !== 1 || network !== undefined) {
      throw new Error('CPU と通信の制限は Chromium でしか使えません');
    }
    return { page, cdp: null, close };
  }

  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
  if (network !== undefined) {
    const { latencyMs, downloadKbps, uploadKbps } = network;
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: latencyMs,
      downloadThroughput: downloadKbps * BYTES_PER_KILOBIT,
      uploadThroughput: uploadKbps * BYTES_PER_KILOBIT,
    });
  }
  return { page, cdp, close };
}

function toConditions(scenario: Scenario, { cpuThrottle }: BenchOptions): DeviceConditions {
  return { cpuThrottle, network: scenario.network };
}

async function openInteractionPage(
  browser: Browser,
  scenario: InteractionScenario,
  options: BenchOptions,
  variant: string,
): Promise<OpenedPage> {
  const opened = await createThrottledPage(browser, toConditions(scenario, options));
  await opened.page.goto(createPageUrl(scenario, options.baseUrl, variant), { waitUntil: 'load' });
  await scenario.prepare(opened.page);
  await opened.page.evaluate(() => window.__perf.drain());
  return opened;
}

async function readCdpMetrics(cdp: CDPSession | null): Promise<Map<string, number>> {
  if (cdp === null) {
    return new Map();
  }
  const { metrics } = await cdp.send('Performance.getMetrics');
  return new Map(metrics.map(({ name, value }) => [name, value]));
}

/** 直前の操作の描画が終わるまで待つ */
async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => setTimeout(resolve));
      }),
  );
}

function hasForcedGc(scenario: Scenario): boolean {
  return scenario.kind === 'interaction' && scenario.forceGc === true;
}

async function readCdpMetricsAfterGc(
  cdp: CDPSession | null,
  scenario: Scenario,
): Promise<Map<string, number>> {
  if (cdp !== null && hasForcedGc(scenario)) {
    await cdp.send('HeapProfiler.collectGarbage');
  }
  return readCdpMetrics(cdp);
}

async function collectValues(
  { page, cdp }: OpenedPage,
  scenario: Scenario,
  before: ReadonlyMap<string, number>,
  after: ReadonlyMap<string, number>,
): Promise<MetricValues> {
  await settle(page);
  await page.waitForTimeout(OBSERVER_FLUSH_MS);
  const samples = await page.evaluate(() => window.__perf.drain());
  const supportedEntryTypes = await page.evaluate(() => [
    ...PerformanceObserver.supportedEntryTypes,
  ]);

  const values: MetricValues = {};
  if (cdp !== null) {
    const deltaMetrics = hasForcedGc(scenario)
      ? [...CDP_METRICS, ...CDP_RETAINED_METRICS]
      : CDP_METRICS;
    for (const { source, name, scale } of deltaMetrics) {
      values[name] = ((after.get(source) ?? 0) - (before.get(source) ?? 0)) * scale;
    }
    for (const { source, name, scale } of CDP_GAUGES) {
      values[name] = (after.get(source) ?? 0) * scale;
    }
  }
  for (const metric of scenario.metrics) {
    // 対応していない計測値は、0 件ではなく値なしとして扱う
    if (metric.entryType !== undefined && !supportedEntryTypes.includes(metric.entryType)) {
      continue;
    }
    const value = aggregateSamples(samples, metric);
    if (value !== undefined) {
      values[metric.name] = value;
    }
  }
  return values;
}

async function measureIteration(
  opened: OpenedPage,
  scenario: InteractionScenario,
  iteration: number,
): Promise<MetricValues> {
  await settle(opened.page);
  const before = await readCdpMetricsAfterGc(opened.cdp, scenario);
  await scenario.act(opened.page, iteration);
  await settle(opened.page);
  const after = await readCdpMetricsAfterGc(opened.cdp, scenario);
  return collectValues(opened, scenario, before, after);
}

async function measureInteractionRun(
  browser: Browser,
  scenario: InteractionScenario,
  options: BenchOptions,
  variant: string,
  run: number,
): Promise<RunResult> {
  const opened = await openInteractionPage(browser, scenario, options, variant);
  try {
    // 初回だけの処理（JIT の準備など）を結果から除く
    for (let iteration = 0; iteration < options.warmupIterations; iteration += 1) {
      await measureIteration(opened, scenario, iteration);
    }
    const iterations: MetricValues[] = [];
    for (let iteration = 0; iteration < options.iterations; iteration += 1) {
      iterations.push(
        await measureIteration(opened, scenario, options.warmupIterations + iteration),
      );
    }
    return { run, iterations };
  } finally {
    await opened.close();
  }
}

/** 読み込みは 1 回で完結するので、空打ちと繰り返しは行わない */
async function measureLoad(
  opened: OpenedPage,
  scenario: LoadScenario,
  options: BenchOptions,
  variant: string,
): Promise<MetricValues> {
  await opened.page.goto(createPageUrl(scenario, options.baseUrl, variant), {
    waitUntil: 'commit',
  });
  await scenario.waitUntilLoaded(opened.page);
  const after = await readCdpMetrics(opened.cdp);
  return collectValues(opened, scenario, new Map(), after);
}

async function measureRun(
  browser: Browser,
  scenario: Scenario,
  options: BenchOptions,
  variant: string,
  run: number,
): Promise<RunResult> {
  if (scenario.kind === 'interaction') {
    return measureInteractionRun(browser, scenario, options, variant, run);
  }
  const opened = await createThrottledPage(browser, toConditions(scenario, options));
  try {
    return { run, iterations: [await measureLoad(opened, scenario, options, variant)] };
  } finally {
    await opened.close();
  }
}

function collectDefinitions(scenario: Scenario, usesCdp: boolean): MetricDefinition[] {
  const cdpMetrics = [
    ...CDP_METRICS,
    ...CDP_GAUGES,
    ...(hasForcedGc(scenario) ? CDP_RETAINED_METRICS : []),
  ];
  return [
    ...scenario.metrics.map(({ name, unit, optional }) => ({ name, unit, optional })),
    ...(usesCdp ? cdpMetrics : []).map(({ name, unit }) => ({ name, unit, optional: false })),
  ];
}

export async function runScenario(
  browser: Browser,
  scenario: Scenario,
  options: BenchOptions,
): Promise<Record<string, VariantResult>> {
  const order = createRunOrder(scenario.variants, options.runs, options.seed);
  const runsByVariant = new Map<string, RunResult[]>();

  for (const [index, { variant, run }] of order.entries()) {
    console.log(`[${index + 1}/${order.length}] ${scenario.id} ${variant} run ${run + 1}`);
    const result = await measureRun(browser, scenario, options, variant, run);
    runsByVariant.set(variant, [...(runsByVariant.get(variant) ?? []), result]);
  }

  const usesCdp = browser.browserType().name() === 'chromium';
  const definitions = collectDefinitions(scenario, usesCdp);
  return Object.fromEntries(
    scenario.variants.map((variant) => {
      const runs = runsByVariant.get(variant) ?? [];
      return [variant, { runs, metrics: aggregateRuns(runs, definitions) }];
    }),
  );
}

/**
 * Performance パネルに読み込めるトレースを保存する。
 * トレース自体が処理を遅くするので、時間を測る実行とは分けて取る。
 */
export async function recordTraces(
  browser: Browser,
  scenario: Scenario,
  options: BenchOptions,
  outputDirectory: string,
): Promise<string[]> {
  mkdirSync(outputDirectory, { recursive: true });
  const paths: string[] = [];

  for (const variant of scenario.variants) {
    const path = resolve(outputDirectory, `${scenario.id}-${variant}.trace.json`);
    if (scenario.kind === 'load') {
      const opened = await createThrottledPage(browser, toConditions(scenario, options));
      await browser.startTracing(opened.page, { path, screenshots: true });
      await measureLoad(opened, scenario, options, variant);
      await browser.stopTracing();
      await opened.close();
    } else {
      const opened = await openInteractionPage(browser, scenario, options, variant);
      await settle(opened.page);
      await browser.startTracing(opened.page, { path, screenshots: true });
      await measureIteration(opened, scenario, 0);
      await browser.stopTracing();
      await opened.close();
    }
    paths.push(path);
  }

  return paths;
}

export type BrowserName = 'chromium' | 'webkit';

export async function launchBrowser(name: BrowserName = 'chromium'): Promise<Browser> {
  return name === 'webkit' ? webkit.launch() : chromium.launch();
}
