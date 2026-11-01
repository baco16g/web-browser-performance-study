import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { preview } from 'vite';
import {
  type BenchOptions,
  type BrowserName,
  launchBrowser,
  recordTraces,
  runScenario,
  VIEWPORT,
} from './harness.ts';
import { formatResultTable, readEnvironment } from './report.ts';
import type { BenchResult } from './result.ts';
import { SCENARIOS } from './scenarios/index.ts';

const PREVIEW_PORT = 4174;
const RESULTS_DIRECTORY = resolve(import.meta.dirname, 'results');

const { values } = parseArgs({
  options: {
    scenario: { type: 'string', default: 'uc02' },
    runs: { type: 'string', default: '5' },
    warmup: { type: 'string', default: '2' },
    iterations: { type: 'string', default: '5' },
    cpu: { type: 'string', default: '4' },
    seed: { type: 'string', default: '1' },
    trace: { type: 'boolean', default: false },
    label: { type: 'string', default: 'latest' },
    browser: { type: 'string', default: 'chromium' },
  },
});

function readCount(name: string, value: string): number {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`--${name} には 0 以上の整数を指定してください: ${value}`);
  }
  return count;
}

const scenario = SCENARIOS.find(({ id }) => id === values.scenario);
if (scenario === undefined) {
  const ids = SCENARIOS.map(({ id }) => id).join(', ');
  throw new Error(`シナリオ ${values.scenario} はありません。選べる値: ${ids}`);
}

function readBrowserName(value: string): BrowserName {
  if (value === 'chromium' || value === 'webkit') {
    return value;
  }
  throw new Error(`--browser には chromium か webkit を指定してください: ${value}`);
}

const browserName = readBrowserName(values.browser);

if (browserName !== 'chromium' && scenario.kind === 'interaction' && scenario.forceGc) {
  throw new Error(`${scenario.id} は GC の実行に CDP を使うので、Chromium でしか測れません`);
}
if (browserName !== 'chromium' && values.trace) {
  throw new Error('--trace は Chromium でしか使えません');
}

const server = await preview({ preview: { port: PREVIEW_PORT, strictPort: true } });
const browser = await launchBrowser(browserName);

try {
  const options: BenchOptions = {
    baseUrl: `http://localhost:${PREVIEW_PORT}`,
    runs: readCount('runs', values.runs),
    warmupIterations: readCount('warmup', values.warmup),
    iterations: readCount('iterations', values.iterations),
    cpuThrottle: readCount('cpu', values.cpu),
    seed: readCount('seed', values.seed),
  };

  const result: BenchResult = {
    scenario: scenario.id,
    title: scenario.title,
    createdAt: new Date().toISOString(),
    environment: readEnvironment(browser),
    conditions: {
      runs: options.runs,
      warmupIterations: options.warmupIterations,
      iterations: options.iterations,
      cpuThrottle: options.cpuThrottle,
      seed: options.seed,
      viewport: VIEWPORT,
      query: scenario.query,
    },
    variants: await runScenario(browser, scenario, options),
  };

  mkdirSync(RESULTS_DIRECTORY, { recursive: true });
  const path = resolve(RESULTS_DIRECTORY, `${scenario.id}-${values.label}.json`);
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`);

  console.log(`\n${formatResultTable(result)}\n\n保存先: ${path}`);

  if (values.trace) {
    const traces = await recordTraces(
      browser,
      scenario,
      options,
      resolve(RESULTS_DIRECTORY, 'traces'),
    );
    console.log(`トレース:\n${traces.join('\n')}`);
  }
} finally {
  await browser.close();
  await server.close();
}
