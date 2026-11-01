import { findLastOf, lastOf } from '../shared/array.ts';
import { readHeapUsedBytes } from './memory.ts';
import { supportsEntryType } from './observers.ts';
import type { PerfRecorder, PerfSample } from './recorder.ts';
import { median } from './stats.ts';

const UPDATE_INTERVAL_MS = 500;
const RECENT_SAMPLES = 20;
const BYTES_PER_MEBIBYTE = 1024 ** 2;

type Row = { label: string; read: (samples: readonly PerfSample[]) => string };

function latest(samples: readonly PerfSample[], name: string): PerfSample | undefined {
  return findLastOf(samples, (sample) => sample.name === name);
}

function formatVital(samples: readonly PerfSample[], name: string, digits = 0): string {
  return latest(samples, name)?.value.toFixed(digits) ?? '-';
}

function formatInputLatency(samples: readonly PerfSample[]): string {
  const values = samples
    .filter(({ name }) => name.endsWith(':input-to-next-frame'))
    .slice(-RECENT_SAMPLES)
    .map(({ value }) => value);
  const last = lastOf(values);
  return last === undefined ? '-' : `${last.toFixed(1)} (中央値 ${median(values).toFixed(1)})`;
}

function formatEntries(samples: readonly PerfSample[], name: string, entryType: string): string {
  if (!supportsEntryType(entryType)) {
    return '非対応';
  }
  const durations = samples.filter((sample) => sample.name === name).map(({ value }) => value);
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  return `${durations.length} 件 / ${total.toFixed(0)}ms`;
}

function formatHeap(): string {
  const bytes = readHeapUsedBytes();
  return bytes === null ? '非対応' : `${(bytes / BYTES_PER_MEBIBYTE).toFixed(1)} MiB`;
}

const ROWS: readonly Row[] = [
  { label: '入力→次フレーム ms', read: formatInputLatency },
  {
    label: 'Long Task',
    read: (samples) => formatEntries(samples, 'browser:long-task', 'longtask'),
  },
  {
    label: 'LoAF',
    read: (samples) =>
      formatEntries(samples, 'browser:long-animation-frame', 'long-animation-frame'),
  },
  { label: 'INP ms', read: (samples) => formatVital(samples, 'vitals:inp') },
  { label: 'LCP ms', read: (samples) => formatVital(samples, 'vitals:lcp') },
  { label: 'CLS', read: (samples) => formatVital(samples, 'vitals:cls', 3) },
  { label: 'JS ヒープ', read: formatHeap },
];

/**
 * 計測値を画面の隅に表示する。
 *
 * 計測が結果に与える影響を抑えるため、React を使わず、更新も間引く。
 * `contain: strict` の箱の中だけを書き換え、ページ側のレイアウトに波及させない。
 */
export function mountHud(recorder: PerfRecorder): void {
  const hud = document.createElement('aside');
  hud.className = 'perf-hud';
  hud.setAttribute('aria-label', '計測値');

  const values = ROWS.map(({ label }) => {
    const term = document.createElement('dt');
    term.textContent = label;
    const value = document.createElement('dd');
    hud.append(term, value);
    return value;
  });

  const update = (): void => {
    const samples = recorder.snapshot();
    ROWS.forEach((row, index) => {
      const value = values[index];
      if (value !== undefined) {
        value.textContent = row.read(samples);
      }
    });
  };

  document.body.append(hud);
  update();
  setInterval(update, UPDATE_INTERVAL_MS);
}
