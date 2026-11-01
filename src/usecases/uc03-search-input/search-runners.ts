import { recorder } from '../../perf/recorder.ts';
import type { Product } from '../../shared/products.ts';
import {
  CHUNK_SIZE,
  type Match,
  normalizeQuery,
  scoreRange,
  searchProducts,
  takeTopMatches,
} from './search.ts';
import type { SearchRequest, SearchResponse } from './search.worker.ts';

/** 検索を実行し、最新の検索が終わったら結果を渡す */
export type SearchRunner = (query: string, onDone: (indices: number[]) => void) => void;

/** 遅い実装。入力のハンドラの中で全件を処理する */
export function createSyncRunner(products: readonly Product[]): SearchRunner {
  return (query, onDone) => onDone(searchProducts(products, query));
}

type Pause = () => Promise<void>;

/** 少しずつ処理し、区切りごとに pause を待つ。新しい検索が始まったら古い検索を打ち切る */
function createChunkedRunner(products: readonly Product[], pause: Pause): SearchRunner {
  let latestRequest = 0;

  return (query, onDone) => {
    latestRequest += 1;
    const request = latestRequest;
    const normalizedQuery = normalizeQuery(query);
    const matches: Match[] = [];

    void (async () => {
      for (let start = 0; start < products.length; start += CHUNK_SIZE) {
        scoreRange(products, normalizedQuery, start, start + CHUNK_SIZE, matches);
        await pause();
        if (request !== latestRequest) {
          return;
        }
      }
      onDone(takeTopMatches(matches));
    })();
  };
}

/** Promise で区切るだけの実装。マイクロタスクは描画や入力より先に実行されるので固まったままになる */
export function createMicrotaskRunner(products: readonly Product[]): SearchRunner {
  return createChunkedRunner(products, () => Promise.resolve());
}

function yieldToMain(): Promise<void> {
  if ('scheduler' in globalThis && 'yield' in scheduler) {
    return scheduler.yield();
  }
  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => {
      port1.close();
      resolve();
    };
    port2.postMessage(null);
  });
}

/** 区切りごとにメインスレッドを明け渡す実装 */
export function createYieldingRunner(products: readonly Product[]): SearchRunner {
  return createChunkedRunner(products, yieldToMain);
}

/** 別スレッドで検索する実装。古い検索の結果は捨てる */
export function createWorkerRunner(count: number): SearchRunner {
  const worker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' });
  let latestRequest = 0;
  let onLatestDone: (indices: number[]) => void = () => {};

  worker.onmessage = ({ data }: MessageEvent<SearchResponse>) => {
    recorder.record('uc03:worker-search', data.durationMs);
    if (data.requestId === latestRequest) {
      onLatestDone(data.indices);
    }
  };

  return (query, onDone) => {
    latestRequest += 1;
    onLatestDone = onDone;
    const request: SearchRequest = { requestId: latestRequest, query, count };
    worker.postMessage(request);
  };
}
