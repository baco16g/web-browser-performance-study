import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { preview } from 'vite';
import type { RumBeacon } from '../src/perf/rum.ts';
import { type FieldRow, summarizeBeacons } from './field-summary.ts';
import { createThrottledPage, launchBrowser } from './harness.ts';
import { shuffle } from './order.ts';
import { readEnvironment } from './report.ts';
import { type NetworkConditions, waitForSample } from './scenario.ts';

const PREVIEW_PORT = 4181;
const BASE_URL = `http://localhost:${PREVIEW_PORT}`;
const RESULTS_DIRECTORY = resolve(import.meta.dirname, 'results');
const PAGE_PATH = '/pages/uc04-initial-load/';
const VARIANTS = ['bad', 'good'];
const METRICS = ['browser:first-contentful-paint', 'vitals:lcp', 'uc04:usable'];

type Segment = {
  name: string;
  /** 全体に占める利用者の割合 */
  share: number;
  cpuThrottle: number;
  network: NetworkConditions;
};

/** 架空の利用者の分類。割合と性能は説明のために決めた値で、実際の統計ではない */
const SEGMENTS: readonly Segment[] = [
  {
    name: 'fast',
    share: 0.6,
    cpuThrottle: 1,
    network: { latencyMs: 20, downloadKbps: 50_000, uploadKbps: 20_000 },
  },
  {
    name: 'middle',
    share: 0.3,
    cpuThrottle: 4,
    network: { latencyMs: 40, downloadKbps: 10_000, uploadKbps: 5_000 },
  },
  {
    name: 'slow',
    share: 0.1,
    cpuThrottle: 8,
    network: { latencyMs: 150, downloadKbps: 1_600, uploadKbps: 750 },
  },
];

const { values } = parseArgs({
  options: {
    sessions: { type: 'string', default: '30' },
    seed: { type: 'string', default: '1' },
  },
});

async function fetchBeacons(): Promise<RumBeacon[]> {
  const response = await fetch(`${BASE_URL}/api/rum`);
  const { beacons }: { beacons: RumBeacon[] } = await response.json();
  return beacons;
}

function formatRows(rows: readonly FieldRow[]): string {
  const lines = rows
    .filter(({ metric }) => METRICS.includes(metric))
    .sort((a, b) => a.group.localeCompare(b.group) || a.metric.localeCompare(b.metric))
    .map(
      ({ group, metric, count, p50, p75, p95 }) =>
        `| ${group} | ${metric} | ${count} | ${p50.toFixed(0)} | ${p75.toFixed(0)} | ${p95.toFixed(0)} |`,
    );
  return [
    '| 分類 | 指標 | 件数 | p50 | p75 | p95 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...lines,
  ].join('\n');
}

const sessionsPerVariant = Number(values.sessions);
const sessions = SEGMENTS.flatMap((segment) =>
  VARIANTS.flatMap((variant) =>
    Array.from({ length: Math.round(sessionsPerVariant * segment.share) }, () => ({
      segment,
      variant,
    })),
  ),
);
// 分類と実装が時間で偏らないように順番を混ぜる
const order = shuffle(sessions, Number(values.seed));

const server = await preview({ preview: { port: PREVIEW_PORT, strictPort: true } });
const browser = await launchBrowser();

try {
  await fetch(`${BASE_URL}/api/rum`, { method: 'DELETE' });

  for (const [position, { segment, variant }] of order.entries()) {
    console.log(`[${position + 1}/${order.length}] ${segment.name} ${variant}`);
    const opened = await createThrottledPage(browser, segment);
    const params = new URLSearchParams({
      variant,
      segment: segment.name,
      rum: '1',
      hud: '0',
    });
    await opened.page.goto(`${BASE_URL}${PAGE_PATH}?${params}`, { waitUntil: 'commit' });
    await waitForSample(opened.page, 'uc04:hero-loaded');
    await waitForSample(opened.page, 'uc04:list-complete');
    // 別のページへ移動すると pagehide が発生し、計測値が送られる
    await opened.page.goto('about:blank');
    await opened.close();
  }

  const beacons = await fetchBeacons();
  const summaries = {
    byVariant: summarizeBeacons(beacons, ({ variant }) => variant),
    bySegment: summarizeBeacons(beacons, ({ variant, segment }) => `${variant} ${segment}`),
  };

  mkdirSync(RESULTS_DIRECTORY, { recursive: true });
  const path = resolve(RESULTS_DIRECTORY, 'field-latest.json');
  const result = {
    createdAt: new Date().toISOString(),
    environment: readEnvironment(browser),
    segments: SEGMENTS,
    sessionsPerVariant,
    seed: Number(values.seed),
    expectedSessions: sessions.length,
    summaries,
  };
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`);

  console.log(`\n実装ごと\n${formatRows(summaries.byVariant)}`);
  console.log(`\n実装と分類ごと\n${formatRows(summaries.bySegment)}`);
  console.log(`\n受信 ${beacons.length} 件、保存先: ${path}`);
} finally {
  await browser.close();
  await server.close();
}
