import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Browser, type CDPSession, chromium, type Page } from '@playwright/test';
import type { Unit } from '../src/perf/recorder.ts';
import { createRunOrder } from './order.ts';
import { aggregateRuns, type MetricValues, type RunResult, type VariantResult } from './result.ts';
import type { Scenario } from './scenario.ts';

export const VIEWPORT = { width: 1280, height: 720 };

const SECONDS_TO_MS = 1_000;
const DONE_POLLING_MS = 50;
const DONE_TIMEOUT_MS = 120_000;

type CdpMetric = { source: string; name: string; unit: Unit; scale: number };

/** Performance.getMetrics の値は累計なので、操作の前後の差を取る */
const CDP_METRICS: readonly CdpMetric[] = [
  { source: 'LayoutCount', name: 'cdp:layout-count', unit: 'count', scale: 1 },
  { source: 'RecalcStyleCount', name: 'cdp:recalc-style-count', unit: 'count', scale: 1 },
  { source: 'LayoutDuration', name: 'cdp:layout-ms', unit: 'ms', scale: SECONDS_TO_MS },
  { source: 'RecalcStyleDuration', name: 'cdp:recalc-style-ms', unit: 'ms', scale: SECONDS_TO_MS },
  { source: 'ScriptDuration', name: 'cdp:script-ms', unit: 'ms', scale: SECONDS_TO_MS },
  { source: 'TaskDuration', name: 'cdp:task-ms', unit: 'ms', scale: SECONDS_TO_MS },
];

export type BenchOptions = {
  baseUrl: string;
  runs: number;
  warmupIterations: number;
  iterations: number;
  cpuThrottle: number;
  seed: number;
};

type OpenedPage = { page: Page; cdp: CDPSession; close(): Promise<void> };

function createPageUrl(scenario: Scenario, baseUrl: string, variant: string): string {
  // HUD の描画が計測値に混ざらないようにする
  const params = new URLSearchParams({ ...scenario.query, variant, hud: '0' });
  return `${baseUrl}${scenario.path}?${params}`;
}

async function openPage(
  browser: Browser,
  scenario: Scenario,
  options: BenchOptions,
  variant: string,
): Promise<OpenedPage> {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: options.cpuThrottle });
  await page.goto(createPageUrl(scenario, options.baseUrl, variant), { waitUntil: 'load' });
  await scenario.prepare(page);
  await page.evaluate(() => window.__perf.drain());
  return { page, cdp, close: () => context.close() };
}

async function readCdpMetrics(cdp: CDPSession): Promise<Map<string, number>> {
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

async function measureIteration(
  { page, cdp }: OpenedPage,
  scenario: Scenario,
): Promise<MetricValues> {
  await settle(page);
  const before = await readCdpMetrics(cdp);

  await scenario.act(page);
  await page.waitForFunction(
    (doneSample) => window.__perf.snapshot().some(({ name }) => name === doneSample),
    scenario.doneSample,
    { polling: DONE_POLLING_MS, timeout: DONE_TIMEOUT_MS },
  );

  const after = await readCdpMetrics(cdp);
  const samples = await page.evaluate(() => window.__perf.drain());

  const values: MetricValues = {};
  for (const { source, name, scale } of CDP_METRICS) {
    values[name] = ((after.get(source) ?? 0) - (before.get(source) ?? 0)) * scale;
  }
  for (const name of scenario.samples) {
    const sample = samples.find((candidate) => candidate.name === name);
    if (sample !== undefined) {
      values[name] = sample.value;
    }
  }
  return values;
}

async function measureRun(
  browser: Browser,
  scenario: Scenario,
  options: BenchOptions,
  variant: string,
  run: number,
): Promise<RunResult> {
  const opened = await openPage(browser, scenario, options, variant);
  try {
    // 初回だけの処理（JIT の準備など）を結果から除く
    for (let iteration = 0; iteration < options.warmupIterations; iteration += 1) {
      await measureIteration(opened, scenario);
    }
    const iterations: MetricValues[] = [];
    for (let iteration = 0; iteration < options.iterations; iteration += 1) {
      iterations.push(await measureIteration(opened, scenario));
    }
    return { run, iterations };
  } finally {
    await opened.close();
  }
}

export function collectUnits(scenario: Scenario): Record<string, Unit> {
  return Object.fromEntries([
    ...scenario.samples.map((name): [string, Unit] => [name, 'ms']),
    ...CDP_METRICS.map(({ name, unit }): [string, Unit] => [name, unit]),
  ]);
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

  const units = collectUnits(scenario);
  return Object.fromEntries(
    scenario.variants.map((variant) => {
      const runs = runsByVariant.get(variant) ?? [];
      return [variant, { runs, metrics: aggregateRuns(runs, units) }];
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
    const opened = await openPage(browser, scenario, options, variant);
    const path = resolve(outputDirectory, `${scenario.id}-${variant}.trace.json`);
    await settle(opened.page);
    await browser.startTracing(opened.page, { path, screenshots: true });
    await measureIteration(opened, scenario);
    await browser.stopTracing();
    await opened.close();
    paths.push(path);
  }

  return paths;
}

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch();
}
