import { recorder } from './recorder.ts';

/**
 * 同期処理の時間を User Timing で記録する。
 *
 * 記録は DevTools の Timings トラックにも出る。この値に含まれるのは処理の間だけで、
 * 処理の後に行われるスタイル計算やレイアウト、描画は含まない。
 */
export function measureSync<T>(name: string, task: () => T): T {
  const start = performance.now();
  try {
    return task();
  } finally {
    const { duration } = performance.measure(name, { start, end: performance.now() });
    recorder.record(name, duration);
  }
}

/**
 * 入力が起きてから、次のフレームのメインスレッドの仕事が終わるまでの時間を記録する。
 *
 * requestAnimationFrame は描画の直前に呼ばれるので、そこからタスクを 1 つ積むと、
 * 描画が終わった後に実行される。setTimeout は遅延が丸められるので MessageChannel を使う。
 * ラスタライズ、合成、表示装置の遅延は含まない近似値である。
 */
export function recordNextFrame(name: string, inputEvent: Event): void {
  const start = inputEvent.timeStamp;
  requestAnimationFrame(() => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => {
      recorder.record(name, performance.now() - start);
      port1.close();
    };
    port2.postMessage(null);
  });
}
