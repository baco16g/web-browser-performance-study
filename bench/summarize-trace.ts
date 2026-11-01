import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

type TraceEvent = {
  name: string;
  ph: string;
  dur?: number;
  args?: { beginData?: { stackTrace?: readonly object[] } };
};

const MICROSECONDS_PER_MS = 1_000;
const TRACES_DIRECTORY = resolve(import.meta.dirname, 'results/traces');

/** CDP の指標に出てこない描画の工程も、トレースからなら合計を取れる */
const EVENT_NAMES = [
  'FunctionCall',
  'RunMicrotasks',
  'UpdateLayoutTree',
  'Layout',
  'PrePaint',
  'Paint',
  'Layerize',
  'RasterTask',
  'ImageDecodeTask',
  'Decode Image',
] as const;

function readEvents(path: string): TraceEvent[] {
  const trace: { traceEvents: TraceEvent[] } = JSON.parse(readFileSync(path, 'utf8'));
  return trace.traceEvents;
}

function summarize(events: readonly TraceEvent[]): string[] {
  const rows = EVENT_NAMES.flatMap((name) => {
    const matched = events.filter((event) => event.name === name && event.ph === 'X');
    const totalMs = matched.reduce((total, { dur = 0 }) => total + dur, 0) / MICROSECONDS_PER_MS;
    return matched.length === 0
      ? []
      : [
          `  ${name.padEnd(18)} ${String(matched.length).padStart(6)} 回 ${totalMs.toFixed(1).padStart(9)}ms`,
        ];
  });
  const forcedLayouts = events.filter(
    ({ name, args }) => name === 'Layout' && (args?.beginData?.stackTrace?.length ?? 0) > 0,
  );
  return [...rows, `  強制されたレイアウト ${forcedLayouts.length} 回`];
}

const { values } = parseArgs({ options: { scenario: { type: 'string', default: '' } } });

const files = readdirSync(TRACES_DIRECTORY)
  .filter((file) => file.endsWith('.trace.json') && file.startsWith(values.scenario))
  .sort();

for (const file of files) {
  console.log(file.replace('.trace.json', ''));
  console.log(summarize(readEvents(resolve(TRACES_DIRECTORY, file))).join('\n'));
}
