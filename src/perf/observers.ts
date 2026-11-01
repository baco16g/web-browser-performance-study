import { onCLS, onINP, onLCP } from 'web-vitals';
import { recorder } from './recorder.ts';

export function supportsEntryType(type: string): boolean {
  return (
    typeof PerformanceObserver !== 'undefined' &&
    PerformanceObserver.supportedEntryTypes.includes(type)
  );
}

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

/** 対象ブラウザが対応する分だけ PerformanceObserver を登録する */
export function installObservers(): void {
  observe('longtask', ({ duration }) => recorder.record('browser:long-task', duration));
  observe('long-animation-frame', ({ duration }) =>
    recorder.record('browser:long-animation-frame', duration),
  );
  observe('paint', ({ name, startTime }) => recorder.record(`browser:${name}`, startTime));

  onINP(({ value }) => recorder.record('vitals:inp', value), { reportAllChanges: true });
  onLCP(({ value }) => recorder.record('vitals:lcp', value), { reportAllChanges: true });
  onCLS(({ value }) => recorder.record('vitals:cls', value, 'score'), { reportAllChanges: true });
}
