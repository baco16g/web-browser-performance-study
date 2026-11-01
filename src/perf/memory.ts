type ChromiumMemoryInfo = { usedJSHeapSize: number };
type PerformanceWithMemory = Performance & { memory?: ChromiumMemoryInfo };

/** Chromium の非標準 API で JS ヒープの使用量を読む。対応していなければ null を返す */
export function readHeapUsedBytes(): number | null {
  const { memory } = performance as PerformanceWithMemory;
  return memory?.usedJSHeapSize ?? null;
}
