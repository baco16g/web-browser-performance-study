import { onCLS, onINP, onLCP } from 'web-vitals';
import { recorder } from './recorder.ts';

export function supportsEntryType(type: string): boolean {
  return (
    typeof PerformanceObserver !== 'undefined' &&
    PerformanceObserver.supportedEntryTypes.includes(type)
  );
}

/** Event Timing で指定できる下限。これより短い操作は記録されない */
const EVENT_DURATION_THRESHOLD_MS = 16;

type EntryHandler = (entry: PerformanceEntry) => void;

function observe(type: string, handler: EntryHandler, durationThreshold?: number): void {
  if (!supportsEntryType(type)) {
    return;
  }
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      handler(entry);
    }
  });
  observer.observe({
    type,
    buffered: true,
    ...(durationThreshold === undefined ? {} : { durationThreshold }),
  });
}

/** 応答の時間を、待ち、処理、表示までの3つに分けて記録する */
function recordEventTiming(entry: PerformanceEventTiming): void {
  // hover のように操作として扱わない入力は interactionId が 0 になる
  if (entry.interactionId === 0) {
    return;
  }
  const { name, startTime, processingStart, processingEnd, duration } = entry;
  recorder.record(`browser:${name}:input-delay`, processingStart - startTime);
  recorder.record(`browser:${name}:processing`, processingEnd - processingStart);
  recorder.record(`browser:${name}:presentation`, startTime + duration - processingEnd);
  recorder.record(`browser:${name}:duration`, duration);
}

/** 対象ブラウザが対応する分だけ PerformanceObserver を登録する */
export function installObservers(): void {
  observe('longtask', ({ duration }) => recorder.record('browser:long-task', duration));
  observe('long-animation-frame', ({ duration }) =>
    recorder.record('browser:long-animation-frame', duration),
  );
  observe('paint', ({ name, startTime }) => recorder.record(`browser:${name}`, startTime));
  observe(
    'event',
    (entry) => recordEventTiming(entry as PerformanceEventTiming),
    EVENT_DURATION_THRESHOLD_MS,
  );

  onINP(({ value }) => recorder.record('vitals:inp', value), { reportAllChanges: true });
  onLCP(({ value }) => recorder.record('vitals:lcp', value), { reportAllChanges: true });
  onCLS(({ value }) => recorder.record('vitals:cls', value, 'score'), { reportAllChanges: true });
}
